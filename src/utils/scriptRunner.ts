/**
 * CLI script runner — spawns Bun subprocesses for the maintenance scripts
 * (cookie generation, cookie testing, stat audit) and streams their stdout
 * to the progress bus so the admin SSE endpoints can forward to clients.
 *
 * The script's stdout is parsed for stage tags like:
 *   [FETCH] [1/10] ... ✔ 85 gyms
 * and turned into structured log events.
 */

import { progressBus } from "./progress";

const STAGE_REGEX = /^\s*\[(FETCH|PARSE|DB|COOKIES|Details|TrendAgent|StatAudit)\]\s*(.*)$/;

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

type LogLevel = "info" | "warn" | "error" | "success" | "debug" | "stdout" | "stderr";

function classifyLine(line: string): LogLevel {
	if (line.includes("✖") || line.toLowerCase().includes("error")) return "error";
	if (line.includes("⚠") || line.toLowerCase().includes("warn")) return "warn";
	if (line.includes("✔") || line.toLowerCase().includes("success")) return "success";
	return "info";
}

function stripAnsi(s: string) {
	return s.replace(ANSI_REGEX, "");
}

export type ScriptOptions = Record<string, string | number | boolean | undefined | null>;

export type ScriptId = "generate-cookies" | "test-cookies" | "audit";

const SCRIPT_PATHS: Record<ScriptId, string> = {
	"generate-cookies": "Scraper/generate_cookies.ts",
	"test-cookies": "Scraper/test_cookies.ts",
	audit: "scripts/repair-gym-dropouts.ts",
};

function buildArgs(script: ScriptId, options: ScriptOptions): string[] {
	const args: string[] = ["run", SCRIPT_PATHS[script]];

	if (script === "audit") {
		if (options.apply) args.push("--apply");
		if (options.gym) args.push("--gym", String(options.gym));
		if (options.from) args.push("--from", String(options.from));
		if (options.to) args.push("--to", String(options.to));
		if (options.minScore != null && options.minScore !== "") {
			args.push("--min-score", String(options.minScore));
		}
		if (options.confidence) args.push("--confidence", String(options.confidence));
		if (options.verbose) args.push("--verbose");
	}

	return args;
}

export async function runScript(script: ScriptId, options: ScriptOptions = {}): Promise<unknown> {
	const args = buildArgs(script, options);

	progressBus.emit({
		type: "log",
		level: "info",
		message: `Spawning: bun ${args.join(" ")}`,
	});
	progressBus.emit({ type: "progress", phase: "running", percent: 0 });

	const proc = Bun.spawn(["bun", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	let stdout = "";
	let stderr = "";
	let currentPercent = 0;
	const bumpPercent = (delta: number) => {
		currentPercent = Math.min(99, Math.max(currentPercent, currentPercent + delta));
		progressBus.emit({ type: "progress", phase: "running", percent: currentPercent });
	};

	// Stream stdout line-by-line
	const streamLines = (stream: ReadableStream<Uint8Array>, target: "stdout" | "stderr") => {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		(async () => {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				const text = decoder.decode(value, { stream: true });
				buffer += text;
				let idx;
				while ((idx = buffer.indexOf("\n")) !== -1) {
					const rawLine = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 1);
					const line = stripAnsi(rawLine).trimEnd();
					if (!line.trim()) continue;
					if (target === "stdout") stdout += line + "\n";
					else stderr += line + "\n";

					const m = line.match(STAGE_REGEX);
					if (m) {
						progressBus.emit({
							type: "log",
							level: classifyLine(line),
							stage: m[1],
							message: m[2].trim(),
						});
					} else {
						progressBus.emit({
							type: "log",
							level: target === "stderr" ? "stderr" : classifyLine(line),
							message: line,
						});
					}
					bumpPercent(2);
				}
			}
			if (buffer.trim()) {
				const line = stripAnsi(buffer).trimEnd();
				if (target === "stdout") stdout += line + "\n";
				else stderr += line + "\n";
				progressBus.emit({
					type: "log",
					level: target === "stderr" ? "stderr" : classifyLine(line),
					message: line,
				});
			}
		})();
	};

	streamLines(proc.stdout as unknown as ReadableStream<Uint8Array>, "stdout");
	streamLines(proc.stderr as unknown as ReadableStream<Uint8Array>, "stderr");

	const exitCode = await proc.exited;
	bumpPercent(100);

	if (exitCode === 0) {
		progressBus.emit({
			type: "log",
			level: "success",
			message: `Script completed (exit 0)`,
		});
		progressBus.emit({ type: "progress", phase: "done", percent: 100 });
		// Try to read the most recent report file for audit scripts
		if (script === "audit") {
			const report = await tryReadLatestReport();
			progressBus.emit({ type: "result", data: report ?? { stdout: stdout.slice(-4000), exitCode } });
		} else {
			progressBus.emit({ type: "result", data: { exitCode, stdoutTail: stdout.slice(-4000) } });
		}
	} else {
		progressBus.emit({
			type: "log",
			level: "error",
			message: `Script exited with code ${exitCode}`,
		});
		progressBus.emit({ type: "error", message: `Script failed (exit ${exitCode})` });
		progressBus.emit({ type: "result", data: { exitCode, stderrTail: stderr.slice(-4000) } });
	}

	progressBus.emit({ type: "done" });
	return { exitCode };
}

async function tryReadLatestReport(): Promise<unknown> {
	try {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const dir = path.resolve(process.cwd(), "reports");
		const files = await fs.readdir(dir);
		const jsonFiles = files.filter((f) => f.startsWith("stat-audit-") && f.endsWith(".json"));
		if (jsonFiles.length === 0) return null;
		jsonFiles.sort();
		const latest = jsonFiles[jsonFiles.length - 1];
		const content = await fs.readFile(path.join(dir, latest), "utf-8");
		return JSON.parse(content);
	} catch {
		return null;
	}
}
