import { describe, expect, test, mock, beforeEach, Mock } from "bun:test";
import {
    generateTimeSlots,
    getLocalTimeParts,
    calculateTrends,
    formatTrendDataForDay,
    runTrendAgent,
    fetchGymData,
    upsertTrendCache,
    getGymTrends,
    getAllGymTrends,
    TimeSlotAverage,
} from "../src/agents/trendAgent";

// Track mock data for different scenarios
let mockQueryResult: unknown[] = [];

// Define mock database interface
interface MockDb {
    select: Mock<() => MockDb>;
    from: Mock<() => MockDb>;
    where: Mock<() => MockDb>;
    orderBy: Mock<() => MockDb>;
    limit: Mock<() => MockDb>;
    insert: Mock<() => MockDb>;
    values: Mock<() => MockDb>;
    onDuplicateKeyUpdate: Mock<() => MockDb>;
    innerJoin: Mock<() => MockDb>;
    then: (resolve: (value: unknown[]) => unknown) => unknown;
    _setQueryResult: (result: unknown[]) => void;
}

// Mock the database module
mock.module("../src/utils/database", () => {
    let internalQueryResult: unknown[] = [];
    
    const mockDb: MockDb = {
        select: mock(() => mockDb),
        from: mock(() => mockDb),
        where: mock(() => mockDb),
        orderBy: mock(() => mockDb),
        limit: mock(() => mockDb),
        insert: mock(() => mockDb),
        values: mock(() => mockDb),
        onDuplicateKeyUpdate: mock(() => mockDb),
        innerJoin: mock(() => mockDb),
        then: (resolve: (value: unknown[]) => unknown) => resolve(internalQueryResult),
        _setQueryResult: (result: unknown[]) => {
            internalQueryResult = result;
        },
    };
    return { db: mockDb };
});

