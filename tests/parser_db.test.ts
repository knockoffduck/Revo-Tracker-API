import { describe, expect, test, mock, beforeEach } from "bun:test";
import { GymInfo } from "../src/utils/types";

// Mock Database
const mockInsert = mock(() => mockDb);
const mockValues = mock(() => mockDb);
const mockOnDuplicateKeyUpdate = mock(() => mockDb);
const mockSelect = mock(() => mockDb);
const mockFrom = mock(() => mockDb);

const mockDb = {
    insert: mockInsert,
    values: mockValues,
    onDuplicateKeyUpdate: mockOnDuplicateKeyUpdate,
    select: mockSelect,
    from: mockFrom,
    then: (resolve: any) => resolve([]), // Default empty resolved promise
};

mock.module("../src/utils/database", () => ({
    db: mockDb
}));

describe("Parser Database Operations", () => {
    beforeEach(() => {
        mockInsert.mockClear();
        mockValues.mockClear();
        mockOnDuplicateKeyUpdate.mockClear();
        mockSelect.mockClear();
        mockFrom.mockClear();
    });

    const sampleGymData: GymInfo[] = [
        {
            name: "Test Gym",
            address: "123 Test St",
            postcode: 6000,
            state: "WA",
            size: 1000,
            member_count: 100,
            member_ratio: 10,
            percentage: 50
        }
    ];

    test("updateGymInfo should call db.insert and onDuplicateKeyUpdate", async () => {
        const { updateGymInfo } = await import("../src/utils/parser");
        await updateGymInfo(sampleGymData);
        
        expect(mockInsert).toHaveBeenCalled();
        expect(mockValues).toHaveBeenCalled();
        expect(mockOnDuplicateKeyUpdate).toHaveBeenCalled();
    });

    test("insertGymStats should call db.insert for each gym and missing gyms", async () => {
        const { insertGymStats } = await import("../src/utils/parser");
        
        let selectCalled = false;
        mockDb.then = (resolve: any) => {
            if (!selectCalled) {
                selectCalled = true;
                return resolve([{ id: "missing-1", name: "Missing Gym", postcode: 6001, active: 1, areaSize: 0, address: "", state: "WA", squatRacks: 0 }]);
            }
            return resolve([]);
        };

        await insertGymStats(sampleGymData);
        
        expect(mockInsert).toHaveBeenCalled();
        expect(mockInsert).toHaveBeenCalledTimes(2);
    });

    test("insertGymStats should write O'Connor counts to the canonical OConnor gym row", async () => {
        const { insertGymStats } = await import("../src/utils/parser");

        mockDb.then = (resolve: any) => resolve([
            { id: "15749878", name: "OConnor", postcode: 6163, active: 1, areaSize: 1480, address: "5 Stockdale Rd, O’Connor WA 6163", state: "WA", squatRacks: 5 },
            { id: "5852969", name: "O'Connor", postcode: 0, active: 0, areaSize: 0, address: "Pending Update", state: "Unknown", squatRacks: 0 },
        ]);

        await insertGymStats([
            {
                name: "O'Connor",
                address: "Pending Update",
                postcode: 0,
                state: "Unknown",
                size: 0,
                member_count: 20,
                member_ratio: 0,
                percentage: 0,
            }
        ]);

        const firstInsert = mockValues.mock.calls[0][0];
        expect(firstInsert.gymId).toBe("15749878");
        expect(firstInsert.gymName).toBe("OConnor");
        expect(firstInsert.ratio).toBe(74);
    });

    test("updateGymInfo should preserve the canonical OConnor gym row", async () => {
        const { updateGymInfo } = await import("../src/utils/parser");

        mockDb.then = (resolve: any) => resolve([
            { id: "15749878", name: "OConnor", postcode: 6163, active: 1, areaSize: 1480, address: "5 Stockdale Rd, O’Connor WA 6163", state: "WA", squatRacks: 5 },
            { id: "5852969", name: "O'Connor", postcode: 0, active: 0, areaSize: 0, address: "Pending Update", state: "Unknown", squatRacks: 0 },
        ]);

        await updateGymInfo([
            {
                name: "O'Connor",
                address: "Pending Update",
                postcode: 0,
                state: "Unknown",
                size: 0,
                member_count: 20,
                member_ratio: 0,
                percentage: 0,
            }
        ]);

        const firstUpsert = mockValues.mock.calls[0][0];
        expect(firstUpsert.id).toBe("15749878");
        expect(firstUpsert.name).toBe("OConnor");
        expect(firstUpsert.postcode).toBe(6163);
        expect(firstUpsert.address).toContain("Stockdale Rd");
    });
});
