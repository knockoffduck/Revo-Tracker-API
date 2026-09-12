/**
 * purge-non-gyms.ts — Delete Revo_Gyms rows that are not real locations.
 *
 * The member portal's club list used to turn every club it reports into a gym:
 * unopened sites ("Trinity Gardens"), clubs retired by a relocation
 * ("Nunawading - (Original)", "Cockburn2") and aliases of a listed gym ("Knox"
 * for Knoxfield). Scrapes can no longer create those rows (see
 * src/utils/gymDirectory.ts), but the ones already in the database own
 * snapshots in Revo_Gym_Count and popular-times rows in gym_trend_cache, so
 * they are removed here. The public gym directory decides which locations are
 * real, and of two records for one location the richer one survives.
 *
 * Usage (from the API project root):
 *   bun run scripts/purge-non-gyms.ts           # dry run — print what would go
 *   bun run scripts/purge-non-gyms.ts --apply   # delete it
 *
 * Env (from .env via dotenv): POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL,
 * POCKETBASE_ADMIN_PASSWORD.
 */

import { pb, ensureAdminAuth } from "../src/utils/database";
import { sendAlert } from "../src/utils/alerts";
import { getOpenGymNames } from "../src/utils/gymDirectory";
import { gymRecordScore, normalizeGymName } from "../src/utils/gymFilter";
import { locationKey, locationOwners, verifyRealGym } from "../src/utils/gymVerification";

const GYM_COLLECTION = "Revo_Gyms";
const COUNT_COLLECTION = "Revo_Gym_Count";
const TREND_COLLECTION = "gym_trend_cache";
const BATCH_SIZE = 500;

type GymRecord = {
	id: string;
	name: string;
	active: boolean;
	postcode: number;
	area_size: number;
	address: string;
};

type StaleGym = { gym: GymRecord; reason: string };

export type PurgeResult = {
	/** Gyms left in Revo_Gyms. */
	kept: number;
	/** Gyms deleted (or, in a dry run, that would be deleted). */
	purged: string[];
	snapshotsDeleted: number;
	trendsDeleted: number;
	dryRun: boolean;
};

/** Delete every record matching `filter`, in batches, and report how many went. */
const deleteWhere = async (collection: string, filter: string): Promise<number> => {
	let deleted = 0;

	for (;;) {
		const batch = await pb.collection(collection).getList(1, BATCH_SIZE, {
			filter,
			fields: "id",
		});
		if (batch.items.length === 0) return deleted;

		await Promise.all(batch.items.map((row) => pb.collection(collection).delete(row.id)));
		deleted += batch.items.length;
	}
};

/**
 * The rows to delete: gyms the directory does not list and whose own detail page
 * does not describe a real gym, plus the poorer record whenever two records
 * describe one location.
 *
 * A record that is not in the directory but *does* have a real detail page is
 * left alone: that is what a gym looks like in the window between opening and
 * the directory being updated, and the scrape tracks it from the detail page. A
 * record whose detail page shares the address of a listed gym is an alias of it
 * — the portal keeps a club for the gym a relocation replaced, such as "Knox"
 * for "Knoxfield" — and goes.
 */
const findStaleGyms = async (gyms: GymRecord[], openGyms: Set<string>): Promise<StaleGym[]> => {
	const bestByName = new Map<string, GymRecord>();

	for (const gym of gyms) {
		const key = normalizeGymName(gym.name);
		const best = bestByName.get(key);
		if (!best || gymRecordScore(gym) > gymRecordScore(best)) bestByName.set(key, gym);
	}

	const listedLocations = locationOwners(
		gyms.filter((gym) => openGyms.has(normalizeGymName(gym.name))),
	);
	const stale: StaleGym[] = [];

	for (const gym of gyms) {
		const key = normalizeGymName(gym.name);
		const best = bestByName.get(key)!;

		if (openGyms.has(key)) {
			if (best.id !== gym.id) stale.push({ gym, reason: `duplicate of ${best.name} (${best.id})` });
			continue;
		}

		const details = await verifyRealGym(gym.name);
		const location = details ? locationKey(details) : null;
		const owner = location ? listedLocations.get(location) : undefined;
		if (!details) {
			stale.push({ gym, reason: "not in the gym directory and has no gym detail page" });
		} else if (owner) {
			stale.push({ gym, reason: `same address as ${owner}, which is open today` });
		} else {
			console.log(
				`[Purge]   Keeping ${gym.name} (${gym.id}) — its detail page shows a real gym the directory has not caught up with; deactivate it in the dashboard if it has actually closed`,
			);
		}
	}

	return stale;
};

