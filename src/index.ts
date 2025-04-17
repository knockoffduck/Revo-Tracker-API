import { Hono } from "hono";
import { handleError, handleSuccess } from "./utils/handlers";
import { parseHTML, updateGymInfo } from "./utils/parser";
import { GymInfo } from "./utils/types";

const app = new Hono();

// Type guard function to check if an object is of type Gym
const isGym = (data: any): data is GymInfo => {
	return (
		typeof data.name === "string" &&
		typeof data.size === "number" &&
		typeof data.member_count === "number" &&
		typeof data.member_ratio === "number" &&
		typeof data.percentage === "number" &&
		typeof data.address === "string" &&
		typeof data.postcode === "number" &&
		typeof data.state === "string"
	);
};

// Type guard function to check if an array is of type Gym[]
const isGymArray = (data: any): data is GymInfo[] => {
	return Array.isArray(data) && data.every(isGym);
};

app.get("/", (c) => {
	return c.text("API Home");
});

app.get("/gyms/update", async (c) => {
	const data = await parseHTML();
	if (!isGymArray(data)) {
		return handleError(c, { message: "Data is not of type Gym[]" });
	}
	await updateGymInfo(data);
	return handleSuccess(c, { message: "Data updated successfully" });
});

app.get("/gyms/stats/update", async (c) => {
	const data = await parseHTML();
	if (!isGymArray(data)) {
		return handleError(c, { message: "Data is not of type Gym[]" });
	}
	// const result = await insertData(data);

	return handleSuccess(c, {});
});

// app.get("/gyms/stats/latest", async (c) => {

// 	try {
// 		// Step 1: Get the latest `created_at` timestamp
// 		const { data: latestEntry, error: latestError } = await supabase
// 			.from("Revo Member Stats")
// 			.select("created_at")
// 			.order("created_at", { ascending: false })
// 			.limit(1)
// 			.single(); // Fetch the single latest entry

// 		if (latestError) throw latestError;
// 		if (!latestEntry) throw new Error("No entries found in the database");

// 		const latestCreatedAt = latestEntry.created_at;

// 		// Step 2: Fetch all entries with the same latest `created_at` timestamp
// 		const { data: filteredEntries, error: filteredError } = await supabase
// 			.from("Revo Member Stats")
// 			.select("name, size, member_count, member_ratio, percentage, created_at")
// 			.eq("created_at", latestCreatedAt) // Filter all entries with this timestamp
// 			.order("percentage", { ascending: false }); // Order by percentage descending

// 		if (filteredError) throw filteredError;

// 		const result = {
// 			timestamp: latestCreatedAt,
// 			data: filteredEntries, // Contains all entries with the same latest `created_at`
// 		};

// 		return handleSuccess(c, result);
// 	} catch (error) {
// 		console.error("Error fetching entries:", error);
// 		return handleError(c, error);
// 	}
// });

// app.get("/test", async (c) => {
// 	const gymData = await parseHTML();
// 	if (!gymData) return "error fetching gymdata";
// 	gymData.pop();
// 	const supabase = supabaseClient();
// 	if (!supabase) return "Cannot access Supabase";
// 	const jsonFile = Bun.file("src/utils/gyms.json");
// 	const GYMS: { name: string; size: number }[] = await jsonFile.json();

// 	for (let i = 0; i < GYMS.length; i++) {
// 		const currentGym = GYMS[i];
// 		const exists = gymData.some((gym) => gym.name === currentGym.name);
// 		if (!exists) {
// 			console.log(`Gym ${currentGym.name} has 0 members`);
// 			gymData.push({
// 				name: currentGym.name,
// 				size: currentGym.size,
// 				member_count: 0,
// 				member_ratio: 0,
// 				percentage: 0,
// 			});
// 		}
// 	}
// 	return handleSuccess(c, gymData);
// });

export default {
	port: 3001,
	fetch: app.fetch,
};
