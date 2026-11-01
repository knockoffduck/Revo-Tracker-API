/**
 * One-off: put the Cockburn snapshot history on the right club record.
 *
 * Timeline (UTC, 2026-11-01): the Cockburn record was split at 15:47:51 into
 * "Cockburn" (new club, 635 Beeliar Drive) and "Cockburn (Original)" (660
 * Beeliar Drive). Every snapshot written before that split came from portal
 * club 11, the original club; snapshots from 15:53 onward come from club 91,
 * the new one. Rows are keyed by gym_id, so this reattribution has to be done
 * once by hand.
 *
 * Runs in two passes, both safe to re-run:
 *   1. rows already moved onto the original that were created after the split
 *      go back to the new club;
 *   2. every row created before the split moves to the original.
 *
 * The rolling archiver deletes rows past 90 days while this runs, so a batch can
 * fail on a record that vanished between listing and writing: fall back to
 * per-record updates and treat a 404 as already gone.
 *
 * Dry run by default; pass --apply.
 */
import "dotenv/config";
import { ensureAdminAuth, pb } from "../src/utils/database";

const SPLIT_AT = "2026-11-01 15:50:00";
const NEW_CLUB = { gym_id: "12913404", gym_name: "Cockburn" };
const ORIGINAL_CLUB = { gym_id: "11108326", gym_name: "Cockburn (Original)" };
const APPLY = process.argv.includes("--apply");
const BATCH = 100;

const moveWhere = async (
	filter: string,
	to: { gym_id: string; gym_name: string },
	label: string,
) => {
	const count = await pb.collection("Revo_Gym_Count").getList(1, 1, { filter });
	console.log(`${label}: ${count.totalItems} row(s)`);
	if (!APPLY || count.totalItems === 0) return 0;

	// Walk one bounded window at a time so a shrinking total cannot skip rows.
	let moved = 0;
	while (true) {
		// Newest first: the oldest rows are the ones the archiver is deleting
		// right now, and touching them turns every batch into 100 failing writes.
		const chunk = await pb.collection("Revo_Gym_Count").getList(1, BATCH, {
			filter,
			sort: "-created",
			fields: "id",
		});
		if (chunk.items.length === 0) break;

		try {
			await pb.send("/api/batch", {
				method: "POST",
				body: {
					requests: chunk.items.map((record) => ({
						method: "PATCH",
						url: `/api/collections/Revo_Gym_Count/records/${record.id}`,
						body: to,
					})),
				},
			});
			moved += chunk.items.length;
		} catch {
			const results = await Promise.allSettled(
				chunk.items.map((record) => pb.collection("Revo_Gym_Count").update(record.id, to)),
			);
			moved += results.filter((result) => result.status === "fulfilled").length;
		}
		if (moved % 2000 < BATCH) console.log(`  ${label}: moved ${moved}`);
	}
	console.log(`${label}: moved ${moved}`);
	return moved;
};

const run = async () => {
	await ensureAdminAuth();
	console.log(`split at ${SPLIT_AT}; ${APPLY ? "APPLY" : "DRY RUN"}`);

	await moveWhere(
		pb.filter("gym_id={:id} && created>={:cut}", { id: ORIGINAL_CLUB.gym_id, cut: SPLIT_AT }),
		NEW_CLUB,
		"pass 1 — post-split rows back to the new club",
	);

	await moveWhere(
		pb.filter("gym_id={:id} && created<{:cut}", { id: NEW_CLUB.gym_id, cut: SPLIT_AT }),
		ORIGINAL_CLUB,
		"pass 2 — pre-split rows onto the original club",
	);

	const finalNew = await pb.collection("Revo_Gym_Count").getList(1, 1, {
		filter: pb.filter("gym_id={:id}", { id: NEW_CLUB.gym_id }),
	});
	const finalOriginal = await pb.collection("Revo_Gym_Count").getList(1, 1, {
		filter: pb.filter("gym_id={:id}", { id: ORIGINAL_CLUB.gym_id }),
	});
	console.log(
		`final — new club ${finalNew.totalItems} row(s), original ${finalOriginal.totalItems} row(s)`,
	);
	process.exit(0);
};

run().catch((error) => {
	console.error("FAILED:", error?.message ?? error);
	process.exit(1);
});
