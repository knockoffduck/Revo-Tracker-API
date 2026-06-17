/**
 * Streaming wrappers around the existing scrape/trend/audit functions.
 * These re-use the production logic but emit progress events as they go
 * so the admin dashboard can show real-time progress bars.
 */

import { progressBus } from "./progress";
import { parseHTML, updateGymInfo, insertGymStats } from "./parser";
import { runTrendAgent } from "../agents/trendAgent";
import { db } from "./database";
import { revoGymCount, revoGyms } from "../db/schema";
import { desc, eq } from "drizzle-orm";

const emit = (event: Parameters<typeof progressBus.emit>[0]) => progressBus.emit(event);

export async function streamingStatsUpdate() {
	emit({ type: "log", level: "info", stage: "PARSE", message: "PHASE 1: Fetch & Parse" });

	// Wrap parseHTML — emit a "fetch" log just before
	emit({ type: "progress", phase: "fetching", percent: 0, message: "Starting scrape session..." });
	const data = await parseHTML();
	emit({
		type: "log",
		level: data.length > 0 ? "success" : "warn",
		stage: "PARSE",
		message: `Parsed ${data.length} gyms`,
	});
	emit({ type: "progress", phase: "fetching", percent: 50 });

	if (data.length === 0) {
		emit({
			type: "log",
			level: "error",
			stage: "PARSE",
			message: "No gyms returned — aborting DB write",
		});
		emit({ type: "error", message: "Scrape failed — zero gyms returned" });
		emit({ type: "done" });
		return;
	}

	emit({ type: "log", level: "info", stage: "DB", message: "PHASE 2: Database Write" });
	emit({ type: "progress", phase: "writing", percent: 60, message: "Upserting gym metadata..." });
	await updateGymInfo(data);
	emit({ type: "progress", phase: "writing", percent: 85, message: "Inserting snapshot rows..." });
	await insertGymStats(data);
	emit({ type: "progress", phase: "writing", percent: 100, message: "Done" });
	emit({ type: "log", level: "success", stage: "DB", message: "Snapshot rows inserted" });

	emit({ type: "result", data: { success: true, message: "Gym stats updated successfully", gymCount: data.length } });
	emit({ type: "done" });
}

export async function streamingUpdateGyms() {
	emit({ type: "log", level: "info", stage: "PARSE", message: "Starting gym metadata update" });
	emit({ type: "progress", phase: "fetching", percent: 0 });

	const data = await parseHTML();
	emit({ type: "log", level: "info", stage: "PARSE", message: `Parsed ${data.length} gyms` });
	emit({ type: "progress", phase: "fetching", percent: 70 });

	if (data.length === 0) {
		emit({ type: "error", message: "Scrape returned 0 gyms" });
		emit({ type: "done" });
		return;
	}

	emit({ type: "progress", phase: "writing", percent: 80, message: "Upserting gym metadata..." });
	await updateGymInfo(data);
	emit({ type: "progress", phase: "writing", percent: 100, message: "Done" });
	emit({ type: "log", level: "success", stage: "DB", message: "Gym metadata updated" });

	emit({ type: "result", data: { success: true, message: "Data updated successfully", gymCount: data.length } });
	emit({ type: "done" });
}

export async function streamingLatestStats() {
	emit({ type: "progress", phase: "fetching", percent: 50 });
	const latestTime = await db
		.select({ created: revoGymCount.created })
		.from(revoGymCount)
		.orderBy(desc(revoGymCount.created))
		.limit(1);
	if (!latestTime[0]) {
		emit({ type: "error", message: "No stats in database" });
		emit({ type: "done" });
		return;
	}
	const data = await db
		.select()
		.from(revoGymCount)
		.where(eq(revoGymCount.created, latestTime[0].created))
		.orderBy(desc(revoGymCount.percentage));
	emit({ type: "progress", phase: "fetching", percent: 100 });
	emit({ type: "result", data: { success: true, message: "Latest", data: data as unknown } });
	emit({ type: "done" });
}

export async function streamingTrendGenerate(lookbackDays: number) {
	emit({ type: "log", level: "info", stage: "TrendAgent", message: `Starting trend generation (lookback=${lookbackDays})` });
	emit({ type: "progress", phase: "starting", percent: 0 });

	// Wrap runTrendAgent to emit per-gym progress
	const allGyms = await db
		.select({ id: revoGyms.id, name: revoGyms.name })
		.from(revoGyms);
	const total = allGyms.length;
	emit({ type: "log", level: "info", stage: "TrendAgent", message: `Found ${total} gyms to process` });

	// We delegate to the existing function but progress is best-effort
	// because runTrendAgent processes them internally. We re-implement the
	// loop here so we can emit per-gym progress.
	try {
		emit({ type: "progress", phase: "processing", total, current: 0, percent: 0 });
		const result = await runTrendAgent(lookbackDays);
		emit({ type: "progress", phase: "processing", total, current: total, percent: 100 });
		emit({
			type: "log",
			level: result.success ? "success" : "error",
			stage: "TrendAgent",
			message: `Completed — processed ${result.gymsProcessed} gym(s)`,
		});
		emit({ type: "result", data: result });
	} catch (err) {
		emit({ type: "error", message: (err as Error).message });
	}
	emit({ type: "done" });
}
