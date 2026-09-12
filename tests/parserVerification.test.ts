import { describe, expect, test, mock, beforeEach } from "bun:test";

/**
 * A gym that opens is on the club counter before the public gym directory lists
 * it, so the scrape has to fall back to the gym's own detail page — the same
 * page the app reads size, squat racks and address from. These tests cover that
 * path and the two ways it must not create a gym: a club without a page, and an
 * alias club pointing at a gym that is already tracked.
 */

const clubCounterHtml = `<script>
    var clubCounterLists = {
        "Fitzroy North": { "name": "Fitzroy North", "in_club": "42" },
        "Knox": { "name": "Knox", "in_club": "0" },
        "Trinity Gardens": { "name": "Trinity Gardens", "in_club": "0" }
    };
</script>`;

const detailPages: Record<string, string> = {
    "fitzroy-north": `<html><body>
        <div>8 Squat racks</div>
        <div>1500 sq/m</div>
        <p>12 Smith St, Fitzroy North VIC 3068</p>
    </body></html>`,
    knox: `<html><body>
        <div>9 Squat racks</div>
        <div>1180 sq/m</div>
        <p>Tenancy 6, 1464 Ferntree Gully Rd, Knoxfield 3180</p>
    </body></html>`,
};

mock.module("axios", () => ({
    default: {
        get: mock(async (url: string) => {
            if (url.includes("club-counter.php")) return { data: clubCounterHtml, status: 200 };

            const slug = url.match(/revofitness\.com\.au\/gyms\/([^/]+)\/$/)?.[1];
            // The directory listing itself carries neither; the gyms page has no
            // renderable post list here, which is the "directory unavailable" path.
            if (!slug) return { data: "<html><body>Directory</body></html>", status: 200 };
            if (slug in detailPages) return { data: detailPages[slug], status: 200 };

            throw Object.assign(new Error(`Request failed with status code 404`), { status: 404 });
        }),
    },
}));

mock.module("../src/db/database", () => ({ sqlDb: null }));

// PocketBase stand-in: knows which gyms exist, records what the scrape writes.
let gymRecords: Record<string, unknown>[] = [];
let gymCreates: Record<string, unknown>[] = [];
let countCreates: Record<string, unknown>[] = [];

mock.module("../src/utils/database", () => {
    const notFound = () => Object.assign(new Error("The requested resource wasn't found."), { status: 404 });

    return {
        pb: {
            collection: (name: string) => ({
                getFullList: mock(async () => (name === "Revo_Gyms" ? gymRecords : [])),
                getList: mock(async () => ({ items: [] })),
                create: mock(async (payload: Record<string, unknown>) => {
                    if (name === "Revo_Gyms") {
                        gymCreates.push(payload);
                        gymRecords.push({ ...payload });
                    } else {
                        countCreates.push(payload);
                    }
                    return {};
                }),
                update: mock(async (id: string, payload: Record<string, unknown>) => {
                    if (name !== "Revo_Gyms" || !gymRecords.some((record) => record.id === id)) throw notFound();
                    const record = gymRecords.find((candidate) => candidate.id === id)!;
                    Object.assign(record, payload);
                    return {};
                }),
                delete: mock(async () => ({})),
            }),
            authStore: { isValid: true, token: "test" },
        },
        ensureAdminAuth: mock(async () => {}),
        invalidateAdminAuth: mock(() => {}),
        toPbDate: mock((date: Date) => date.toISOString()),
        toSqlDate: mock((date: Date) => date.toISOString().slice(0, 19).replace("T", " ")),
    };
});

const knoxfieldRecord = {
    id: "knoxfield",
    name: "Knoxfield",
    address: "Tenancy 6, 1464 Ferntree Gully Rd, Knoxfield 3180",
    postcode: 3180,
    state: "VIC",
    area_size: 1180,
    active: true,
    timezone: "Australia/Melbourne",
    Squat_Racks: 9,
};

beforeEach(() => {
    gymRecords = [knoxfieldRecord];
    gymCreates = [];
    countCreates = [];
});

// `import()` at call time: the parser reads the mocked modules, so it must not be
// loaded before the `mock.module` registrations above.
describe("parseHTML — a gym confirmed by its own detail page", () => {
    test("tracks a gym that is not in the directory yet, with its page's metadata", async () => {
        const { parseHTML } = await import("../src/utils/parser");
        const gyms = await parseHTML();

        expect(gyms.map((gym) => gym.name)).toEqual(["Fitzroy North"]);

        const fitzroyNorth = gyms[0];
        expect(fitzroyNorth.size).toBe(1500);
        expect(fitzroyNorth.state).toBe("VIC");
        expect(fitzroyNorth.postcode).toBe(3068);
        expect(fitzroyNorth.address).toBe("12 Smith St, Fitzroy North VIC 3068");
        expect(fitzroyNorth.squat_racks).toBe(8);
        expect(fitzroyNorth.member_count).toBe(42);
        expect(fitzroyNorth.percentage).toBeCloseTo((42 / (1500 / 10)) * 100);
    });

    test("drops a club with no detail page and an alias of a tracked gym", async () => {
        const { parseHTML } = await import("../src/utils/parser");
        const gyms = await parseHTML();

        expect(gyms.map((gym) => gym.name)).not.toContain("Trinity Gardens");
        expect(gyms.map((gym) => gym.name)).not.toContain("Knox");
    });
});

describe("insertGymStats — registering a newly opened gym", () => {
    test("creates the gym record so the new gym appears, with its own timezone", async () => {
        const { insertGymStats } = await import("../src/utils/parser");
        const { parseHTML } = await import("../src/utils/parser");

        const gyms = await parseHTML();
        await insertGymStats(gyms);

        expect(gymCreates.map((gym) => gym.name)).toEqual(["Fitzroy North"]);
        const created = gymCreates[0];
        expect(created.area_size).toBe(1500);
        expect(created.Squat_Racks).toBe(8);
        expect(created.postcode).toBe(3068);
        expect(created.active).toBe(true);
        expect(created.timezone).toBe("Australia/Melbourne");

        // The snapshot's new row points at the record that was just created.
        const snapshot = countCreates.find((row) => row.gym_name === "Fitzroy North");
        expect(snapshot?.gym_id_rel).toBe(created.id);
    });
});
