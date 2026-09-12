/**
 * Which clubs the member portal reports are gyms worth tracking.
 *
 * The portal's club list contains more than open locations (see
 * gymDirectory.ts), so a club is only accepted when it is already a tracked gym
 * or the public gym directory lists it. Everything else is reported to the
 * caller so the scrape can log what it refused instead of inventing a gym.
 */

/**
 * Canonical form for comparing gym names: the portal writes "OConnor" and
 * "O'Connor" for the same gym, and the public site uses curly apostrophes.
 */
export const normalizeGymName = (name: string): string =>
	name
		.normalize("NFKD")
		.replace(/['’]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();

/** The gym fields that decide which of two records for one location is kept. */
export type GymRecordLike = {
	active?: boolean;
	postcode?: number;
	area_size?: number;
	address?: string;
};

/**
 * How much a Revo_Gyms record knows about its gym. Two records can exist for one
 * location (the portal spells "O'Connor" as "OConnor"), so the richer record —
 * active, with a postcode, area and real address — is the one to keep.
 */
export const gymRecordScore = (gym: GymRecordLike): number => {
	let score = 0;
	if (gym.active) score += 100;
	if ((gym.postcode ?? 0) > 0) score += 10;
	if ((gym.area_size ?? 0) > 0) score += 10;
	if (gym.address && gym.address !== "Pending Update") score += 10;
	return score;
};

/**
 * Fallback timezone. Every Revo gym is in Australia, and Perth covers the case
 * where a detail page did not state which state the gym is in.
 */
export const DEFAULT_TIMEZONE = "Australia/Perth";

const TIMEZONE_BY_STATE: Record<string, string> = {
	WA: "Australia/Perth",
	NT: "Australia/Darwin",
	SA: "Australia/Adelaide",
	QLD: "Australia/Brisbane",
	NSW: "Australia/Sydney",
	ACT: "Australia/Sydney",
	VIC: "Australia/Melbourne",
	TAS: "Australia/Hobart",
};

export const timezoneForState = (state: string | null | undefined): string =>
	TIMEZONE_BY_STATE[(state ?? "").trim().toUpperCase()] ?? DEFAULT_TIMEZONE;

/**
 * The timezone to store for a gym: one that is already set stays, except while
 * it is still the default. A gym registered from a detail page that did not
 * state its state therefore keeps the default until a later run resolves the
 * state, instead of being stuck on Perth forever — its timezone decides which
 * day and hour slot every reading belongs to.
 */
export const resolveTimezone = (
	current: string | null | undefined,
	state: string | null | undefined,
): string => {
	const existing = (current ?? "").trim();
	return existing && existing !== DEFAULT_TIMEZONE ? existing : timezoneForState(state);
};

export type ClubSources = {
	/** Names of the gyms already tracked in Revo_Gyms. */
	knownGymNames: Iterable<string>;
	/** Names from the public gym directory, or `null` when it is unavailable. */
	openGymNames: Iterable<string> | null;
};

export type ClubFilterResult<T> = {
	tracked: T[];
	skipped: T[];
};

/**
 * Split portal clubs into those that are gyms and those that are not.
 *
 * A gym is tracked when the directory lists it or when it is already in
 * Revo_Gyms. The second case keeps a known gym reporting while the directory is
 * unreachable, but it cannot invent one: a club that is in neither place is
 * never tracked.
 */
export const filterTrackableClubs = <T extends { name: string }>(
	clubs: T[],
	sources: ClubSources,
): ClubFilterResult<T> => {
	const knownGymNames = new Set([...sources.knownGymNames].map(normalizeGymName));
	const openGymNames =
		sources.openGymNames === null
			? null
			: new Set([...sources.openGymNames].map(normalizeGymName));

	const tracked: T[] = [];
	const skipped: T[] = [];

	for (const club of clubs) {
		const normalized = normalizeGymName(club.name);
		const isGym = knownGymNames.has(normalized) || (openGymNames?.has(normalized) ?? false);
		(isGym ? tracked : skipped).push(club);
	}

	return { tracked, skipped };
};
