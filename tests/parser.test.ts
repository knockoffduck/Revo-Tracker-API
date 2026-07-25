import { describe, expect, test, mock, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import { file } from "bun";
import path from "path";

// Mock Axios
mock.module("axios", () => {
    return {
        default: {
            get: mock(async () => {
                // Read the mock HTML file
                const mockHtmlPath = path.join(import.meta.dir, "mocks", "gym_site.html");
                const mockHtml = await file(mockHtmlPath).text();

                return {
                    data: mockHtml,
                    status: 200,
                };
            }),
        },
    };
});

// Mock MySQL client so dual writes are skipped in these tests.
mock.module("../src/db/database", () => ({
    sqlDb: null,
}));

const mockGyms = [
    { id: "perth-city", name: "Perth City", address: "123 Hay St, Perth", postcode: 6000, state: "WA", area_size: 1500, active: true, timezone: "Australia/Perth" },
    { id: "scarborough", name: "Scarborough", address: "555 Coast Rd, Scarborough", postcode: 6019, state: "WA", area_size: 2000, active: true, timezone: "Australia/Perth" },
    { id: "claremont", name: "Claremont", address: "10 Bay View Tce, Claremont", postcode: 6010, state: "WA", area_size: 1000, active: true, timezone: "Australia/Perth" },
    { id: "oconnor", name: "OConnor", address: "5 Stockdale Rd, O’Connor", postcode: 6163, state: "WA", area_size: 1480, active: true, timezone: "Australia/Perth" },
];

const createPbCollection = () => ({
    getFullList: mock(async () => mockGyms),
    getList: mock(async () => ({ items: [] })),
    create: mock(async () => ({})),
    update: mock(async () => ({})),
});

// Mock PocketBase client
mock.module("../src/utils/database", () => ({
    pb: {
        collection: mock(() => createPbCollection()),
        authStore: { isValid: true },
    },
    ensureAdminAuth: mock(async () => {}),
    toPbDate: mock((d: Date) => d.toISOString()),
    toSqlDate: mock((d: Date) => d.toISOString().slice(0, 19).replace("T", " ")),
}));

describe("Parser tests", () => {
    test("parseHTML should correctly extract gym data from mock HTML", async () => {
        // Dynamic import to ensure mocks are applied
        const { parseHTML } = await import("../src/utils/parser");
        
        const gymData = await parseHTML();

        // We expect 4 gyms based on our mock HTML
        expect(gymData).toBeDefined();
        expect(gymData?.length).toBe(4);

        const perthCity = gymData?.find(gym => gym.name === "Perth City");
        expect(perthCity).toBeDefined();
        expect(perthCity?.address).toContain("123 Hay St, Perth");
        expect(perthCity?.postcode).toBe(6000);
        expect(perthCity?.state).toBe("WA");
        expect(perthCity?.size).toBe(1500);
        expect(perthCity?.member_count).toBe(151);
        expect(perthCity?.member_ratio).toBeCloseTo(1500 / 151); 

        const scarborough = gymData?.find(gym => gym.name === "Scarborough");
        expect(scarborough?.member_count).toBe(401);
        expect(scarborough?.size).toBe(2000);
        expect(scarborough?.member_ratio).toBeCloseTo(2000 / 401);

        const claremont = gymData?.find(gym => gym.name === "Claremont");
        expect(claremont).toBeDefined();
        expect(claremont?.size).toBe(1000);
        expect(claremont?.member_count).toBe(51);
        expect(claremont?.member_ratio).toBeCloseTo(1000 / 51);

        const oconnor = gymData?.find(gym => gym.name === "OConnor");
        expect(oconnor).toBeDefined();
        expect(oconnor?.address).toContain("Stockdale Rd");
        expect(oconnor?.postcode).toBe(6163);
        expect(oconnor?.size).toBe(1480);
        expect(oconnor?.member_count).toBe(61);
        expect(oconnor?.member_ratio).toBeCloseTo(1480 / 61);
        expect(gymData?.find(gym => gym.name === "O'Connor")).toBeUndefined();
    });

    test("Handling of missing data", async () => {
        // We can add another test case or modify mock behavior dynamically if needed
        // For now, the mock is static.
    });
});
