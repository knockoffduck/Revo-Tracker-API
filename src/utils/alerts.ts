/**
 * Telegram alerting for operational failures.
 *
 * Every alert answers, without anyone opening a log: what broke, what the
 * underlying system actually said, how long it has been broken, and when it
 * recovered. Failure paths call `sendAlert` with a stable `key`; repeats of the
 * same key are collapsed (the first one sends immediately, then at most one per
 * cooldown window, each carrying the running occurrence count), and
 * `resolveAlert(key)` sends the recovery notice once the failing path succeeds.
 *
 * Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_USER_ID` to deliver. Without them alerts
 * still reach stdout/`/admin/logs/stream` — they just never leave the box.
 */

import axios from "axios";
import { ClientResponseError } from "pocketbase";
import { readField, readString } from "./tools";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const TELEGRAM_TEXT_LIMIT = 4096;
const MAX_TRACKED_KEYS = 200;
const MAX_CAUSE_DEPTH = 3;
const ALERT_TIME_ZONE = "Australia/Perth";

export type AlertSeverity = "error" | "warning" | "info";

const SEVERITY = {
	error: { emoji: "🔴", label: "ERROR", cooldownMs: 10 * 60 * 1000 },
	warning: { emoji: "🟡", label: "WARNING", cooldownMs: 60 * 60 * 1000 },
	info: { emoji: "🔵", label: "INFO", cooldownMs: 0 },
} as const satisfies Record<AlertSeverity, { emoji: string; label: string; cooldownMs: number }>;

export interface AlertOptions {
	/** Problem class — also the dedupe/cooldown/recovery identity. */
	key: string;
	severity: AlertSeverity;
	/** What failed, one line. */
	title: string;
	/** Facts an operator needs: counts, names, durations. May be multi-line. */
	details?: string;
	/** The thrown value; classified into a plain-language cause. */
	error?: unknown;
	/** Concrete next step. */
	hint?: string;
	/** Override the per-severity suppression window. */
	cooldownMs?: number;
}

// ── Error classification ────────────────────────────────────────────────────
// Alerts are only useful if they say what actually went wrong, so every caught
// value is reduced to: the failure class, what the remote system reported, and
// where it happened.

const NETWORK_CODES: Record<string, string> = {
	ECONNREFUSED: "connection refused",
	ECONNRESET: "connection reset by peer",
	ENOTFOUND: "DNS lookup failed",
	EAI_AGAIN: "DNS lookup failed (temporary)",
	ETIMEDOUT: "connection timed out",
	EHOSTUNREACH: "host unreachable",
	ENETUNREACH: "network unreachable",
	EPROTO: "TLS handshake failed",
	ECONNABORTED: "request aborted",
	ERR_TLS_CERT_ALTNAME_INVALID: "TLS certificate mismatch",
};

/** PocketBase error text that has exactly one operational meaning. */
const PB_INTERPRETATIONS: ReadonlyArray<readonly [RegExp, string]> = [
	[/only superusers can perform this action/i, "the admin token was rejected, so this request went out unauthenticated"],
	[/failed to create record/i, "PocketBase refused the record"],
	[/rate ?limit/i, "rate limited by PocketBase"],
];

/** Keep alert text inside Telegram's per-message limit. */
const truncate = (text: string, max: number): string =>
	text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const describeFieldErrors = (value: unknown): string | null => {
	if (typeof value !== "object" || value === null) return null;
	const problems: string[] = [];
	for (const [name, detail] of Object.entries(value as Record<string, unknown>)) {
		const message = readString(detail, "message");
		const code = readString(detail, "code");
		if (message) problems.push(`${name}: ${message}${code ? ` (${code})` : ""}`);
	}
	return problems.length > 0 ? problems.join("; ") : null;
};

const describePocketBaseError = (error: ClientResponseError): string => {
	const serverMessage = readString(error.data, "message") ?? readString(error.data, "error");
	const fieldErrors = describeFieldErrors(readField(error.data, "data"));
	const path = new URL(error.url, "https://pocketbase.local").pathname;

	const parts = [`HTTP ${error.status} from PocketBase`];
	if (serverMessage) parts.push(`"${serverMessage}"`);
	if (fieldErrors) parts.push(`invalid fields — ${fieldErrors}`);
	parts.push(`at ${path}`);

	const interpretation = PB_INTERPRETATIONS.find(([pattern]) => pattern.test(serverMessage ?? ""));
	if (interpretation) parts.push(interpretation[1]);

	return parts.join(" — ");
};

