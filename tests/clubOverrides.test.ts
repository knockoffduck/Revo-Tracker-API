import { describe, expect, test } from "bun:test";
import {
	CLUB_GYM_OVERRIDES,
	hasDetailPage,
	resolveClubGymName,
} from "../src/utils/clubOverrides";
import { filterTrackableClubs, postcodeMatchesState } from "../src/utils/gymFilter";

describe("resolveClubGymName", () => {
	test("sends the portal's suffixed club to the gym the public site publishes", () => {
		expect(resolveClubGymName("Cockburn2")).toBe("Cockburn");
	});

	test("sends the original club of a relocated site to its own gym", () => {
		expect(resolveClubGymName("Cockburn")).toBe("Cockburn (Original)");
	});

	test("leaves every other club alone", () => {
		expect(resolveClubGymName("Innaloo")).toBe("Innaloo");
		expect(resolveClubGymName("O'Connor")).toBe("O'Connor");
	});

	test("matches the portal's spelling variants", () => {
		expect(resolveClubGymName("  cockburn2 ")).toBe("Cockburn");
	});
});

describe("hasDetailPage", () => {
	test("is false for a club Revo no longer publishes", () => {
		expect(hasDetailPage("Cockburn (Original)")).toBe(false);
	});

	test("is true for a published gym", () => {
		expect(hasDetailPage("Cockburn")).toBe(true);
		expect(hasDetailPage("Innaloo")).toBe(true);
	});
});

describe("relocated clubs survive the gym filter", () => {
	const openGymNames = ["Cockburn", "Innaloo", "Knoxfield"];
	const clubs = [
		{ name: resolveClubGymName("Cockburn2"), count: 14 },
		{ name: resolveClubGymName("Cockburn"), count: 1 },
	];

	test("the new club is tracked as the published gym", () => {
		const { tracked } = filterTrackableClubs(clubs, {
			knownGymNames: [],
			openGymNames,
		});
		expect(tracked.map((club) => club.name)).toEqual(["Cockburn"]);
	});

	test("the original club is tracked once its gym record exists", () => {
		const { tracked, skipped } = filterTrackableClubs(clubs, {
			knownGymNames: ["Cockburn (Original)"],
			openGymNames,
		});
		expect(tracked.map((club) => club.name)).toEqual(["Cockburn", "Cockburn (Original)"]);
		expect(skipped).toEqual([]);
	});

	test("the original club is not invented before its record exists", () => {
		const { tracked } = filterTrackableClubs(clubs, { knownGymNames: [], openGymNames });
		expect(tracked.map((club) => club.name)).not.toContain("Cockburn (Original)");
	});
});

describe("postcodeMatchesState", () => {
	test("accepts a postcode from the state's block", () => {
		expect(postcodeMatchesState(6164, "WA")).toBe(true);
		expect(postcodeMatchesState(5045, "SA")).toBe(true);
		expect(postcodeMatchesState(2154, "NSW")).toBe(true);
	});

	test("rejects a year that was scraped out of prose", () => {
		expect(postcodeMatchesState(2026, "WA")).toBe(false);
		expect(postcodeMatchesState(2027, "VIC")).toBe(false);
	});

	test("rejects a postcode from another state", () => {
		expect(postcodeMatchesState(6164, "VIC")).toBe(false);
	});

	test("falls back to the national range for an unknown state", () => {
		expect(postcodeMatchesState(6164, null)).toBe(true);
		expect(postcodeMatchesState(20, null)).toBe(false);
	});
});

describe("override table shape", () => {
	test("keys are normalized club names", () => {
		for (const key of Object.keys(CLUB_GYM_OVERRIDES)) {
			expect(key).toBe(key.trim().toLowerCase());
		}
	});
});
