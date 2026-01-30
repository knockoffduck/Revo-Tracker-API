/**
 * Trend Agent - Calculates and caches gym attendance trends
 * 
 * This agent runs nightly to pre-calculate "Popular Times" data by:
 * 1. Fetching historical data from the lookback window (default: 90 days)
 * 2. Grouping by gym → day of week → 15-minute time slots
 * 3. Calculating average attendance per slot
 * 4. Upserting results into the gym_trend_cache table
 */

import { db } from "../utils/database";
import { revoGymCount, revoGyms, gymTrendCache } from "../db/schema";
import { gte, sql, and } from "drizzle-orm";

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
 * Returns array like ["00:00", "00:15", "00:30", ...]
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
 * Converts a Date to its 15-minute slot string
 * e.g., 14:37 → "14:30"
 */
export const dateToSlot = (date: Date): string => {
    const hours = date.getHours();
    const minutes = Math.floor(date.getMinutes() / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

/**
 * Fetches raw gym count records within the lookback window
 */
export const fetchHistoricalData = async (lookbackDays: number = DEFAULT_LOOKBACK_DAYS) => {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    const records = await db
        .select({
            gymId: revoGymCount.gymId,
            gymName: revoGymCount.gymName,
            created: revoGymCount.created,
            count: revoGymCount.count,
        })
        .from(revoGymCount)
        .where(gte(revoGymCount.created, lookbackDate.toISOString().slice(0, 19).replace("T", " ")));

    return records;
};

/**
 * Groups records by gym → day of week → time slot and calculates averages
 */
export const calculateTrends = (
    records: Array<{
        gymId: string;
        gymName: string;
        created: string;
        count: number;
    }>
): Map<string, Map<number, Map<string, { sum: number; count: number }>>> => {
    // Map: gymId → dayOfWeek → timeSlot → { sum, count }
    const trendMap = new Map<string, Map<number, Map<string, { sum: number; count: number }>>>();

    for (const record of records) {
        const createdDate = new Date(record.created);
        const dayOfWeek = createdDate.getDay(); // 0-6 (Sunday-Saturday)
        const timeSlot = dateToSlot(createdDate);

        // Initialize nested maps if needed
        if (!trendMap.has(record.gymId)) {
            trendMap.set(record.gymId, new Map());
        }
        const gymMap = trendMap.get(record.gymId)!;

        if (!gymMap.has(dayOfWeek)) {
            gymMap.set(dayOfWeek, new Map());
        }
        const dayMap = gymMap.get(dayOfWeek)!;

        if (!dayMap.has(timeSlot)) {
            dayMap.set(timeSlot, { sum: 0, count: 0 });
        }
        const slotData = dayMap.get(timeSlot)!;

        // Accumulate values for averaging
        slotData.sum += record.count;
        slotData.count += 1;
    }

    return trendMap;
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
            // Fill empty slots with 0 to maintain consistent structure
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
 * Main agent function - orchestrates the entire trend calculation process
 * This should be called by a scheduler (e.g., cron job at 3:00 AM)
 */
export const runTrendAgent = async (
    lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<{ success: boolean; gymsProcessed: number; errors: string[] }> => {
    console.log(`[TrendAgent] Starting trend calculation with ${lookbackDays}-day lookback...`);

    const errors: string[] = [];
    let gymsProcessed = 0;

    try {
        // Step 1: Fetch historical data
        console.log("[TrendAgent] Fetching historical data...");
        const records = await fetchHistoricalData(lookbackDays);
        console.log(`[TrendAgent] Found ${records.length} records in lookback window`);

        if (records.length === 0) {
            console.log("[TrendAgent] No records found, exiting...");
            return { success: true, gymsProcessed: 0, errors: [] };
        }

        // Step 2: Calculate trends
        console.log("[TrendAgent] Calculating trends...");
        const trendMap = calculateTrends(records);

        // Step 3: Upsert to cache for each gym/day combination
        console.log("[TrendAgent] Upserting to cache...");
        const gymIds = Array.from(trendMap.keys());

        for (const gymId of gymIds) {
            const gymTrends = trendMap.get(gymId)!;

            // Process all 7 days (0-6)
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                try {
                    const dayData = gymTrends.get(dayOfWeek);
                    const formattedData = formatTrendDataForDay(dayData);
                    await upsertTrendCache(gymId, dayOfWeek, formattedData);
                } catch (error) {
                    const errMsg = `Failed to upsert trend for gym ${gymId}, day ${dayOfWeek}: ${error}`;
                    console.error(`[TrendAgent] ${errMsg}`);
                    errors.push(errMsg);
                }
            }

            gymsProcessed++;
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