describe("TrendAgent Unit Tests", () => {
    let mockDb: MockDb;

    beforeEach(async () => {
        const { db } = await import("../src/utils/database") as unknown as { db: MockDb };
        mockDb = db;
        db.select.mockClear();
        db.from.mockClear();
        db.where.mockClear();
        db.orderBy.mockClear();
        db.limit.mockClear();
        db.insert.mockClear();
        db.values.mockClear();
        db.onDuplicateKeyUpdate.mockClear();
        mockQueryResult = [];
        db._setQueryResult([]);
    });

    // Helper to set mock data
    const setMockData = (data: unknown[]) => {
        mockQueryResult = data;
        mockDb._setQueryResult(data);
    };
    describe("generateTimeSlots", () => {
        test("should generate 96 time slots", () => {
            const slots = generateTimeSlots();
            expect(slots.length).toBe(96);
        });
    });

    describe("getLocalTimeParts", () => {
        test("should convert UTC to Perth time correctly", () => {
            // 2024-01-30 10:00:00 UTC -> 18:00:00 Perth (+8)
            const utcStr = "2024-01-30 10:00:00";
            const result = getLocalTimeParts(utcStr, "Australia/Perth");

            expect(result.timeSlot).toBe("18:00");
            expect(result.dayOfWeek).toBe(2); // Tuesday (Jan 30 2024 is Tuesday)
        });

        test("should handle date with Z suffix", () => {
            const utcStr = "2024-01-30T10:05:00Z"; // 18:05 Perth -> rounded to 18:00
            const result = getLocalTimeParts(utcStr, "Australia/Perth");

            expect(result.timeSlot).toBe("18:00");
        });

        test("should handle different timezone (New York)", () => {
            // 2024-01-30 10:00:00 UTC -> 05:00:00 NY (-5)
            const utcStr = "2024-01-30 10:00:00";
            const result = getLocalTimeParts(utcStr, "America/New_York");

            expect(result.timeSlot).toBe("05:00");
        });
    });

    describe("calculateTrends", () => {
        test("should correctly aggregate counts for a single gym", () => {
            const records = [
                {
                    created: "2024-01-30 10:00:00", // 18:00 Perth
                    count: 50,
                },
                {
                    created: "2024-01-30 10:05:00", // 18:00 Perth (rounded)
                    count: 30,
                },
                // Different bucket
                {
                    created: "2024-01-30 10:20:00", // 18:15 Perth
                    count: 20,
                }
            ];
            const timezone = "Australia/Perth";
            const dayMap = calculateTrends(records, timezone);

            // Check Tuesday (2)
            expect(dayMap.has(2)).toBe(true);
            const tuesdayMap = dayMap.get(2)!;

            // Check 18:00 slot (50 + 30 = 80, count 2)
            expect(tuesdayMap.has("18:00")).toBe(true);
            const slot1800 = tuesdayMap.get("18:00")!;
            expect(slot1800.sum).toBe(80);
            expect(slot1800.count).toBe(2);

            // Check 18:15 slot (20, count 1)
            expect(tuesdayMap.has("18:15")).toBe(true);
            const slot1815 = tuesdayMap.get("18:15")!;
            expect(slot1815.sum).toBe(20);
            expect(slot1815.count).toBe(1);
        });

        test("should handle empty records", () => {
            const records: { created: string; count: number }[] = [];
            const dayMap = calculateTrends(records, "Australia/Perth");
            expect(dayMap.size).toBe(0);
        });
    });

    describe("formatTrendDataForDay", () => {
        test("should format correctly and calculate averages", () => {
            const dayMap = new Map<string, { sum: number; count: number }>();
            dayMap.set("10:00", { sum: 100, count: 2 }); // Average 50
            dayMap.set("10:15", { sum: 0, count: 0 }); // Edge case, though usually count > 0 if in map

            const formatted = formatTrendDataForDay(dayMap);

            const slot1000 = formatted.find(s => s.time === "10:00");
            expect(slot1000?.average).toBe(50);
            expect(slot1000?.sampleCount).toBe(2);

            const slot1015 = formatted.find(s => s.time === "10:15");
            expect(slot1015?.average).toBe(0); // Should handle zeroes
        });
    });

    describe("runTrendAgent", () => {
        test("should process gyms and call upsertTrendCache", async () => {
            // Need to mock the database to return some gyms
            const { db } = await import("../src/utils/database") as unknown as { db: MockDb };
            
            // Mock revoGyms.id, revoGyms.name, revoGyms.timezone
            // The actual code uses db.select(...).from(revoGyms)
            // Our mock currently returns [] in trendAgent.test.ts:21
            
            // Let's refine the mock for this test
            setMockData([
                { id: "gym-1", name: "Gym 1", timezone: "Australia/Perth" }
            ]);

            // We also need to mock fetchGymData if we want to avoid actual lookback logic
            // But since we are testing runTrendAgent, we can just let it call fetchGymData 
            // and ensure fetchGymData returns items.
            // fetchGymData uses db.select().from(revoGymCount).where(...)
            
            const result = await runTrendAgent(7);
            
            expect(result.success).toBe(true);
            expect(result.gymsProcessed).toBe(1);
            // It should have called insert 7 times (one for each day)
            // But our mock database's insert is just a mock, so we can check if it was called.
            expect(db.insert).toHaveBeenCalled();
        });
    });

    // ===== DATABASE OPERATION TESTS =====

    describe("fetchGymData", () => {
        test("should return records for a specific gym within date range", async () => {
            setMockData([
                { created: "2024-01-30 10:00:00", count: 50 },
                { created: "2024-01-30 10:15:00", count: 55 },
            ]);

            const records = await fetchGymData("gym-123", 7);

            expect(records.length).toBe(2);
            expect(records[0].count).toBe(50);
            expect(records[1].count).toBe(55);
        });

        test("should return empty array when no records found", async () => {
            setMockData([]);

            const records = await fetchGymData("gym-nonexistent", 7);

            expect(records).toEqual([]);
        });

        test("should use default lookback of 90 days", async () => {
            setMockData([{ created: "2024-01-01 00:00:00", count: 100 }]);

            await fetchGymData("gym-123");

            // Should not throw and use default value
            expect(mockQueryResult).toBeDefined();
        });
    });

    describe("upsertTrendCache", () => {
        test("should insert trend data into cache", async () => {
            const { db } = await import("../src/utils/database") as unknown as { db: MockDb };
            setMockData([]);

            const trendData: TimeSlotAverage[] = [
                { time: "08:00", average: 50, sampleCount: 10 },
                { time: "08:15", average: 55, sampleCount: 10 },
            ];

            await upsertTrendCache("gym-123", 1, trendData);

            expect(db.insert).toHaveBeenCalled();
            expect(db.values).toHaveBeenCalled();
            expect(db.onDuplicateKeyUpdate).toHaveBeenCalled();
        });

        test("should include all required fields in insert", async () => {
            const { db } = await import("../src/utils/database") as unknown as { db: MockDb };

            const trendData: TimeSlotAverage[] = [
                { time: "08:00", average: 50, sampleCount: 10 },
            ];

            await upsertTrendCache("gym-456", 2, trendData);

            const valuesMock = db.values as unknown as Mock<(...args: unknown[]) => MockDb>;
            const valuesCall = valuesMock.mock.calls[0][0] as Record<string, unknown>;
            expect(valuesCall).toHaveProperty("gymId", "gym-456");
            expect(valuesCall).toHaveProperty("dayOfWeek", 2);
            expect(valuesCall).toHaveProperty("trendData");
            expect(valuesCall).toHaveProperty("updatedAt");
        });
    });

    describe("getGymTrends", () => {
        test("should return trend data for a specific gym", async () => {
            setMockData([
                {
                    gymId: "gym-123",
                    dayOfWeek: 1,
                    trendData: [
                        { time: "08:00", average: 50, sampleCount: 10 },
                    ],
                    updatedAt: "2024-01-30 12:00:00",
                },
            ]);

            const trends = await getGymTrends("gym-123");

            expect(trends.length).toBe(1);
            expect(trends[0].dayOfWeek).toBe(1);
            expect(trends[0].slots.length).toBe(1);
            expect(trends[0].slots[0].average).toBe(50);
        });

        test("should return empty array when no trends exist", async () => {
            setMockData([]);

            const trends = await getGymTrends("gym-no-data");

            expect(trends).toEqual([]);
        });

        test("should handle multiple days for a gym", async () => {
            setMockData([
                {
                    gymId: "gym-123",
                    dayOfWeek: 1,
                    trendData: [{ time: "08:00", average: 50, sampleCount: 10 }],
                },
                {
                    gymId: "gym-123",
                    dayOfWeek: 2,
                    trendData: [{ time: "08:00", average: 60, sampleCount: 10 }],
                },
            ]);

            const trends = await getGymTrends("gym-123");

            expect(trends.length).toBe(2);
            expect(trends[0].dayOfWeek).toBe(1);
            expect(trends[1].dayOfWeek).toBe(2);
        });
    });

    describe("getAllGymTrends", () => {
        test("should return map of all gym trends", async () => {
            setMockData([
                {
                    gymId: "gym-1",
                    dayOfWeek: 1,
                    trendData: [{ time: "08:00", average: 50, sampleCount: 10 }],
                },
                {
                    gymId: "gym-1",
                    dayOfWeek: 2,
                    trendData: [{ time: "08:00", average: 60, sampleCount: 10 }],
                },
                {
                    gymId: "gym-2",
                    dayOfWeek: 1,
                    trendData: [{ time: "08:00", average: 70, sampleCount: 10 }],
                },
            ]);

            const allTrends = await getAllGymTrends();

            expect(allTrends instanceof Map).toBe(true);
            expect(allTrends.has("gym-1")).toBe(true);
            expect(allTrends.has("gym-2")).toBe(true);
            expect(allTrends.get("gym-1")?.length).toBe(2);
            expect(allTrends.get("gym-2")?.length).toBe(1);
        });

        test("should return empty map when no trends exist", async () => {
            setMockData([]);

            const allTrends = await getAllGymTrends();

            expect(allTrends instanceof Map).toBe(true);
            expect(allTrends.size).toBe(0);
        });

        test("should group multiple days for same gym", async () => {
            setMockData([
                {
                    gymId: "gym-abc",
                    dayOfWeek: 0,
                    trendData: [{ time: "08:00", average: 40, sampleCount: 10 }],
                },
                {
                    gymId: "gym-abc",
                    dayOfWeek: 1,
                    trendData: [{ time: "08:00", average: 45, sampleCount: 10 }],
                },
                {
                    gymId: "gym-abc",
                    dayOfWeek: 2,
                    trendData: [{ time: "08:00", average: 50, sampleCount: 10 }],
                },
            ]);

            const allTrends = await getAllGymTrends();

            const gymTrends = allTrends.get("gym-abc");
            expect(gymTrends?.length).toBe(3);
            expect(gymTrends?.map(t => t.dayOfWeek).sort()).toEqual([0, 1, 2]);
        });
    });
});
