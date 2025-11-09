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
  console.log(data);
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
  try {
    const latestTime = await db
      .select({ created: revoGymCount.created })
      .from(revoGymCount)
      .orderBy(desc(revoGymCount.created))
      .limit(1);
    if (!latestTime) {
      return handleError(c, {
        message: "Could not get latestTime in database",
      });
    }

    const latestData = await db
      .select()
      .from(revoGymCount)
      .where(eq(revoGymCount.created, latestTime[0].created))
      .orderBy(desc(revoGymCount.percentage));
    console.log(latestData);
    return handleSuccess(c, latestData);
  } catch (error) {
    console.error("Error getting latest gym stats:", error);
    return handleError(c, error);
  }
});

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
