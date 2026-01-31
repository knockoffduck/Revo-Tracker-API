import { Hono } from "hono";
import { handleError, handleSuccess } from "./utils/handlers";
import { insertGymStats, parseHTML, updateGymInfo } from "./utils/parser";
import { GymInfo } from "./utils/types";
import { db } from "./utils/database";
import { revoGymCount } from "./db/schema";
import { desc, eq } from "drizzle-orm";

const app = new Hono();

const callEveryFiveMinutes = () => {
  const ENDPOINT = "https://revotrackerapi.dvcklab.com/gyms/stats/update"; // or your production URL

  setInterval(
    async () => {
      try {
        console.log(
          `[Scheduler] Executing ${ENDPOINT} at ${new Date().toISOString()}`,
        );
        const res = await fetch(ENDPOINT);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        console.log(`[Scheduler] Success`);
      } catch (err) {
        console.error(`[Scheduler] Error:`, err);
      }
    },
    5 * 60 * 1000,
  ); // 5 minutes
};

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

// ============ Trend Agent Endpoints ============

// Global lock to prevent concurrent trend generation
let isTrendGenerationRunning = false;

app.get("/gyms/trends/generate", async (c) => {
  if (isTrendGenerationRunning) {
    return handleError(c, {
      message: "Trend generation is already running. Check server logs for progress.",
    }, 409);
  }

  try {
    const { runTrendAgent } = await import("./agents/trendAgent");
    const lookbackDays = Number(c.req.query("lookback")) || 90;

    // Run in background
    isTrendGenerationRunning = true;
    console.log("[API] Starting background trend generation...");

    // Fire and forget (with cleanup)
    runTrendAgent(lookbackDays)
      .then((result) => {
        console.log(`[API] Trend generation finished: ${result.success ? "Success" : "Failed"}`);
        isTrendGenerationRunning = false;
      })
      .catch((err) => {
        console.error("[API] Trend generation crashed:", err);
        isTrendGenerationRunning = false;
      });

    return handleSuccess(c, {
      message: "Trend generation started in background. Check server logs for progress.",
    }, 202);
  } catch (error) {
    console.error("Error initiating trends:", error);
    isTrendGenerationRunning = false;
    return handleError(c, error);
  }
});

app.get("/gyms/trends/:gymId", async (c) => {
  try {
    const { getGymTrends } = await import("./agents/trendAgent");
    const gymId = c.req.param("gymId");
    const trends = await getGymTrends(gymId);

    if (trends.length === 0) {
      return handleError(c, {
        message: `No trend data found for gym ${gymId}. Run /gyms/trends/generate first.`,
      });
    }

    return handleSuccess(c, trends);
  } catch (error) {
    console.error("Error getting gym trends:", error);
    return handleError(c, error);
  }
});

app.get("/gyms/trends", async (c) => {
  try {
    const { getAllGymTrends } = await import("./agents/trendAgent");
    const trendsMap = await getAllGymTrends();

    // Convert Map to object for JSON serialization
    const trendsObj: Record<string, any> = {};
    trendsMap.forEach((value, key) => {
      trendsObj[key] = value;
    });

    return handleSuccess(c, trendsObj);
  } catch (error) {
    console.error("Error getting all gym trends:", error);
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

if (import.meta.main) {
  callEveryFiveMinutes();
}

export default {
  port: 3001,
  fetch: app.fetch,
  idleTimeout: 60 // 5 minutes (default is 30s in Bun, Hono might be interfering or client side timeout, but user said "bun.server has timed out")
};
