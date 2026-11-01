/**
 * Portal clubs that are not the gym of the same name.
 *
 * revocentral's club-counter keys counts by *club*, and a club is not a
 * location: when Revo relocates a club the portal keeps the old site under its
 * original name and gives the new building a suffixed one. Cockburn is the live
 * example — the portal reports "Cockburn" (id 11, the original club at 660
 * Beeliar Drive) and "Cockburn2" (id 91, the club at 635 Beeliar Drive that
 * opened in October 2026 and that the public site now publishes as /gyms/cockburn/).
 *
 * Tracking them name-for-name paints one gym with the other's numbers: the
 * original's count showed on a page describing the new 2,450 m² building, and
 * the new club — by then the busier of the two — was dropped as a non-gym
 * because /gyms/cockburn2/ does not exist. This table is the translation the
 * portal does not provide.
 *
 * Rules for an entry:
 * - the key is the portal club name (normalized by `normalizeGymName`);
 * - the value is the gym name in `Revo_Gyms` and must already exist there, or
 *   the club is dropped for that cycle;
 * - a gym that has no public detail page (a club Revo no longer publishes, such
 *   as the original Cockburn once it has been superseded) goes in
 *   `GYMS_WITHOUT_DETAIL_PAGE` so enrichment leaves its stored metadata alone
 *   instead of overwriting it with the successor's page.
 *
 * Delete the Cockburn entries once Revo closes the original club; at that point
 * the portal's "Cockburn" club disappears and its gym record can be deactivated.
 */

import { normalizeGymName } from "./gymFilter";

/** Portal club name → tracked gym name. */
export const CLUB_GYM_OVERRIDES: Record<string, string> = {
	cockburn: "Cockburn (Original)",
	cockburn2: "Cockburn",
};

/**
 * Gyms Revo does not publish a detail page for. Their stored size, racks and
 * address are the app's truth and must survive every enrichment pass.
 */
export const GYMS_WITHOUT_DETAIL_PAGE: ReadonlySet<string> = new Set(["cockburn (original)"]);

/** The gym a portal club reports counts for. */
export const resolveClubGymName = (clubName: string): string =>
	CLUB_GYM_OVERRIDES[normalizeGymName(clubName)] ?? clubName;

/** Whether the public directory publishes a detail page for this gym. */
export const hasDetailPage = (gymName: string): boolean =>
	!GYMS_WITHOUT_DETAIL_PAGE.has(normalizeGymName(gymName));
