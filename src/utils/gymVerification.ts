/**
 * Deciding whether a name the member portal reports is a real Revo gym.
 *
 * The public gym detail page (`https://revofitness.com.au/gyms/<slug>/`) is the
 * same source the app already reads for squat racks, floor area, address and
 * postcode (src/utils/details.ts), so it is the authority on whether a location
 * exists: a page for an open gym carries a floor area and/or a street address,
 * while clubs for sites that have not opened (`Trinity Gardens`, `Busselton`)
 * and clubs retired by a relocation (`Nunawading - (Original)`, `Cockburn2`)
 * have no page at all. This lets a genuinely new gym be picked up from the club
 * counter before the directory lists it — its first useful reading is registered
 * automatically instead of waiting for someone to add the gym by hand.
 */

import { getGymDetails, type GymDetails } from "./details";

/** The gym fields a record and a detail page have in common. */
export type AddressLike = { name?: string | null; address?: string | null; postcode?: number | null };

/**
 * Does this detail page describe an open gym?
 *
 * Floor area is the most reliable tell — every open gym states it — with a
 * street address and postcode as the fallback for a page whose size banner is
 * missing. Squat racks alone are not enough: they survive on the page of a gym
 * that has closed or moved (Shenton Park), and a coming-soon page has neither
 * area nor address.
 */
export const detailPageShowsRealGym = (details: GymDetails): boolean => {
	if ((details.areaSize ?? 0) > 0) return true;
	return (details.postcode ?? 0) > 199 && (details.address ?? "").trim().length > 0;
};

/**
 * Identifies the location a gym record or detail page describes, so two records
 * for one gym can be recognised. Returns `null` when there is no usable
 * address. The postcode is left out on purpose: a record whose postcode was
 * never filled in still describes the same location as the detail page that has
 * it (and a page carrying a relocation notice can extract a wrong postcode).
 */
export const locationKey = (gym: AddressLike): string | null => {
	const address = (gym.address ?? "").trim();
	if (!address || address === "Pending Update") return null;
	return address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
};

/**
 * Which tracked gym owns each known location, keyed by `locationKey`. Used to
 * recognise an alias club: the portal keeps one for a gym a relocation replaced
 * (`Knox` for `Knoxfield`), and its detail page points at the tracked gym's own
 * address. Deactivated records count as owners too — otherwise a closed gym's
 * alias page would be registered as a brand new gym.
 */
export const locationOwners = (gyms: AddressLike[]): Map<string, string> => {
	const owners = new Map<string, string>();
	for (const gym of gyms) {
		const key = locationKey(gym);
		if (key && !owners.has(key)) owners.set(key, gym.name ?? key);
	}
	return owners;
};

/**
 * The detail page of `name` when it shows a real gym, otherwise `null`.
 */
export const verifyRealGym = async (name: string): Promise<GymDetails | null> => {
	const details = await getGymDetails(name);
	return detailPageShowsRealGym(details) ? details : null;
};
