/**
 * Trend Agent - Calculates and caches gym attendance trends
 * 
 * This agent runs nightly to pre-calculate "Popular Times" data by:
 * 1. Fetching list of all gyms
 * 2. For each gym:
 *    a. Fetch historical data (last 90 days)
 *    b. Calculate trends (using gym's local timezone)
 *    c. Upsert results into gym_trend_cache
 * 
 * Optimization: Batch processing per gym to reduce memory usage and query load.
 */

import { db } from "../utils/database";
import { revoGymCount, revoGyms, gymTrendCache } from "../db/schema";
import { gte, sql, eq, and } from "drizzle-orm";

// Type definitions
export interface TimeSlotAverage {
    time: string; // Format: "HH:MM"
    average: number;
    sampleCount: number;
}

export interface DayTrendData {
    dayOfWeek: number; // 0-6 (Sunday-Saturday)
    slots: TimeSlotAverage[];
}

export interface GymTrendResult {
    gymId: string;
    gymName: string;
    trends: DayTrendData[];
}

// Configuration
const DEFAULT_LOOKBACK_DAYS = 90;
const SLOT_DURATION_MINUTES = 15;

/**
 * Generates all 15-minute time slot keys for a day
 */
export const generateTimeSlots = (): string[] => {
    const slots: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += SLOT_DURATION_MINUTES) {
            const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
            slots.push(timeStr);
        }
    }
    return slots;
};

/**
 * Helper to get local time parts from a date string and timezone
 */
export const getLocalTimeParts = (dateStr: string, timeZone: string) => {
    const utcDate = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
    });

    const parts = formatter.formatToParts(utcDate);
    const partMap = new Map(parts.map((p) => [p.type, p.value]));

    const weekdayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };

    const dayStr = partMap.get("weekday")!;
    const hourStr = partMap.get("hour")!;
    const minuteStr = partMap.get("minute")!;

    const minuteNum = parseInt(minuteStr, 10);
    const roundedMinute = Math.floor(minuteNum / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES;

    return {
        dayOfWeek: weekdayMap[dayStr],
        timeSlot: `${hourStr.padStart(2, "0")}:${roundedMinute.toString().padStart(2, "0")}`,
    };
};

/**
 * Fetches raw gym count records for a SINGLE gym
 */
export const fetchGymData = async (gymId: string, lookbackDays: number = DEFAULT_LOOKBACK_DAYS) => {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    // Select minimal columns
    const records = await db
        .select({
            created: revoGymCount.created,
            count: revoGymCount.count,
        })
        .from(revoGymCount)
        .where(and(
            eq(revoGymCount.gymId, gymId),
            gte(revoGymCount.created, lookbackDate.toISOString().slice(0, 19).replace("T", " "))
        ));

    return records;
};

/**
 * Calculates trends for a single gym given its records and timezone
 */
export const calculateTrends = (
    records: Array<{ created: string; count: number }>,
    timezone: string
): Map<number, Map<string, { sum: number; count: number }>> => {
    // Map: dayOfWeek → timeSlot → { sum, count }
    const dayMap = new Map<number, Map<string, { sum: number; count: number }>>();

    for (const record of records) {
        try {
            const { dayOfWeek, timeSlot } = getLocalTimeParts(record.created, timezone);

            if (!dayMap.has(dayOfWeek)) {
                dayMap.set(dayOfWeek, new Map());
            }
            const slotMap = dayMap.get(dayOfWeek)!;

            if (!slotMap.has(timeSlot)) {
                slotMap.set(timeSlot, { sum: 0, count: 0 });
            }
            const slotData = slotMap.get(timeSlot)!;

            slotData.sum += record.count;
            slotData.count += 1;
        } catch (error) {
            continue;
        }
    }

    return dayMap;
};

/**
 * Formats trend data for a specific gym and day into the JSON structure for storage
 */
export const formatTrendDataForDay = (
    dayMap: Map<string, { sum: number; count: number }> | undefined
): TimeSlotAverage[] => {
    const allSlots = generateTimeSlots();
    const result: TimeSlotAverage[] = [];

    for (const slot of allSlots) {
        const data = dayMap?.get(slot);
        if (data && data.count > 0) {
            result.push({
                time: slot,
                average: Math.round(data.sum / data.count),
                sampleCount: data.count,
            });
        } else {
            result.push({
                time: slot,
                average: 0,
                sampleCount: 0,
            });
        }
    }

    return result;
};

