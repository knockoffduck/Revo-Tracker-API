/**
 * archive-gym-count.ts — Rolling archiver for the Revo_Gym_Count collection.
 *
 * Designed to run as a scheduled job AFTER the initial bulk cleanup (done via
 * direct SQLite on the server). Each run only removes the small number of rows
 * that have aged past the retention window since the last run, so the
 * PocketBase REST API is perfectly adequate.
 *
 * Usage (standalone):
 *   bun run scripts/archive-gym-count.ts [--retention-days 90] [--dry-run]
 *
 * Env (from .env via dotenv):
 *   POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
 */

import { pb, ensureAdminAuth } from "../src/utils/database";

const COLLECTION = "Revo_Gym_Count";
const BATCH_SIZE = 500;

export interface ArchiveResult {
	total: number;
	deleted: number;
	dryRun: boolean;
}

/**
 * Archive (delete) Revo_Gym_Count rows older than the retention window.
 * Returns the count of rows found and deleted.
 */
export const archiveGymCount = async (
	retentionDays = 90,
	dryRun = false,
): Promise<ArchiveResult> => {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	const cutoffStr = cutoff.toISOString().slice(0, 19).replace("T", " ");

	console.log(`[Archive] Collection:   ${COLLECTION}`);
	console.log(`[Archive] Retention:    ${retentionDays} days`);
	console.log(`[Archive] Cutoff:       ${cutoffStr}`);
	console.log(`[Archive] Mode:         ${dryRun ? "DRY RUN" : "LIVE"}`);

	await ensureAdminAuth();

	// Count rows to archive.
	const countResult = await pb.collection(COLLECTION).getList(1, 1, {
		filter: pb.filter("created < {:cutoff}", { cutoff: cutoffStr }),
	});
	const total = countResult.totalItems;
	console.log(`[Archive] Rows to archive: ${total}`);

	if (total === 0) {
		console.log("[Archive] Nothing to archive. Done.");
		return { total: 0, deleted: 0, dryRun };
	}

	if (dryRun) {
		console.log("[Archive] Dry run — no rows deleted.");
		return { total, deleted: 0, dryRun };
	}

	// Delete in batches. Fetch IDs first, then delete each batch.
	let deleted = 0;

	while (true) {
		const batch = await pb.collection(COLLECTION).getList(1, BATCH_SIZE, {
			filter: pb.filter("created < {:cutoff}", { cutoff: cutoffStr }),
			fields: "id",
			sort: "created",
		});

		if (batch.items.length === 0) break;

		const ids = batch.items.map((r) => r.id);
		await Promise.all(
			ids.map((id) => pb.collection(COLLECTION).delete(id)),
		);

		deleted += ids.length;
		if (deleted % 5000 === 0 || deleted >= total) {
			console.log(`[Archive] Deleted ${deleted}/${total}...`);
		}
	}

	console.log(`[Archive] Done. Deleted ${deleted} rows.`);
	return { total, deleted, dryRun };
};

// ── CLI entrypoint ──────────────────────────────────────────────────────────

const readFlag = (args: string[], flag: string): string | null => {
	const idx = args.indexOf(flag);
	return idx !== -1 ? (args[idx + 1] ?? null) : null;
};

const main = async () => {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const retentionDays = Number(readFlag(args, "--retention-days") ?? "90");
	await archiveGymCount(retentionDays, dryRun);
};

// Only run main() when executed directly (not when imported by the scheduler).
if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("[Archive] Fatal error:", err);
			process.exit(1);
		});
}