const describeAxiosError = (error: unknown): string => {
	const status = readField(readField(error, "response"), "status");
	const code = readString(error, "code");
	const url = readString(readField(error, "config"), "url");
	const responseBody = readField(readField(error, "response"), "data");
	let serverText: string | null = null;
	if (typeof responseBody === "string") {
		const collapsed = responseBody.replace(/\s+/g, " ").trim();
		// Full HTML documents would drown the alert; name them instead of quoting them.
		serverText = collapsed.startsWith("<") ? "HTML error page" : truncate(collapsed, 200);
	}

	const parts: string[] = [];
	if (typeof status === "number") parts.push(`HTTP ${status}${serverText ? ` — ${serverText}` : ""}`);
	else if (code) parts.push(NETWORK_CODES[code] ?? code);
	else parts.push(readString(error, "message") ?? "request failed");
	if (url) parts.push(`at ${truncate(url, 160)}`);
	const cause = readField(error, "cause");
	if (cause) parts.push(`caused by ${describeError(cause, 1)}`);

	return parts.join(" — ");
};

const describeStandardError = (error: Error, depth: number): string => {
	const code = readString(error, "code");
	const sqlMessage = readString(error, "sqlMessage");
	const parts: string[] = [];

	if (error.name === "AbortError" || error.name === "TimeoutError") parts.push("no response before the timeout");
	else if (code && NETWORK_CODES[code]) parts.push(`${NETWORK_CODES[code]} (${code})`);
	else if (code?.startsWith("ER_")) parts.push(`MySQL ${code}`);
	else parts.push(`${error.name}: ${truncate(error.message || "no message", 200)}`);

	if (sqlMessage && !parts.some((part) => part.includes(sqlMessage))) parts.push(`SQL: ${truncate(sqlMessage, 200)}`);

	const cause = readField(error, "cause");
	if (depth < MAX_CAUSE_DEPTH && cause && cause !== error) parts.push(`caused by ${describeError(cause, depth + 1)}`);

	return parts.join(" — ");
};

/**
 * Reduce any caught value to one line that names the actual failure: HTTP
 * status and the server's own message, network errno, timeout, SQL state, or
 * the error's name/message as a last resort.
 */
export const describeError = (error: unknown, depth = 0): string => {
	if (error === undefined || error === null) return "no error detail provided";
	if (typeof error === "string") return truncate(error, 300);
	if (error instanceof ClientResponseError) return describePocketBaseError(error);
	// axios marks its own errors; duck-typing keeps this working for any client.
	if (readField(error, "isAxiosError") === true) return describeAxiosError(error);
	if (error instanceof Error) return describeStandardError(error, depth);
	try {
		return truncate(JSON.stringify(error), 300);
	} catch {
		return String(error);
	}
};

// ── Message rendering ───────────────────────────────────────────────────────