/**
 * Upserts trend data for a gym/day combination into the cache table
 */
export const upsertTrendCache = async (
    gymId: string,
    dayOfWeek: number,
    trendData: TimeSlotAverage[]
): Promise<void> => {
    const now = new Date();

    await db
        .insert(gymTrendCache)
        .values({
            gymId,
            dayOfWeek,
            trendData: trendData,
            updatedAt: now.toISOString().slice(0, 19).replace("T", " "),
        })
        .onDuplicateKeyUpdate({
            set: {
                trendData: sql`VALUES(${gymTrendCache.trendData})`,
                updatedAt: sql`VALUES(${gymTrendCache.updatedAt})`,
            },
        });
};

/**
 * Main agent function
 */
export const runTrendAgent = async (
    lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<{ success: boolean; gymsProcessed: number; errors: string[] }> => {
    console.log(`[TrendAgent] Starting optimized trend calculation with ${lookbackDays}-day lookback...`);

    const errors: string[] = [];
    let gymsProcessed = 0;

    try {
        // Step 1: Fetch list of all gyms
        const allGyms = await db
            .select({ id: revoGyms.id, name: revoGyms.name, timezone: revoGyms.timezone })
            .from(revoGyms);

        console.log(`[TrendAgent] Found ${allGyms.length} gyms to process.`);

        // Step 2: Iterate and process each gym
        for (const gym of allGyms) {
            gymsProcessed++;
            console.log(`[TrendAgent] Processing ${gymsProcessed}/${allGyms.length}: ${gym.name} (${gym.id})`);

            try {
                // Fetch data for this gym only
                const records = await fetchGymData(gym.id, lookbackDays);

                if (records.length === 0) {
                    // No data, maybe new gym or inactive. Skip calculation but log it.
                    // console.log(`[TrendAgent] No data for ${gym.name}, skipping...`);
                    continue;
                }

                // Calculate trends
                const dayTrends = calculateTrends(records, gym.timezone);

                // Upsert for all 7 days
                for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                    try {
                        const dayData = dayTrends.get(dayOfWeek);
                        const formattedData = formatTrendDataForDay(dayData);
                        await upsertTrendCache(gym.id, dayOfWeek, formattedData);
                    } catch (err) {
                        const errMsg = `Failed upsert for ${gym.name} day ${dayOfWeek}: ${err}`;
                        console.error(`[TrendAgent] ${errMsg}`);
                        errors.push(errMsg);
                    }
                }

            } catch (err) {
                const errMsg = `Failed processing gym ${gym.name}: ${err}`;
                console.error(`[TrendAgent] ${errMsg}`);
                errors.push(errMsg);
            }
        }

        console.log(`[TrendAgent] Completed. Processed ${gymsProcessed} gyms.`);
        return { success: true, gymsProcessed, errors };
    } catch (error) {
        console.error("[TrendAgent] Fatal error:", error);
        return { success: false, gymsProcessed, errors: [String(error)] };
    }
};

/**
 * Retrieves cached trend data for a specific gym
 */
export const getGymTrends = async (gymId: string): Promise<DayTrendData[]> => {
    const rows = await db
        .select()
        .from(gymTrendCache)
        .where(sql`${gymTrendCache.gymId} = ${gymId}`);

    return rows.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        slots: row.trendData as TimeSlotAverage[],
    }));
};

/**
 * Retrieves cached trend data for all gyms
 */
export const getAllGymTrends = async (): Promise<Map<string, DayTrendData[]>> => {
    const rows = await db.select().from(gymTrendCache);

    const resultMap = new Map<string, DayTrendData[]>();

    for (const row of rows) {
        if (!resultMap.has(row.gymId)) {
            resultMap.set(row.gymId, []);
        }
        resultMap.get(row.gymId)!.push({
            dayOfWeek: row.dayOfWeek,
            slots: row.trendData as TimeSlotAverage[],
        });
    }

    return resultMap;
};
