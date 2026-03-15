import { describe, expect, test } from "bun:test";
import {
    analyzeGymDropouts,
    buildTrendLookup,
    calculateGymRatios,
    confidencePassesThreshold,
    getAuditLocalTime,
} from "../src/agents/statAudit";
import type { AuditGym, AuditRow } from "../src/agents/statAudit";
import type { DayTrendData } from "../src/agents/trendAgent";

const sampleGym: AuditGym = {
    id: "gym-1",
    name: "Kelmscott",
    timezone: "Australia/Perth",
    areaSize: 1200,
};

const buildRow = (overrides: Partial<AuditRow>): AuditRow => ({
    id: overrides.id ?? crypto.randomUUID(),
    gymId: overrides.gymId ?? sampleGym.id,
    gymName: overrides.gymName ?? sampleGym.name,
    created: overrides.created ?? "2026-03-10 10:00:00",
    count: overrides.count ?? 0,
    ratio: overrides.ratio ?? 0,
    percentage: overrides.percentage ?? 0,
});

describe("statAudit helpers", () => {
    test("getAuditLocalTime maps UTC timestamps into local half-hour slots", () => {
        const result = getAuditLocalTime("2026-03-10 10:17:00", "Australia/Perth");

        expect(result.localDate).toBe("2026-03-10");
        expect(result.localTimestamp).toBe("2026-03-10 18:17");
        expect(result.timeSlot).toBe("18:00");
        expect(result.dayOfWeek).toBe(2);
    });

    test("buildTrendLookup collapses 15-minute slots into weighted 30-minute averages", () => {
        const trends: DayTrendData[] = [
            {
                dayOfWeek: 2,
                slots: [
                    { time: "18:00", average: 20, sampleCount: 2 },
                    { time: "18:15", average: 40, sampleCount: 4 },
                    { time: "18:30", average: 10, sampleCount: 1 },
                ],
            },
        ];

        const lookup = buildTrendLookup(trends);
        const eveningSlot = lookup.get(2)?.get("18:00");
        const lateSlot = lookup.get(2)?.get("18:30");

        expect(eveningSlot).toEqual({ average: 33, sampleCount: 6 });
        expect(lateSlot).toEqual({ average: 10, sampleCount: 1 });
    });

    test("calculateGymRatios uses the estimated capacity occupancy formula", () => {
        const result = calculateGymRatios(1200, 30);

        expect(result.memberRatio).toBe(40);
        expect(result.percentage).toBeCloseTo(15, 6);
    });
});

describe("analyzeGymDropouts", () => {
    test("proposes a high-confidence interpolation fix for an isolated zero", () => {
        const rows: AuditRow[] = [
            buildRow({ id: "prev", created: "2026-03-10 09:30:00", count: 26 }),
            buildRow({ id: "zero", created: "2026-03-10 10:00:00", count: 0 }),
            buildRow({ id: "next", created: "2026-03-10 10:30:00", count: 34 }),
        ];
        const trends: DayTrendData[] = [
            {
                dayOfWeek: 2,
                slots: [
                    { time: "18:00", average: 28, sampleCount: 12 },
                    { time: "18:15", average: 32, sampleCount: 12 },
                ],
            },
        ];

        const result = analyzeGymDropouts(sampleGym, rows, trends);

        expect(result.summary.suspiciousZerosFound).toBe(1);
        expect(result.proposals).toHaveLength(1);
        expect(result.proposals[0]).toMatchObject({
            rowId: "zero",
            confidence: "high",
            repairMethod: "interpolation",
            repairedCount: 30,
            trendAverage: 30,
            previousCount: 26,
            nextCount: 34,
        });
        expect(result.proposals[0].repairedRatio).toBe(40);
        expect(result.proposals[0].repairedPercentage).toBeCloseTo(15, 6);
    });

    test("repairs longer zero runs from trend values when trend support is strong", () => {
        const rows: AuditRow[] = [
            buildRow({ id: "prev", created: "2026-03-10 09:30:00", count: 22 }),
            buildRow({ id: "zero-1", created: "2026-03-10 10:00:00", count: 0 }),
            buildRow({ id: "zero-2", created: "2026-03-10 10:30:00", count: 0 }),
            buildRow({ id: "next", created: "2026-03-10 11:00:00", count: 24 }),
        ];
        const trends: DayTrendData[] = [
            {
                dayOfWeek: 2,
                slots: [
                    { time: "18:00", average: 30, sampleCount: 12 },
                    { time: "18:30", average: 31, sampleCount: 12 },
                    { time: "19:00", average: 25, sampleCount: 12 },
                ],
            },
        ];

        const result = analyzeGymDropouts(sampleGym, rows, trends);

        expect(result.proposals).toHaveLength(2);
        expect(result.proposals[0]).toMatchObject({
            rowId: "zero-1",
            confidence: "high",
            repairMethod: "trend",
            repairedCount: 30,
            zeroRunLength: 2,
        });
        expect(result.proposals[1]).toMatchObject({
            rowId: "zero-2",
            confidence: "high",
            repairMethod: "trend",
            repairedCount: 31,
            zeroRunLength: 2,
        });
    });

    test("records medium confidence when only one adjacent sample is active", () => {
        const rows: AuditRow[] = [
            buildRow({ id: "zero", created: "2026-03-10 10:00:00", count: 0 }),
            buildRow({ id: "next", created: "2026-03-10 10:30:00", count: 18 }),
        ];
        const trends: DayTrendData[] = [
            {
                dayOfWeek: 2,
                slots: [
                    { time: "18:00", average: 24, sampleCount: 8 },
                ],
            },
        ];

        const result = analyzeGymDropouts(sampleGym, rows, trends);

        expect(result.proposals).toHaveLength(1);
        expect(result.proposals[0].confidence).toBe("medium");
        expect(confidencePassesThreshold(result.proposals[0].confidence, "high")).toBe(false);
        expect(confidencePassesThreshold(result.proposals[0].confidence, "medium")).toBe(true);
    });

    test("ignores zeros when expected trend is weak", () => {
        const rows: AuditRow[] = [
            buildRow({ id: "prev", created: "2026-03-10 09:30:00", count: 12 }),
            buildRow({ id: "zero", created: "2026-03-10 10:00:00", count: 0 }),
            buildRow({ id: "next", created: "2026-03-10 10:30:00", count: 15 }),
        ];
        const trends: DayTrendData[] = [
            {
                dayOfWeek: 2,
                slots: [
                    { time: "18:00", average: 8, sampleCount: 6 },
                ],
            },
        ];

        const result = analyzeGymDropouts(sampleGym, rows, trends);

        expect(result.proposals).toHaveLength(0);
        expect(result.summary.rowsSkipped).toBe(1);
    });

    test("skips longer zero runs when trend sample support is too thin", () => {
        const rows: AuditRow[] = [
            buildRow({ id: "zero-1", created: "2026-03-10 10:00:00", count: 0 }),
            buildRow({ id: "zero-2", created: "2026-03-10 10:30:00", count: 0 }),
        ];
        const trends: DayTrendData[] = [
            {
                dayOfWeek: 2,
                slots: [
                    { time: "18:00", average: 24, sampleCount: 2 },
                    { time: "18:30", average: 26, sampleCount: 2 },
                ],
            },
        ];

        const result = analyzeGymDropouts(sampleGym, rows, trends);

        expect(result.proposals).toHaveLength(0);
        expect(result.summary.rowsSkipped).toBe(2);
    });
});
