/**
 * Streaming wrappers around the existing scrape/trend/audit functions.
 * These re-use the production logic but emit progress events as they go
 * so the admin dashboard can show real-time progress bars.
 */

import { progressBus } from "./progress";
import { parseHTML, updateGymInfo, insertGymStats } from "./parser";
import { runTrendAgent, generateTrendsForGyms } from "../agents/trendAgent";
import { pb, ensureAdminAuth } from "./database";

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
	await ensureAdminAuth();
	const latestPage = await pb.collection("Revo_Gym_Count").getList(1, 1, {
		sort: "-created",
	});
	const latestTime = latestPage.items[0]?.created;
	if (!latestTime) {
		emit({ type: "error", message: "No stats in database" });
		emit({ type: "done" });
		return;
	}
	const minutePrefix = latestTime.slice(0, 16);
	const data = await pb.collection("Revo_Gym_Count").getFullList({
		filter: `created>='${minutePrefix}:00' && created<='${minutePrefix}:59'`,
		sort: "-percentage",
		batch: 200,
	});
	emit({ type: "progress", phase: "fetching", percent: 100 });
	emit({ type: "result", data: { success: true, message: "Latest", data: data as unknown } });
	emit({ type: "done" });
}

export async function streamingTrendGenerate(lookbackDays: number) {
	emit({ type: "log", level: "info", stage: "TrendAgent", message: `Starting trend generation (lookback=${lookbackDays})` });
	emit({ type: "progress", phase: "starting", percent: 0 });

	await ensureAdminAuth();
	const allGyms = await pb.collection("Revo_Gyms").getFullList({ batch: 200 });
	const total = allGyms.length;
	emit({ type: "log", level: "info", stage: "TrendAgent", message: `Found ${total} gyms to process` });

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

export async function streamingTrendGenerateForGyms(gymIds: string[], lookbackDays: number) {
	const ids = gymIds.filter(Boolean);
	emit({ type: "log", level: "info", stage: "TrendAgent", message: `Starting trend generation for ${ids.length} gym(s) (lookback=${lookbackDays})` });
	emit({ type: "progress", phase: "starting", percent: 0 });

	if (ids.length === 0) {
		emit({ type: "error", message: "No gymIds provided" });
		emit({ type: "done" });
		return;
	}

	const total = ids.length;
	emit({ type: "log", level: "info", stage: "TrendAgent", message: `Found ${total} gym(s) to process` });

	try {
		emit({ type: "progress", phase: "processing", total, current: 0, percent: 0 });
		const result = await generateTrendsForGyms(ids, lookbackDays);
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
