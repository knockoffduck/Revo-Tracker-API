import { describe, expect, test, mock } from "bun:test";
import { GymInfo } from "../src/utils/types";

const mockInsert = mock(() => mockDb);
const mockValues = mock(() => mockDb);
const mockOnDuplicateKeyUpdate = mock(() => mockDb);

const mockDb = {
    insert: mockInsert,
    values: mockValues,
    onDuplicateKeyUpdate: mockOnDuplicateKeyUpdate,
};

// Mock the MySQL client
mock.module("../src/db/database", () => ({
    sqlDb: mockDb,
}));

// Mock the PocketBase client with a fixed gym list
mock.module("../src/utils/database", () => ({
    pb: {
        collection: mock(() => ({
            getFullList: mock(async () => [
                { id: "test-gym", name: "Test Gym", postcode: 6000, active: true, area_size: 1000, address: "123 Test St", state: "WA", squat_racks: 0, timezone: "Australia/Perth" },
                { id: "other-gym", name: "Other Gym", postcode: 6001, active: true, area_size: 800, address: "456 Other St", state: "WA", squat_racks: 0, timezone: "Australia/Perth" },
            ]),
            getList: mock(async () => ({ items: [] })),
            create: mock(async () => ({})),
            update: mock(async () => ({})),
        })),
        authStore: { isValid: true },
    },
    ensureAdminAuth: mock(async () => {}),
    toPbDate: mock((d: Date) => d.toISOString()),
    toSqlDate: mock((d: Date) => d.toISOString().slice(0, 19).replace("T", " ")),
}));

const sampleGymData: GymInfo[] = [
    {
        name: "Test Gym",
        address: "123 Test St",
        postcode: 6000,
        state: "WA",
        size: 1000,
        member_count: 100,
        member_ratio: 10,
        percentage: 50,
    },
];

describe("Parser Database Operations", () => {
    test("updateGymInfo should call sqlDb.insert and onDuplicateKeyUpdate", async () => {
        const { updateGymInfo } = await import("../src/utils/parser");
        await updateGymInfo(sampleGymData);

        expect(mockInsert).toHaveBeenCalled();
        expect(mockValues).toHaveBeenCalled();
        expect(mockOnDuplicateKeyUpdate).toHaveBeenCalled();
    });

    test("insertGymStats should call sqlDb.insert for scraped gyms and missing gyms", async () => {
        const { insertGymStats } = await import("../src/utils/parser");
        await insertGymStats(sampleGymData);

        expect(mockInsert).toHaveBeenCalled();
        expect(mockInsert).toHaveBeenCalledTimes(2);
    });
});
