import { describe, expect, test, mock } from "bun:test";
import {
    generateTimeSlots,
    getLocalTimeParts,
    calculateTrends,
    formatTrendDataForDay,
} from "../src/agents/trendAgent";

// Mock the database module
mock.module("../src/utils/database", () => {
    const mockDb = {
        select: mock(() => mockDb),
        from: mock(() => mockDb),
        where: mock(() => mockDb),
        orderBy: mock(() => mockDb),
        limit: mock(() => mockDb),
        insert: mock(() => mockDb),
        values: mock(() => mockDb),
        onDuplicateKeyUpdate: mock(() => mockDb),
        innerJoin: mock(() => mockDb),
        then: (resolve: any) => resolve([]),
    };
    return { db: mockDb };
});

describe("TrendAgent Unit Tests", () => {
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
            const records: any[] = [];
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
});