export const purgeNonGyms = async (dryRun = false): Promise<PurgeResult> => {
	console.log(`[Purge] Mode:        ${dryRun ? "DRY RUN" : "LIVE"}`);

	const openGymNames = await getOpenGymNames();
	if (openGymNames === null) {
		throw new Error(
			"The public gym directory could not be fetched or cached, so a real gym cannot be told from a phantom one — nothing was deleted",
		);
	}

	const openGyms = new Set([...openGymNames].map(normalizeGymName));

	await ensureAdminAuth();
	const gyms = await pb.collection(GYM_COLLECTION).getFullList<GymRecord>({ batch: 200 });
	const stale = await findStaleGyms(gyms, openGyms);

	console.log(`[Purge] Directory:   ${openGyms.size} gyms`);
	console.log(`[Purge] Revo_Gyms:   ${gyms.length} records`);
	console.log(`[Purge] To delete:   ${stale.length}`);

	if (stale.length === 0) {
		console.log("[Purge] Nothing to purge. Done.");
		return { kept: gyms.length, purged: [], snapshotsDeleted: 0, trendsDeleted: 0, dryRun };
	}

	let snapshotsDeleted = 0;
	let trendsDeleted = 0;
	const purged: string[] = [];

	for (const { gym, reason } of stale) {
		// Snapshots also exist under this name from before the gym had an ID, so
		// match both the id and the denormalized name — unless a surviving gym
		// shares the name, in which case only this record's own id is safe.
		const nameIsUnused = !gyms.some(
			(other) => other.id !== gym.id && other.name === gym.name,
		);
		const snapshotFilter = nameIsUnused
			? pb.filter("gym_id={:id} || gym_name={:name}", { id: gym.id, name: gym.name })
			: pb.filter("gym_id={:id}", { id: gym.id });
		const trendFilter = pb.filter("gym_id={:id}", { id: gym.id });

		const snapshots = await pb.collection(COUNT_COLLECTION).getList(1, 1, {
			filter: snapshotFilter,
		});
		const trends = await pb.collection(TREND_COLLECTION).getList(1, 1, { filter: trendFilter });

		console.log(
			`[Purge]   ${gym.name} (${gym.id}) — ${reason}; ${gym.active ? "active" : "inactive"}, ` +
				`snapshots ${snapshots.totalItems}, trends ${trends.totalItems}`,
		);

		if (dryRun) continue;

		snapshotsDeleted += await deleteWhere(COUNT_COLLECTION, snapshotFilter);
		trendsDeleted += await deleteWhere(TREND_COLLECTION, trendFilter);
		await pb.collection(GYM_COLLECTION).delete(gym.id);
		purged.push(gym.name);
	}

	if (dryRun) {
		console.log("[Purge] Dry run — nothing deleted. Re-run with --apply to remove these.");
		return {
			kept: gyms.length,
			purged: stale.map((entry) => entry.gym.name),
			snapshotsDeleted: 0,
			trendsDeleted: 0,
			dryRun,
		};
	}

	console.log(
		`[Purge] Done. Deleted ${purged.length} gyms, ${snapshotsDeleted} snapshots, ${trendsDeleted} trend rows.`,
	);
	return {
		kept: gyms.length - purged.length,
		purged,
		snapshotsDeleted,
		trendsDeleted,
		dryRun,
	};
};

// ── CLI entrypoint ──────────────────────────────────────────────────────────

const main = async () => {
	const apply = process.argv.slice(2).includes("--apply");
	await purgeNonGyms(!apply);
};

// Only run main() when executed directly (not when imported by a scheduler).
if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch(async (err) => {
			console.error("[Purge] Fatal error:", err);
			await sendAlert({
				key: "purge.non_gyms",
				severity: "error",
				title: "Gym purge failed",
				details: "Phantom gyms in Revo_Gyms are still served with empty snapshots",
				error: err,
				hint: "run bun run scripts/purge-non-gyms.ts on the host to see the full error",
			});
			process.exit(1);
		});
}
