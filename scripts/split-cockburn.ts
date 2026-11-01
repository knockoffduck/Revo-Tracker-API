/**
 * One-off: split the Cockburn gym record into the two clubs Revo actually runs.
 *
 * The portal reports "Cockburn" (id 11, the original club at 660 Beeliar Drive,
 * 1,000 m², 7 racks) and "Cockburn2" (id 91, the club at 635 Beeliar Drive that
 * opened in October 2026, 2,450 m², 13 racks). Until now one record carried the
 * original's count with the new club's size and a promo paragraph as its address.
 *
 * Dry run by default; pass --apply to write.
 */
import "dotenv/config";
import { ensureAdminAuth, pb } from "../src/utils/database";
import { simpleIntegerHash } from "../src/utils/tools";
import { normalizeGymName } from "../src/utils/gymFilter";

const APPLY = process.argv.includes("--apply");

const NEW_CLUB = {
	name: "Cockburn",
	address: "635 Beeliar Drive, Cockburn WA 6164",
	postcode: 6164,
	state: "WA",
	area_size: 2450,
	Squat_Racks: 13,
};

// From the archived /gyms/cockburn/ page of August 2026, before Revo repointed
// that URL at the new building: 4/660 Beeliar Drive, 1,000 sq/m, 7 squat racks.
const ORIGINAL_CLUB = {
	name: "Cockburn (Original)",
	address: "4/660 Beeliar Drive, Cockburn WA 6164",
	postcode: 6164,
	state: "WA",
	area_size: 1000,
	Squat_Racks: 7,
};

type PbGym = { id: string; name: string; [key: string]: unknown };

const run = async () => {
	await ensureAdminAuth();
	const gyms = await pb.collection("Revo_Gyms").getFullList<PbGym>({ batch: 200 });

	const cockburn = gyms.find((gym) => normalizeGymName(gym.name) === "cockburn");
	if (!cockburn) throw new Error("No gym named Cockburn — nothing to split");

	const existingOriginal = gyms.find(
		(gym) => normalizeGymName(gym.name) === normalizeGymName(ORIGINAL_CLUB.name),
	);

	const originalId = simpleIntegerHash(ORIGINAL_CLUB.name + String(ORIGINAL_CLUB.postcode));
	const idTaken = gyms.find((gym) => gym.id === String(originalId));
	if (!existingOriginal && idTaken) {
		throw new Error(`id ${originalId} already belongs to ${idTaken.name}`);
	}

	const now = new Date().toISOString().replace("T", " ").replace("Z", "Z");

	console.log("BEFORE");
	console.log("  Cockburn:", JSON.stringify({
		id: cockburn.id,
		name: cockburn.name,
		address: cockburn.address,
		postcode: cockburn.postcode,
		area_size: cockburn.area_size,
		Squat_Racks: cockburn.Squat_Racks,
	}));
	console.log("  Original record:", existingOriginal ? `${existingOriginal.id} ${existingOriginal.name}` : "absent");

	const newClubUpdate = {
		...NEW_CLUB,
		latitude: cockburn.latitude,
		longitude: cockburn.longitude,
		timezone: "Australia/Perth",
		active: true,
		last_updated: now,
	};

	const originalPayload = {
		...ORIGINAL_CLUB,
		latitude: cockburn.latitude,
		longitude: cockburn.longitude,
		timezone: "Australia/Perth",
		active: true,
		last_updated: now,
	};

	if (!APPLY) {
		console.log("\nDRY RUN — would write:");
		console.log("  update", cockburn.id, JSON.stringify(newClubUpdate));
		console.log(
			existingOriginal ? "  update " + existingOriginal.id : "  create " + originalId,
			JSON.stringify(originalPayload),
		);
		process.exit(0);
	}

	if (existingOriginal) {
		await pb.collection("Revo_Gyms").update(existingOriginal.id, originalPayload);
	} else {
		await pb.collection("Revo_Gyms").create({ id: String(originalId), ...originalPayload });
	}
	await pb.collection("Revo_Gyms").update(cockburn.id, newClubUpdate);

	const after = await pb.collection("Revo_Gyms").getFullList<PbGym>({ batch: 200 });
	console.log("\nAFTER");
	for (const gym of after.filter((gym) => normalizeGymName(gym.name).startsWith("cockburn"))) {
		console.log("  ", JSON.stringify({
			id: gym.id,
			name: gym.name,
			address: gym.address,
			postcode: gym.postcode,
			area_size: gym.area_size,
			Squat_Racks: gym.Squat_Racks,
			active: gym.active,
		}));
	}
	console.log("  total gyms:", after.length);
	process.exit(0);
};

run().catch((error) => {
	console.error("FAILED:", error?.message ?? error);
	process.exit(1);
});
