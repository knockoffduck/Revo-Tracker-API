import { describe, expect, test } from "bun:test";
import { filterTrackableClubs } from "../src/utils/gymFilter";

// Gym names Revo_Gyms already holds, and the names the public gym directory lists.
const knownGymNames = ["OConnor", "Nunawading", "Knoxfield"];
const openGymNames = ["O'Connor", "Nunawading", "Knoxfield", "Forrestdale"];

const club = (name: string) => ({ name, count: 0 });

describe("filterTrackableClubs", () => {
    test("tracks a club the directory lists even before it has a gym record", () => {
        const { tracked, skipped } = filterTrackableClubs([club("Forrestdale")], {
            knownGymNames,
            openGymNames,
        });

        expect(tracked.map((gym) => gym.name)).toEqual(["Forrestdale"]);
        expect(skipped).toEqual([]);
    });

    test("skips a club that is neither tracked nor listed — an unopened site", () => {
        const { tracked, skipped } = filterTrackableClubs(
            [club("Trinity Gardens"), club("Busselton")],
            { knownGymNames, openGymNames },
        );

        expect(tracked).toEqual([]);
        expect(skipped.map((gym) => gym.name)).toEqual(["Trinity Gardens", "Busselton"]);
    });

    test("skips the retired club of a listed gym instead of duplicating it", () => {
        const { tracked, skipped } = filterTrackableClubs(
            [club("Nunawading - (Original)"), club("Knox"), club("Nunawading")],
            { knownGymNames, openGymNames },
        );

        expect(tracked.map((gym) => gym.name)).toEqual(["Nunawading"]);
        expect(skipped.map((gym) => gym.name)).toEqual(["Nunawading - (Original)", "Knox"]);
    });

    test("tracks a known gym, matching the portal's spelling, when the directory is unavailable", () => {
        const { tracked, skipped } = filterTrackableClubs([club("O'Connor")], {
            knownGymNames,
            openGymNames: null,
        });

        expect(tracked.map((gym) => gym.name)).toEqual(["O'Connor"]);
        expect(skipped).toEqual([]);
    });

    test("skips an unknown club when the directory is unavailable", () => {
        const { tracked, skipped } = filterTrackableClubs([club("Cockburn2")], {
            knownGymNames,
            openGymNames: null,
        });

        expect(tracked).toEqual([]);
        expect(skipped.map((gym) => gym.name)).toEqual(["Cockburn2"]);
    });
});
