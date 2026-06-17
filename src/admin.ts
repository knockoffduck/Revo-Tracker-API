/**
 * Admin module — diagnostic endpoints for the Revo-Tracker admin dashboard.
 * Provides:
 *   - SSE streaming wrappers around the existing API endpoints
 *   - File-system log/report access
 *   - CLI script execution (cookies, audit)
 *   - Server stdout/stderr streaming
 *
 * Auth: requests must either come from loopback (default; configurable via
 * ADMIN_ALLOW_LOOPBACK=0) or present ADMIN_TOKEN via Authorization header
 * or ?token=... query.
 */

import { Hono } from "hono";
import { file } from "bun";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { progressBus, sseResponse, subscribe, type ProgressEvent } from "./utils/progress";
import {
	streamingStatsUpdate,
	streamingUpdateGyms,
	streamingLatestStats,
	streamingTrendGenerate,
} from "./utils/streaming";
import { runScript, type ScriptOptions } from "./utils/scriptRunner";

const app = new Hono();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const ALLOW_LOOPBACK = (process.env.ADMIN_ALLOW_LOOPBACK ?? "1") !== "0";

const isLocalhost = (req: Request) => {
	const fwd = req.headers.get("x-forwarded-for") ?? "";
	const ip = fwd.split(",")[0]?.trim();
	const host = req.headers.get("host") ?? "";
	const candidates = [
		ip,
		...(req.headers.get("x-real-ip") ? [req.headers.get("x-real-ip")!] : []),
		host,
	].filter(Boolean) as string[];
	return candidates.some(
		(c) =>
			c === "127.0.0.1" ||
			c === "::1" ||
			c === "localhost" ||
			c === "::ffff:127.0.0.1" ||
			/^localhost(:\d+)?$/.test(c),
	);
};

const isAuthorized = (req: Request) => {
	if (ALLOW_LOOPBACK && isLocalhost(req)) return true;
	if (ADMIN_TOKEN) {
		const auth = req.headers.get("authorization") ?? "";
		if (auth === `Bearer ${ADMIN_TOKEN}`) return true;
		const queryToken = new URL(req.url).searchParams.get("token");
		if (queryToken && queryToken === ADMIN_TOKEN) return true;
	}
	return false;
};

app.use("*", async (c, next) => {
	if (!isAuthorized(c.req.raw)) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}
	await next();
});

// ============ Log access ============

app.get("/admin/logs/scrape", async (c) => {
	try {
		const f = file("logs/updated_stats.json");
		const exists = await f.exists();
		if (!exists) {
			return c.json({ success: true, data: [] });
		}
		const text = await f.text();
		const data = JSON.parse(text);
		return c.json({ success: true, data });
	} catch (err) {
		return c.json({ success: false, error: (err as Error).message }, 500);
	}
});

app.get("/admin/logs/reports", async (c) => {
	try {
		const dir = resolve(process.cwd(), "reports");
		const entries = await readdir(dir);
		const out: Array<{
			filename: string;
			generatedAt: string;
			mode: "dry-run" | "apply";
			summary: unknown;
			proposalCount: number;
		}> = [];
		for (const filename of entries) {
			if (!filename.endsWith(".json")) continue;
			try {
				const content = await readFile(join(dir, filename), "utf-8");
				const json = JSON.parse(content);
				out.push({
					filename,
					generatedAt: json.generatedAt,
					mode: json.mode,
					summary: json.summary,
					proposalCount: (json.proposals ?? []).length,
				});
			} catch {
				// skip malformed file
			}
		}
		out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
		return c.json({ success: true, data: out });
	} catch (err) {
		return c.json({ success: false, error: (err as Error).message }, 500);
	}
});

app.get("/admin/logs/reports/:name", async (c) => {
	const name = c.req.param("name");
	if (!/^[\w\-.]+\.json$/.test(name)) {
		return c.json({ success: false, error: "Invalid filename" }, 400);
	}
	try {
		const dir = resolve(process.cwd(), "reports");
		const filepath = join(dir, name);
		const stats = await stat(filepath);
		if (!stats.isFile()) {
			return c.json({ success: false, error: "Not a file" }, 404);
		}
		const content = await readFile(filepath, "utf-8");
		return c.json({ success: true, data: JSON.parse(content) });
	} catch (err) {
		return c.json({ success: false, error: (err as Error).message }, 404);
	}
});

// ============ Server log stream (SSE) ============
// Captures the current process's stdout/stderr by wrapping console.* and
// piping it to subscribers.

type ServerLogEntry = {
	type: "log";
	level: "info" | "warn" | "error" | "success" | "debug" | "stderr" | "stdout";
	stage?: string;
	message: string;
	timestamp: string;
};

declare global {
	// eslint-disable-next-line no-var
	var __revoServerLogListeners: Set<(entry: ServerLogEntry) => void> | undefined;
}

const serverLogListeners: Set<(entry: ServerLogEntry) => void> =
	globalThis.__revoServerLogListeners ??
	(globalThis.__revoServerLogListeners = new Set());

const STAGE_REGEX = /^\s*\[(FETCH|PARSE|DB|COOKIES|Details|TrendAgent|StatAudit)\]\s*(.*)$/;
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function broadcastServerLog(entry: ServerLogEntry) {
	for (const fn of serverLogListeners) {
		try {
			fn(entry);
		} catch {
			// ignore
		}
	}
}

