import type { DayTrendData, TimeSlotAverage } from "./trendAgent";

export const AUDIT_SLOT_MINUTES = 30;
export const DEFAULT_MIN_SCORE = 30;
export const DEFAULT_MIN_TREND_AVERAGE = 20;
export const DEFAULT_MIN_TREND_SAMPLE_COUNT = 4;
export const STRONG_NEIGHBOR_COUNT = 10;

export type RepairMethod = "interpolation" | "trend";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface AuditGym {
    id: string;
    name: string;
    timezone: string;
    areaSize: number;
}

export interface AuditRow {
    id: string;
    gymId: string;
    gymName: string;
    created: string;
    count: number;
    ratio: number;
    percentage: number;
}

export interface LocalizedAuditTime {
    dayOfWeek: number;
    timeSlot: string;
    localDate: string;
    localTimestamp: string;
}

export interface TrendLookupEntry {
    average: number;
    sampleCount: number;
}

export interface RepairProposal {
    rowId: string;
    gymId: string;
    gymName: string;
    utcTimestamp: string;
    localTimestamp: string;
    localDate: string;
    originalCount: number;
    repairedCount: number;
    originalRatio: number;
    repairedRatio: number;
    originalPercentage: number;
    repairedPercentage: number;
    repairMethod: RepairMethod;
    trendAverage: number;
    trendSampleCount: number;
    previousCount: number | null;
    nextCount: number | null;
    confidence: ConfidenceLevel;
    anomalyScore: number;
    zeroRunLength: number;
    reason: string;
}

export interface AuditSummary {
    gymsScanned: number;
    daysScanned: number;
    rowsInspected: number;
    suspiciousZerosFound: number;
    fixesProposed: number;
    fixesApplied: number;
    rowsSkipped: number;
}

export interface AuditRunResult {
    proposals: RepairProposal[];
    summary: AuditSummary;
}

export interface AuditOptions {
    minScore?: number;
    minTrendAverage?: number;
    minTrendSampleCount?: number;
}

const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

const toUtcDate = (dateStr: string) => new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);

export const calculateGymRatios = (size: number, count: number) => {
    if (size <= 0 || count <= 0) {
        return { memberRatio: 0, percentage: 0 };
    }

    const memberRatio = size / count;
    const estimatedCapacity = size / 4;
    const percentage = Math.min((count / estimatedCapacity) * 100, 100);

    return { memberRatio, percentage };
};

export const getAuditLocalTime = (
    dateStr: string,
    timeZone: string,
    slotMinutes: number = AUDIT_SLOT_MINUTES,
): LocalizedAuditTime => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });

    const partMap = new Map(
        formatter.formatToParts(toUtcDate(dateStr)).map((part) => [part.type, part.value]),
    );

    const minute = Number.parseInt(partMap.get("minute") ?? "0", 10);
    const roundedMinute = Math.floor(minute / slotMinutes) * slotMinutes;
    const hour = partMap.get("hour") ?? "00";
    const month = partMap.get("month") ?? "01";
    const day = partMap.get("day") ?? "01";
    const year = partMap.get("year") ?? "1970";
    const weekday = partMap.get("weekday") ?? "Sun";

    return {
        dayOfWeek: WEEKDAY_MAP[weekday] ?? 0,
        timeSlot: `${hour}:${roundedMinute.toString().padStart(2, "0")}`,
        localDate: `${year}-${month}-${day}`,
        localTimestamp: `${year}-${month}-${day} ${hour}:${(partMap.get("minute") ?? "00").padStart(2, "0")}`,
    };
};

const normalizeTrendSlot = (time: string, slotMinutes: number) => {
    const [hourText, minuteText] = time.split(":");
    const hour = Number.parseInt(hourText ?? "0", 10);
    const minute = Number.parseInt(minuteText ?? "0", 10);
    const roundedMinute = Math.floor(minute / slotMinutes) * slotMinutes;

    return `${hour.toString().padStart(2, "0")}:${roundedMinute.toString().padStart(2, "0")}`;
};

