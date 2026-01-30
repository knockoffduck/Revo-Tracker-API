import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
    generateTimeSlots,
    dateToSlot,
    calculateTrends,
    formatTrendDataForDay,
} from "../src/agents/trendAgent";

// Mock the database module to prevent actual DB calls
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
        then: (resolve: any) => resolve([]),
    };
    return { db: mockDb };
});

describe("TrendAgent Unit Tests", () => {
    describe("generateTimeSlots", () => {
        test("should generate 96 time slots for a 24-hour day (every 15 minutes)", () => {
            const slots = generateTimeSlots();
            expect(slots.length).toBe(96); // 24 hours * 4 slots per hour
        });

        test("should start with 00:00 and end with 23:45", () => {
            const slots = generateTimeSlots();
            expect(slots[0]).toBe("00:00");
            expect(slots[slots.length - 1]).toBe("23:45");
        });

        test("should have correct sequential slots", () => {
            const slots = generateTimeSlots();
            expect(slots[0]).toBe("00:00");
            expect(slots[1]).toBe("00:15");
            expect(slots[2]).toBe("00:30");
            expect(slots[3]).toBe("00:45");
            expect(slots[4]).toBe("01:00");
        });
    });

    describe("dateToSlot", () => {
        test("should round down to nearest 15-minute slot", () => {
            // 14:37 should round down to 14:30
            const date = new Date("2024-01-15T14:37:00");
            expect(dateToSlot(date)).toBe("14:30");
        });

        test("should handle exact 15-minute boundaries", () => {
            const date = new Date("2024-01-15T09:15:00");
            expect(dateToSlot(date)).toBe("09:15");
        });

        test("should handle midnight correctly", () => {
            const date = new Date("2024-01-15T00:05:00");
            expect(dateToSlot(date)).toBe("00:00");
        });

        test("should handle end of day correctly", () => {
            const date = new Date("2024-01-15T23:59:00");
            expect(dateToSlot(date)).toBe("23:45");
        });
    });

    describe("calculateTrends", () => {
        test("should group records by gym, day of week, and time slot", () => {
            const records = [
                {
                    gymId: "gym1",
                    gymName: "Test Gym",
                    created: "2024-01-15T10:30:00", // Monday
                    count: 50,
                },
                {
                    gymId: "gym1",
                    gymName: "Test Gym",
                    created: "2024-01-22T10:35:00", // Also Monday
                    count: 60,
                },
            ];

            const trends = calculateTrends(records);

            expect(trends.has("gym1")).toBe(true);
            const gymMap = trends.get("gym1")!;
            expect(gymMap.has(1)).toBe(true); // Monday = 1

            const mondayMap = gymMap.get(1)!;
            expect(mondayMap.has("10:30")).toBe(true);

            const slotData = mondayMap.get("10:30")!;
            expect(slotData.sum).toBe(110); // 50 + 60
            expect(slotData.count).toBe(2);
        });

        test("should separate different gyms correctly", () => {
            const records = [
                {
                    gymId: "gym1",
                    gymName: "Gym One",
                    created: "2024-01-15T10:00:00",
                    count: 30,
                },
                {
                    gymId: "gym2",
                    gymName: "Gym Two",
                    created: "2024-01-15T10:00:00",
                    count: 40,
                },
            ];

            const trends = calculateTrends(records);

            expect(trends.has("gym1")).toBe(true);
            expect(trends.has("gym2")).toBe(true);
            expect(trends.size).toBe(2);
        });

        test("should handle empty records", () => {
            const trends = calculateTrends([]);
            expect(trends.size).toBe(0);
        });
    });

    describe("formatTrendDataForDay", () => {
        test("should return all 96 time slots", () => {
            const dayMap = new Map<string, { sum: number; count: number }>();
            dayMap.set("10:00", { sum: 100, count: 2 });

            const formatted = formatTrendDataForDay(dayMap);

            expect(formatted.length).toBe(96);
        });

        test("should calculate correct averages for slots with data", () => {
            const dayMap = new Map<string, { sum: number; count: number }>();
            dayMap.set("10:00", { sum: 100, count: 2 }); // Average = 50
            dayMap.set("14:30", { sum: 150, count: 3 }); // Average = 50

            const formatted = formatTrendDataForDay(dayMap);

            const slot1000 = formatted.find((s) => s.time === "10:00");
            expect(slot1000?.average).toBe(50);
            expect(slot1000?.sampleCount).toBe(2);

            const slot1430 = formatted.find((s) => s.time === "14:30");
            expect(slot1430?.average).toBe(50);
            expect(slot1430?.sampleCount).toBe(3);
        });

        test("should return 0 for slots without data", () => {
            const dayMap = new Map<string, { sum: number; count: number }>();
            dayMap.set("10:00", { sum: 100, count: 2 });

            const formatted = formatTrendDataForDay(dayMap);

            const emptySlot = formatted.find((s) => s.time === "03:00");
            expect(emptySlot?.average).toBe(0);
            expect(emptySlot?.sampleCount).toBe(0);
        });

        test("should handle undefined dayMap gracefully", () => {
            const formatted = formatTrendDataForDay(undefined);

            expect(formatted.length).toBe(96);
            expect(formatted.every((s) => s.average === 0)).toBe(true);
        });

        test("should round averages to integers", () => {
            const dayMap = new Map<string, { sum: number; count: number }>();
            dayMap.set("10:00", { sum: 100, count: 3 }); // 100/3 = 33.33...

            const formatted = formatTrendDataForDay(dayMap);

            const slot = formatted.find((s) => s.time === "10:00");
            expect(slot?.average).toBe(33); // Math.round(33.33) = 33
        });
    });
});