const escapeHtml = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatStamp = (at: number): string => {
	const formatted = new Intl.DateTimeFormat("en-AU", {
		timeZone: ALERT_TIME_ZONE,
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(at));
	return `${formatted.replace(",", "")} AWST`;
};

const formatDuration = (ms: number): string => {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

interface RenderedAlert {
	severity: AlertSeverity;
	title: string;
	cause?: string;
	details?: string;
	hint?: string;
	occurrences: number;
	firstAt: number;
	now: number;
}

const renderAlertMessage = (alert: RenderedAlert): string => {
	const { emoji, label } = SEVERITY[alert.severity];
	const lines = [`${emoji} <b>${label}: ${escapeHtml(alert.title)}</b>`, ""];

	if (alert.cause) lines.push(`<b>Cause</b>: ${escapeHtml(alert.cause)}`);
	if (alert.details) lines.push(`<b>Details</b>: ${escapeHtml(alert.details)}`);
	if (alert.hint) lines.push(`<b>Hint</b>: ${escapeHtml(alert.hint)}`);

	const recurrence =
		alert.occurrences > 1
			? `${alert.occurrences} occurrences, failing since ${formatStamp(alert.firstAt)} (${formatDuration(alert.now - alert.firstAt)})`
			: `first occurrence ${formatStamp(alert.now)}`;
	lines.push("", recurrence, `<code>${new Date(alert.now).toISOString()}</code>`);

	return truncate(lines.join("\n"), TELEGRAM_TEXT_LIMIT - 1);
};

// ── Delivery ────────────────────────────────────────────────────────────────

const sendTelegram = async (message: string): Promise<boolean> => {
	if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_USER_ID) {
		console.warn("[Alert] Telegram credentials not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_USER_ID) — alert not delivered");
		return false;
	}

	try {
		await axios.get(`${TG_API}/sendMessage`, {
			params: {
				chat_id: TELEGRAM_USER_ID,
				text: message,
				parse_mode: "HTML",
				disable_web_page_preview: true,
			},
			timeout: 10000,
		});
		return true;
	} catch (e) {
		console.error(`[Alert] Telegram delivery failed: ${describeError(e)}`);
		return false;
	}
};

/** Where rendered alerts go. */
export type AlertTransport = (message: string) => Promise<boolean>;

let transport: AlertTransport = sendTelegram;

/**
 * Redirect alert delivery without touching any caller — used by tests to
 * inspect the exact payload, and available for pointing alerts at another sink.
 * Pass `null` to restore Telegram delivery.
 */
export const setAlertTransport = (next: AlertTransport | null): void => {
	transport = next ?? sendTelegram;
};

// ── Dedupe / escalation state ───────────────────────────────────────────────

interface AlertState {
	title: string;
	occurrences: number;
	firstAt: number;
	lastSentAt: number;
}

const alertState = new Map<string, AlertState>();

/** Keep the tracking map bounded; drop the least recently active problem first. */
const trimState = (): void => {
	if (alertState.size <= MAX_TRACKED_KEYS) return;
	let oldestKey: string | null = null;
	let oldestAt = Number.POSITIVE_INFINITY;
	for (const [key, state] of alertState) {
		if (state.lastSentAt < oldestAt) {
			oldestAt = state.lastSentAt;
			oldestKey = key;
		}
	}
	if (oldestKey) alertState.delete(oldestKey);
};

/**
 * Report a failure. Never throws, and never blocks the caller for longer than
 * the Telegram request timeout.
 */
export const sendAlert = async (options: AlertOptions): Promise<void> => {
	try {
		const { key, severity, title, details, error, hint } = options;
		const now = Date.now();
		const previous = alertState.get(key);
		const occurrences = (previous?.occurrences ?? 0) + 1;
		const firstAt = previous?.firstAt ?? now;
		const cooldownMs = options.cooldownMs ?? SEVERITY[severity].cooldownMs;
		const lastSentAt = previous?.lastSentAt ?? 0;
		const suppressed = previous !== undefined && now - lastSentAt < cooldownMs;

		alertState.set(key, { title, occurrences, firstAt, lastSentAt: suppressed ? lastSentAt : now });
		trimState();

		const cause = error === undefined ? undefined : describeError(error);
		const headline = `[Alert] ${SEVERITY[severity].label} ${title}${cause ? ` — ${cause}` : ""}${details ? ` | ${details}` : ""}`;
		if (severity === "error") console.error(headline);
		else console.warn(headline);

		if (suppressed) {
			console.warn(
				`[Alert] ${key}: Telegram suppressed (${occurrences} occurrences, last sent ${formatDuration(now - lastSentAt)} ago, window ${formatDuration(cooldownMs)})`,
			);
			return;
		}

		await transport(renderAlertMessage({ severity, title, cause, details, hint, occurrences, firstAt, now }));
	} catch (e) {
		console.error(`[Alert] Alerting itself failed for ${options.key}: ${describeError(e)}`);
	}
};

/**
 * Clear a failing problem class and send the matching recovery notice. Call it
 * on the success path of whatever `sendAlert` guards; a key that was never
 * failing is a no-op (no message).
 */
export const resolveAlert = async (key: string): Promise<void> => {
	try {
		const state = alertState.get(key);
		if (!state) return;
		alertState.delete(key);

		const downtime = formatDuration(Date.now() - state.firstAt);
		const runs = `${state.occurrences} failing ${state.occurrences === 1 ? "attempt" : "attempts"}`;
		console.log(`[Alert] RESOLVED ${key}: ${state.title} (${downtime}, ${runs})`);

		const message = [
			`✅ <b>RESOLVED: ${escapeHtml(state.title)}</b>`,
			"",
			`Recovered after <b>${downtime}</b> — ${runs}`,
			`<code>${new Date().toISOString()}</code>`,
		].join("\n");

		await transport(message);
	} catch (e) {
		console.error(`[Alert] Recovery notice failed for ${key}: ${describeError(e)}`);
	}
};
