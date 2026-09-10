import { describe, expect, test, mock } from "bun:test";
import { ClientResponseError } from "pocketbase";
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

const mockEnsureAdminAuth = mock(async () => {});
const mockInvalidateAdminAuth = mock(() => {});

// Rows that PocketBase would have persisted; a test can swap `createImpl` to
// simulate the server rejecting a write.
const createdRows: Record<string, unknown>[] = [];
let createImpl: (payload: Record<string, unknown>) => Promise<unknown> = async () => ({});

const mockCreate = mock(async (payload: Record<string, unknown>) => {
    const result = await createImpl(payload);
    createdRows.push(payload);
    return result;
});

// Mock the PocketBase client with a fixed gym list
mock.module("../src/utils/database", () => ({
    pb: {
        collection: mock(() => ({
            getFullList: mock(async () => [
                { id: "test-gym", name: "Test Gym", postcode: 6000, active: true, area_size: 1000, address: "123 Test St", state: "WA", squat_racks: 0, timezone: "Australia/Perth" },
                { id: "other-gym", name: "Other Gym", postcode: 6001, active: true, area_size: 800, address: "456 Other St", state: "WA", squat_racks: 0, timezone: "Australia/Perth" },
            ]),
            getList: mock(async () => ({ items: [] })),
            create: mockCreate,
            update: mock(async () => ({})),
        })),
        authStore: { isValid: true },
    },
    ensureAdminAuth: mockEnsureAdminAuth,
    invalidateAdminAuth: mockInvalidateAdminAuth,
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

describe("Parser auth recovery", () => {
    test("a token rejected by PocketBase is refreshed and the row is still written", async () => {
        let createAttempts = 0;
        createdRows.length = 0;
        mockEnsureAdminAuth.mockClear();
        mockInvalidateAdminAuth.mockClear();
        createImpl = async () => {
            createAttempts++;
            if (createAttempts === 1) {
                throw new ClientResponseError({
                    url: "https://pb.test/api/collections/Revo_Gym_Count/records",
                    status: 403,
                    response: { error: "Only superusers can perform this action." },
                });
            }
            return {};
        };

        const { insertGymStats } = await import("../src/utils/parser");
        await insertGymStats(sampleGymData);

        expect(createdRows.map((row) => row.gym_name)).toEqual(["Test Gym", "Other Gym"]);
        expect(mockInvalidateAdminAuth).toHaveBeenCalledTimes(1);
        expect(mockEnsureAdminAuth).toHaveBeenCalledTimes(2); // startup + after the rejection

        createImpl = async () => ({});
    });

    test("a run that writes nothing fails instead of reporting success", async () => {
        createdRows.length = 0;
        createImpl = async () => {
            throw new ClientResponseError({
                url: "https://pb.test/api/collections/Revo_Gym_Count/records",
                status: 403,
                response: { error: "Only superusers can perform this action." },
            });
        };

        const { insertGymStats } = await import("../src/utils/parser");
        await expect(insertGymStats(sampleGymData)).rejects.toThrow(/inserts failed/i);

        createImpl = async () => ({});
    });
});
