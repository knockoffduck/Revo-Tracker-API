import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleError, handleSuccess } from "./utils/handlers";
import { insertGymStats, parseHTML, updateGymInfo } from "./utils/parser";
import { GymInfo } from "./utils/types";
import { enrichGymData } from "./utils/details";
import { pb, ensureAdminAuth } from "./utils/database";
import admin from "./admin";

const app = new Hono();

// ── Rate limiter ───────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window per IP

function getClientIp(c: { req: { header: (name: string) => string | undefined } }) {
  const forwardedFor = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return realIp?.trim() ?? "unknown";
}

app.use("*", async (c, next) => {
  // Skip rate limiting for the scheduler's internal scrape endpoint
  const path = c.req.path;
  if (path === "/gyms/stats/update" || path === "/gyms/update") {
    return next();
  }

  const ip = getClientIp(c);
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (current.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return c.json({ error: "Too many requests" }, 429, {
      "Retry-After": String(retryAfter),
    });
  }

  current.count += 1;
  rateLimitStore.set(ip, current);
  return next();
});

// CORS — allow the Next.js dev server (and any localhost/private-IP origin)
// to call this API. In production, set CORS_ORIGINS to the frontend domain(s).
const configuredOrigins = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const allowPrivateIps = process.env.CORS_ALLOW_PRIVATE_IPS === "1" || configuredOrigins.length === 0;

const isPrivateDevOrigin = (origin: string) => {
	try {
		const { hostname } = new URL(origin);
		const is172Private = /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
		return (
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname.startsWith("192.168.") ||
			hostname.startsWith("10.") ||
			is172Private
		);
	} catch {
		return false;
	}
};

app.use(
	"*",
	cors({
		origin: (origin) => {
			if (!origin) return configuredOrigins[0] ?? "*";
			if (configuredOrigins.includes(origin)) return origin;
			if (allowPrivateIps && isPrivateDevOrigin(origin)) return origin;
			return null;
		},
		allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
		allowMethods: ["GET", "POST", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		credentials: true,
	}),
);

// Mount admin module (own auth, see src/admin.ts)
app.route("/", admin);

const callEveryFiveMinutes = () => {
  const ENDPOINT = process.env.SCHEDULER_URL
    || (process.env.NODE_ENV === "production"
      ? "https://revotrackerapi.dvcklab.com/gyms/stats/update"
      : "http://localhost:3001/gyms/stats/update");

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
  return Array.isArray(data) && data.every(isGym);
};

app.get("/", (c) => {
  return c.text("API Home");
});

app.get("/gyms/update", async (c) => {
  let data = await parseHTML();
  if (!isGymArray(data)) {
    return handleError(c, { message: "Data is not of type Gym[]" });
  }

  // Fetch squat racks count
  data = await enrichGymData(data);

  await updateGymInfo(data);
  return handleSuccess(c, { message: "Data updated successfully" });
});

app.get("/gyms/stats/update", async (c) => {
  try {
    let rawGymData = await parseHTML();
    if (!isGymArray(rawGymData)) {
      return handleError(c, { message: "Data is not of type Gym[]" });
    }
    rawGymData = await enrichGymData(rawGymData);
    await updateGymInfo(rawGymData);
    await insertGymStats(rawGymData);

    return handleSuccess(c, { message: "Gym stats updated successfully" });
  } catch (error) {
    console.error("Error inserting gym stats:", error);
    return handleError(c, error);
  }
});

app.get("/gyms/stats/latest", async (c) => {
  try {
    await ensureAdminAuth();
    const latestPage = await pb.collection("Revo_Gym_Count").getList(1, 1, {
      sort: "-created",
    });
    const latestTime = latestPage.items[0]?.created;
    if (!latestTime) {
      return handleError(c, {
        message: "Could not get latestTime in database",
      });
    }

    const minutePrefix = latestTime.slice(0, 16);
    const latestData = await pb.collection("Revo_Gym_Count").getFullList({
      filter: `created>='${minutePrefix}:00' && created<='${minutePrefix}:59'`,
      sort: "-percentage",
      batch: 200,
    });

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

if (import.meta.main) {
  callEveryFiveMinutes();
}

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
  idleTimeout: 300 // scrape + enrichment takes 80s+; 60s causes ECONNRESET
};