export const buildTrendLookup = (
    trends: DayTrendData[],
    slotMinutes: number = AUDIT_SLOT_MINUTES,
): Map<number, Map<string, TrendLookupEntry>> => {
    const lookup = new Map<number, Map<string, { weightedSum: number; sampleCount: number }>>();

    for (const trend of trends) {
        if (!lookup.has(trend.dayOfWeek)) {
            lookup.set(trend.dayOfWeek, new Map());
        }

        const dayLookup = lookup.get(trend.dayOfWeek)!;

        for (const slot of trend.slots) {
            if (slot.sampleCount <= 0) {
                continue;
            }

            const normalizedSlot = normalizeTrendSlot(slot.time, slotMinutes);
            const existing = dayLookup.get(normalizedSlot) ?? { weightedSum: 0, sampleCount: 0 };

            existing.weightedSum += slot.average * slot.sampleCount;
            existing.sampleCount += slot.sampleCount;
            dayLookup.set(normalizedSlot, existing);
        }
    }

    return new Map(
        Array.from(lookup.entries()).map(([dayOfWeek, dayLookup]) => [
            dayOfWeek,
            new Map(
                Array.from(dayLookup.entries()).map(([timeSlot, value]) => [
                    timeSlot,
                    {
                        average: Math.round(value.weightedSum / value.sampleCount),
                        sampleCount: value.sampleCount,
                    },
                ]),
            ),
        ]),
    );
};

export const getExpectedTrendAverage = (
    trendLookup: Map<number, Map<string, TrendLookupEntry>>,
    localizedTime: LocalizedAuditTime,
) => trendLookup.get(localizedTime.dayOfWeek)?.get(localizedTime.timeSlot) ?? { average: 0, sampleCount: 0 };

export const getZeroRunLength = (rows: AuditRow[], index: number) => {
    let runLength = 1;

    for (let cursor = index - 1; cursor >= 0; cursor--) {
        if (rows[cursor]?.count !== 0) {
            break;
        }
        runLength += 1;
    }

    for (let cursor = index + 1; cursor < rows.length; cursor++) {
        if (rows[cursor]?.count !== 0) {
            break;
        }
        runLength += 1;
    }

    return runLength;
};

export const calculateAnomalyScore = (
    trendAverage: number,
    previousCount: number | null,
    nextCount: number | null,
) => (
    trendAverage
    + Math.max(previousCount ?? 0, 0) * 0.5
    + Math.max(nextCount ?? 0, 0) * 0.5
);

export const getConfidenceLevel = (
    trendAverage: number,
    trendSampleCount: number,
    previousCount: number | null,
    nextCount: number | null,
    zeroRunLength: number,
): ConfidenceLevel | null => {
    if (trendAverage < DEFAULT_MIN_TREND_AVERAGE) {
        return null;
    }

    const previousStrong = (previousCount ?? 0) >= STRONG_NEIGHBOR_COUNT;
    const nextStrong = (nextCount ?? 0) >= STRONG_NEIGHBOR_COUNT;

    if (previousStrong && nextStrong) {
        return "high";
    }

    if (zeroRunLength > 1) {
        if (trendSampleCount >= 12 && trendAverage >= 25) {
            return "high";
        }

        if (trendSampleCount >= DEFAULT_MIN_TREND_SAMPLE_COUNT) {
            return "medium";
        }
    }

    if (previousStrong || nextStrong) {
        return "medium";
    }

    if (trendSampleCount >= DEFAULT_MIN_TREND_SAMPLE_COUNT) {
        return "low";
    }

    return null;
};

const chooseRepairMethod = (
    previousCount: number | null,
    nextCount: number | null,
    trendAverage: number,
): { repairedCount: number; repairMethod: RepairMethod } | null => {
    if ((previousCount ?? 0) > 0 && (nextCount ?? 0) > 0) {
        return {
            repairedCount: Math.max(0, Math.round(((previousCount ?? 0) + (nextCount ?? 0)) / 2)),
            repairMethod: "interpolation",
        };
    }

    if (trendAverage > 0) {
        return {
            repairedCount: Math.max(0, Math.round(trendAverage)),
            repairMethod: "trend",
        };
    }

    return null;
};

export const confidencePassesThreshold = (
    confidence: ConfidenceLevel,
    threshold: "high" | "medium" | "all",
) => {
    if (threshold === "all") {
        return true;
    }

    if (threshold === "medium") {
        return confidence === "high" || confidence === "medium";
    }

    return confidence === "high";
};