function hookConsole() {
	const origLog = console.log;
	const origErr = console.error;
	const origWarn = console.warn;
	const origInfo = console.info;
	const origDebug = console.debug;

	const format = (args: unknown[]) =>
		args
			.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
			.join(" ");

	const send = (level: ServerLogEntry["level"], args: unknown[]) => {
		const raw = format(args).replace(ANSI_REGEX, "");
		if (!raw.trim()) return;
		const m = raw.match(STAGE_REGEX);
		broadcastServerLog({
			type: "log",
			level,
			stage: m?.[1],
			message: m ? m[2].trim() : raw,
			timestamp: new Date().toISOString(),
		});
	};

	console.log = (...args: unknown[]) => {
		send("info", args);
		origLog(...args);
	};
	console.info = (...args: unknown[]) => {
		send("info", args);
		origInfo(...args);
	};
	console.warn = (...args: unknown[]) => {
		send("warn", args);
		origWarn(...args);
	};
	console.error = (...args: unknown[]) => {
		send("error", args);
		origErr(...args);
	};
	console.debug = (...args: unknown[]) => {
		send("debug", args);
		origDebug(...args);
	};
}

let consoleHooked = false;
function ensureConsoleHooked() {
	if (consoleHooked) return;
	consoleHooked = true;
	hookConsole();
}

app.get("/admin/logs/stream", (c) => {
	ensureConsoleHooked();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const write = (data: string) => {
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					// closed
				}
			};

			write(`retry: 1000\n\n`);

			const send = (entry: Record<string, unknown>) => {
				const payload = JSON.stringify(entry);
				const lines = payload.split("\n").map((l) => `data: ${l}`).join("\n");
				write(`${lines}\n\n`);
			};

			const onServerLog = (e: ServerLogEntry) => send(e as unknown as Record<string, unknown>);
			serverLogListeners.add(onServerLog);

			const keepAlive = setInterval(() => write(`: keep-alive\n\n`), 15000);

			// Cleanup on close — Hono will call cancel() when the client disconnects
			(controller as ReadableStreamDefaultController & { _cleanup?: () => void })._cleanup = () => {
				clearInterval(keepAlive);
				serverLogListeners.delete(onServerLog);
			};
		},
		cancel() {
			// best-effort cleanup
		},
	});

	return sseResponse(stream);
});

// ============ Streaming API endpoints (SSE) ============

function makeSseResponse(startWork: () => Promise<void> | void) {
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const write = (data: string) => {
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					// closed
				}
			};

			write(`retry: 1000\n\n`);

			const send = (event: ProgressEvent) => {
				const payload = JSON.stringify(event);
				const lines = payload.split("\n").map((l) => `data: ${l}`).join("\n");
				write(`${lines}\n\n`);
			};

			// Acquire a fresh subscription channel
			const { events } = subscribe();
			const keepAlive = setInterval(() => write(`: keep-alive\n\n`), 15000);

			let workStarted = false;
			const start = async () => {
				if (workStarted) return;
				workStarted = true;
				try {
					await startWork();
				} catch (err) {
					send({ type: "error", message: (err as Error).message ?? String(err) });
					send({ type: "done" });
				}
			};

			// Pump events
			(async () => {
				try {
					for await (const ev of events) {
						send(ev);
						if (ev.type === "done") break;
					}
				} finally {
					clearInterval(keepAlive);
					try {
						controller.close();
					} catch {
						// already closed
					}
				}
			})();

			// Kick off the work
			void start();
		},
		cancel() {
			// best-effort — the work continues but events go to /dev/null
		},
	});

	return sseResponse(stream);
}

app.get("/admin/gyms/stats/update-stream", (c) => {
	return makeSseResponse(() => streamingStatsUpdate());
});

app.get("/admin/gyms/update-stream", (c) => {
	return makeSseResponse(() => streamingUpdateGyms());
});

app.get("/admin/gyms/stats/latest-stream", (c) => {
	return makeSseResponse(() => streamingLatestStats());
});

app.post("/admin/gyms/trends/generate-stream", async (c) => {
	let lookback = 90;
	try {
		const body = await c.req.json().catch(() => ({}));
		if (body && typeof body.lookback === "number") lookback = body.lookback;
		else if (c.req.query("lookback")) lookback = Number(c.req.query("lookback")) || 90;
	} catch {
		// ignore
	}
	return makeSseResponse(() => streamingTrendGenerate(lookback));
});

// ============ Script runner endpoints ============

function parseOptions(body: unknown): ScriptOptions {
	if (body && typeof body === "object" && "options" in body) {
		const opts = (body as { options: unknown }).options;
		if (opts && typeof opts === "object") return opts as ScriptOptions;
	}
	if (body && typeof body === "object") return body as ScriptOptions;
	return {};
}

app.post("/admin/scripts/generate-cookies", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const opts = parseOptions(body);
	return makeSseResponse(async () => {
		await runScript("generate-cookies", opts);
	});
});

app.post("/admin/scripts/test-cookies", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const opts = parseOptions(body);
	return makeSseResponse(async () => {
		await runScript("test-cookies", opts);
	});
});

app.post("/admin/scripts/audit", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const opts = parseOptions(body);
	return makeSseResponse(async () => {
		await runScript("audit", opts);
	});
});

// ============ Health check for the admin module ============

app.get("/admin/health", (c) =>
	c.json({
		success: true,
		data: {
			authenticatedAs: isLocalhost(c.req.raw) ? "loopback" : "token",
			consoleHooked: consoleHooked,
		},
	}),
);

export default app;
