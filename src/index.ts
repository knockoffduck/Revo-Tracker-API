import { Hono } from "hono";
import { handleError, handleSuccess } from "./utils/handlers";
import { insertData, parseHTML } from "./utils/parser";
import { Gym } from "./utils/types";
import { supabaseClient } from "./utils/supabaseClient";
import { SupabaseClient } from "@supabase/supabase-js";

const app = new Hono();

// Type guard function to check if an object is of type Gym
const isGym = (data: any): data is Gym => {
	return (
		typeof data.name === "string" &&
		typeof data.size === "number" &&
		typeof data.member_count === "number" &&
		typeof data.member_ratio === "number" &&
		typeof data.percentage === "number"
	);
};

// Type guard function to check if an array is of type Gym[]
const isGymArray = (data: any): data is Gym[] => {
	return Array.isArray(data) && data.every(isGym);
};

app.get("/", (c) => {
	return c.text("API Home");
});

app.get("/gyms/stats/update", async (c) => {
	const data = await parseHTML();
	if (!isGymArray(data)) {
		return handleError(c, { message: "Data is not of type Gym[]" });
	}
	const updateData = await insertData(data);
	if (updateData === 500) return handleError(c, 500);

	return handleSuccess(c, updateData);
});

app.get("/gyms/stats/latest", async (c) => {
	const supabase = await supabaseClient();
	if (!supabase) return handleError(c, "Cannot open Supabase");

	try {
		// Step 1: Get the latest entry
		const latestEntry = await supabase
			.from("Revo Member Stats")
			.select("created_at")
			.order("created_at", { ascending: false })
			.limit(1)
			.single();

		if (latestEntry.error) throw latestEntry.error;

		// Step 2: Filter entries with the same created_at
		const latestCreatedAt = latestEntry.data.created_at;

		const filteredEntries = await supabase
			.from("Revo Member Stats")
			.select("name,size,member_count,member_ratio,percentage")
			.order("percentage", { ascending: false })
			.eq("created_at", latestCreatedAt);

		if (filteredEntries.error) throw filteredEntries.error;

		const result = {
			timestamp: latestCreatedAt,
			data: filteredEntries.data,
		};

		return handleSuccess(c, result); // Returns entries with the same created_at timestamp
	} catch (error) {
		console.error("Error fetching entries:", error);
		return handleError(c, error); // Handle errors as needed
	}
});

export default {
	port: 3001,
	fetch: app.fetch,
};