export const analyzeGymDropouts = (
    gym: AuditGym,
    rows: AuditRow[],
    trends: DayTrendData[],
    options: AuditOptions = {},
): AuditRunResult => {
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    const minTrendAverage = options.minTrendAverage ?? DEFAULT_MIN_TREND_AVERAGE;
    const minTrendSampleCount = options.minTrendSampleCount ?? DEFAULT_MIN_TREND_SAMPLE_COUNT;
    const trendLookup = buildTrendLookup(trends);
    const proposals: RepairProposal[] = [];
    const daysScanned = new Set<string>();
    let suspiciousZerosFound = 0;
    let rowsSkipped = 0;

    for (const row of rows) {
        daysScanned.add(getAuditLocalTime(row.created, gym.timezone).localDate);
    }

    for (let index = 0; index < rows.length; index++) {
        const current = rows[index];

        if (current.count !== 0) {
            continue;
        }

        const localizedTime = getAuditLocalTime(current.created, gym.timezone);
        const trend = getExpectedTrendAverage(trendLookup, localizedTime);
        const previousRow = rows[index - 1] ?? null;
        const nextRow = rows[index + 1] ?? null;
        const previousCount = previousRow?.count ?? null;
        const nextCount = nextRow?.count ?? null;
        const zeroRunLength = getZeroRunLength(rows, index);

        if (trend.average < minTrendAverage) {
            rowsSkipped += 1;
            continue;
        }

        if (trend.sampleCount < minTrendSampleCount) {
            rowsSkipped += 1;
            continue;
        }

        const confidence = getConfidenceLevel(
            trend.average,
            trend.sampleCount,
            previousCount,
            nextCount,
            zeroRunLength,
        );
        if (!confidence) {
            rowsSkipped += 1;
            continue;
        }

        const anomalyScore = calculateAnomalyScore(trend.average, previousCount, nextCount);
        if (anomalyScore < minScore) {
            rowsSkipped += 1;
            continue;
        }

        suspiciousZerosFound += 1;

        const repair = chooseRepairMethod(previousCount, nextCount, trend.average);
        if (!repair) {
            rowsSkipped += 1;
            continue;
        }

        const recalculated = calculateGymRatios(gym.areaSize, repair.repairedCount);
        const reasonParts = [
            `Zero occupancy conflicts with expected trend ${trend.average}`,
            previousCount !== null ? `previous=${previousCount}` : "previous=missing",
            nextCount !== null ? `next=${nextCount}` : "next=missing",
            `score=${anomalyScore.toFixed(1)}`,
            `run=${zeroRunLength}`,
        ];

        proposals.push({
            rowId: current.id,
            gymId: current.gymId,
            gymName: current.gymName,
            utcTimestamp: current.created,
            localTimestamp: localizedTime.localTimestamp,
            localDate: localizedTime.localDate,
            originalCount: current.count,
            repairedCount: repair.repairedCount,
            originalRatio: current.ratio,
            repairedRatio: recalculated.memberRatio,
            originalPercentage: current.percentage,
            repairedPercentage: recalculated.percentage,
            repairMethod: repair.repairMethod,
            trendAverage: trend.average,
            trendSampleCount: trend.sampleCount,
            previousCount,
            nextCount,
            confidence,
            anomalyScore,
            zeroRunLength,
            reason: reasonParts.join("; "),
        });
    }

    return {
        proposals,
        summary: {
            gymsScanned: 1,
            daysScanned: daysScanned.size,
            rowsInspected: rows.length,
            suspiciousZerosFound,
            fixesProposed: proposals.length,
            fixesApplied: 0,
            rowsSkipped,
        },
    };
};

export const emptyTrendDay = (dayOfWeek: number): DayTrendData => ({
    dayOfWeek,
    slots: [],
});

export const buildTrendDaysFromLookup = (
    lookup: Array<{ dayOfWeek: number; slots: TimeSlotAverage[] }>,
): DayTrendData[] => {
    const days = new Map<number, DayTrendData>();

    for (const row of lookup) {
        days.set(row.dayOfWeek, {
            dayOfWeek: row.dayOfWeek,
            slots: row.slots,
        });
    }

    return Array.from({ length: 7 }, (_, dayOfWeek) => days.get(dayOfWeek) ?? emptyTrendDay(dayOfWeek));
};
