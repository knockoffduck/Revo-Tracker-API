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
        
        // Mock existing gyms to return one gym that is NOT in sampleGymData
        // We need to re-mock 'then' for this specific call or use a different approach.
        // Since we are mocking the module once, we can change the 'then' behavior.
        
        let selectCalled = false;
        mockDb.then = (resolve: any) => {
            if (!selectCalled) {
                selectCalled = true;
                return resolve([{ name: "Missing Gym", postcode: 6001 }]); // existing gyms list
            }
            return resolve([]);
        };

        await insertGymStats(sampleGymData);

        // Should be called for Test Gym AND Missing Gym (total 2)
        // Wait, the logic in insertGymStats:
        // for (const gym of gymData) { ... db.insert ... }
        // const missingGyms = gymList.filter(...)
        // for (const gym of missingGyms) { ... db.insert ... }
        
        expect(mockInsert).toHaveBeenCalled();
        expect(mockInsert).toHaveBeenCalledTimes(2);
    });
});
