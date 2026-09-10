import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleError, handleSuccess } from "./utils/handlers";
import { insertGymStats, parseHTML, updateGymInfo } from "./utils/parser";
import { GymInfo } from "./utils/types";
import { enrichGymData } from "./utils/details";
import { pb, ensureAdminAuth } from "./utils/database";
import { readString } from "./utils/tools";
import { resolveAlert, sendAlert } from "./utils/alerts";
import admin from "./admin";

const app = new Hono();

/** One-line summary of an endpoint's response body, for failure alerts. */
const summarizeResponse = (body: string): string => {
	const trimmed = body.trim();
	if (!trimmed) return "empty response body";

	try {
		const parsed: unknown = JSON.parse(trimmed);
		const message = readString(parsed, "error") ?? readString(parsed, "message");
		if (message) return message;
	} catch {
		// not JSON — fall through to the raw text
	}

	return trimmed.length > 200 ? `${trimmed.slice(0, 199)}…` : trimmed;
};

// ── Rate limiter ───────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window per IP

// Periodically evict expired entries to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (entry.resetAt <= now) rateLimitStore.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

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
      const startedAt = Date.now();
      try {
        console.log(
          `[Scheduler] Executing ${ENDPOINT} at ${new Date().toISOString()}`,
        );
        const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(60_000) });
        const body = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${ENDPOINT} — ${summarizeResponse(body)}`);
        }
        console.log(`[Scheduler] Success (${Date.now() - startedAt}ms)`);
        await resolveAlert("scheduler.stats");
      } catch (err) {
        console.error(`[Scheduler] Error:`, err);
        await sendAlert({
          key: "scheduler.stats",
          severity: "error",
          title: "Scheduled snapshot run failed — site keeps serving the previous snapshot",
          details: `Endpoint ${ENDPOINT}\nElapsed ${Date.now() - startedAt}ms`,
          error: err,
          hint: "the endpoint body above names the scrape/write failure; check the run output in the admin dashboard",
        });
      }
    },
    5 * 60 * 1000,
  ); // 5 minutes
};

const callEveryTwoDays = () => {
  const BASE = process.env.SCHEDULER_URL
    ? process.env.SCHEDULER_URL.replace(/\/gyms\/stats\/update$/, "")
    : (process.env.NODE_ENV === "production"
      ? "https://revotrackerapi.dvcklab.com"
      : "http://localhost:3001");
  const ENDPOINT = `${BASE}/gyms/update`;

  setInterval(
    async () => {
      try {
        console.log(
          `[Scheduler] Executing enrichment ${ENDPOINT} at ${new Date().toISOString()}`,
        );
        const res = await fetch(ENDPOINT);
        const body = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${ENDPOINT} — ${summarizeResponse(body)}`);
        }
        console.log(`[Scheduler] Enrichment success`);
        await resolveAlert("scheduler.enrichment");
      } catch (err) {
        console.error(`[Scheduler] Enrichment error:`, err);
        await sendAlert({
          key: "scheduler.enrichment",
          severity: "warning",
          title: "Scheduled gym metadata enrichment failed",
          details: `Endpoint ${ENDPOINT}`,
          error: err,
          hint: "squat rack/address/area data goes stale until this succeeds",
        });
      }
    },
    2 * 24 * 60 * 60 * 1000,
  ); // 2 days
};

const ARCHIVE_RETENTION_DAYS = Number(process.env.ARCHIVE_RETENTION_DAYS ?? "90");

const callArchiveWeekly = () => {
  const runArchive = async () => {
    try {
      console.log(`[Scheduler] Starting weekly archive at ${new Date().toISOString()}`);
      const { archiveGymCount } = await import("../scripts/archive-gym-count");
      const result = await archiveGymCount(ARCHIVE_RETENTION_DAYS, false);
      console.log(`[Scheduler] Archive complete: ${result.deleted}/${result.total} rows removed`);
      await resolveAlert("archive.run");
    } catch (err) {
      console.error(`[Scheduler] Archive error:`, err);
      await sendAlert({
        key: "archive.run",
        severity: "error",
        title: "90-day snapshot archive failed",
        details: `Retention ${ARCHIVE_RETENTION_DAYS} days; Revo_Gym_Count keeps growing until this succeeds`,
        error: err,
        hint: "run bun run scripts/archive-gym-count.ts on the host to see the full error",
      });
    }
  };

  // Run once 5 minutes after startup (catch up on anything missed while down),
  // then every 7 days.
  setTimeout(runArchive, 5 * 60 * 1000);
  setInterval(runArchive, 7 * 24 * 60 * 60 * 1000);
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

let isScrapeRunning = false;

// Hard cap on a single scrape so the in-process lock can never wedge the
// scheduler forever. Normal runs take ~10-30s; a run exceeding this is hung.
// Read per request so tests can override without restarting the module.
const scrapeDeadlineMs = () => Number(process.env.SCRAPE_DEADLINE_MS ?? 3 * 60 * 1000);

app.get("/gyms/stats/update", async (c) => {
  if (isScrapeRunning) {
    return handleError(c, { message: "A scrape is already in progress" }, 409);
  }
  isScrapeRunning = true;
  try {
    const deadlineMs = scrapeDeadlineMs();
    const scrape = (async () => {
      const rawGymData = await parseHTML();
      if (!isGymArray(rawGymData)) {
        throw new Error("Data is not of type Gym[]");
      }
      // An empty scrape writes nothing but would otherwise report success,
      // hiding a dead scrape behind a 200.
      if (rawGymData.length === 0) {
        throw new Error("Scrape returned 0 gyms — no snapshot written");
      }
      await insertGymStats(rawGymData);
      return rawGymData;
    })();

    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`Scrape timed out after ${deadlineMs / 1000}s`));
      }, deadlineMs);
      // Clear the timer when the scrape settles first, so it can't fire late.
      scrape.then(() => clearTimeout(t), () => clearTimeout(t));
    });

    await Promise.race([scrape, timeout]);
    return handleSuccess(c, { message: "Gym stats updated successfully" });
  } catch (error) {
    console.error("Error inserting gym stats:", error);
    return handleError(c, error);
  } finally {
    isScrapeRunning = false;
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
        void sendAlert({
          key: "trends.run",
          severity: "error",
          title: "Trend generation crashed",
          details: "Popular-times data keeps serving the previous cache",
          error: err,
          hint: "re-run /gyms/trends/generate after fixing the cause",
        });
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
  callEveryTwoDays();
  callArchiveWeekly();
}

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
  idleTimeout: 255 // max allowed by Bun; scrape + enrichment takes ~80s
};
