import { Hono } from "hono";
import { handleError, handleSuccess } from "./utils/handlers";
import { insertGymStats, parseHTML, updateGymInfo } from "./utils/parser";
import { GymInfo } from "./utils/types";
import { db } from "./utils/database";
import { revoGymCount } from "./db/schema";
import { desc, eq } from "drizzle-orm";

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
	try {
		const rawGymData = await parseHTML();
		if (!isGymArray(rawGymData)) {
			console.log(rawGymData);
			return handleError(c, { message: "Data is not of type Gym[]" });
		}
		await insertGymStats(rawGymData);

		return handleSuccess(c, { message: "Gym stats updated successfully" });
	} catch (error) {
		console.error("Error inserting gym stats:", error);
		return handleError(c, error);
	}
});

app.get("/gyms/stats/latest", async (c) => {
	const latestTime = await db
		.select({ created: revoGymCount.created })
		.from(revoGymCount)
		.orderBy(desc(revoGymCount.created))
		.limit(1);
	if (!latestTime) {
		return handleError(c, { message: "Could not get latestTime in database" });
	}

	const latestData = await db
		.select()
		.from(revoGymCount)
		.where(eq(revoGymCount.created, latestTime[0].created))
		.orderBy(desc(revoGymCount.percentage));

	if (!latestData) {
		return handleError(c, { message: "Could not get latestData in database" });
	}
	return handleSuccess(c, latestData);
});

const insertData = async () => {
	console.log("Inserting data...");
	try {
		const rawGymData = await parseHTML();
		if (!isGymArray(rawGymData)) {
			console.log(rawGymData);
			return { message: "Data is not of type Gym[]" };
		}
		await insertGymStats(rawGymData);

		return { message: "Gym stats updated successfully" };
	} catch (error) {
		console.error("Error inserting gym stats:", error);
		throw error;
	}
};

// Set up the interval to run the function every 5 minutes (300,000 milliseconds)
setInterval(insertData, 5 * 60 * 1000);

export default {
	port: 3001,
	fetch: app.fetch,
};
