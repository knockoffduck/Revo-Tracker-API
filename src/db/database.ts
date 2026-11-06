import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";

export const sqlDb = process.env.DATABASE_URL
	? drizzle(process.env.DATABASE_URL)
	: null;

/**
 * Circuit breaker for the legacy MySQL mirror.
 *
 * The trend cache is served from PocketBase; MySQL only mirrors it. When DATABASE_URL
 * points at something unreachable (the deployed env carried the public IP, which the OCI
 * security list blackholes) every write waits out a TCP timeout, and 7 days x 84 gyms of
 * that turned a two-minute run into an hour. One failed connect is enough evidence for the
 * rest of the process: stop trying, say so once, and keep the fast path fast.
 */
let sqlMirrorDown = false;
let sqlMirrorReason = "";

export const isSqlMirrorEnabled = (): boolean => sqlDb !== null && !sqlMirrorDown;

export const getSqlMirrorDisabledReason = (): string => sqlMirrorReason;

const FATAL_CODES = new Set([
	"ETIMEDOUT",
	"ECONNREFUSED",
	"ENOTFOUND",
	"EHOSTUNREACH",
	"ER_ACCESS_DENIED_ERROR",
	"ER_BAD_DB_ERROR",
]);

/** Disable the mirror for the rest of the process on a non-recoverable connection fault. */
export const noteSqlMirrorError = (err: unknown): void => {
	const code = (err as { code?: string } | null)?.code ?? "";
	if (!FATAL_CODES.has(code) || sqlMirrorDown) return;

	sqlMirrorDown = true;
	sqlMirrorReason = code;
	console.error(
		`[MySQL] Mirror disabled for this process after ${code}: fix DATABASE_URL in the Dokploy panel, not just the swarm spec (a Dokploy deploy restores the panel value). PocketBase remains the source of truth.`,
	);
};
