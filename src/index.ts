import { Hono } from "hono";
import { handleError, handleSuccess } from "./utils/handlers";
import { insertGymStats, parseHTML, updateGymInfo } from "./utils/parser";
import { GymInfo } from "./utils/types";
import { supabase } from "./utils/database";

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

// Type guards remain unchanged
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

const isGymArray = (data: any): data is GymInfo[] =>
    Array.isArray(data) && data.every(isGym);

// Home Route - Fetch latest timestamp
app.get("/", async (c) => {
    const { data, error } = await supabase
        .from("Revo_Gym_Count")
        .select("created")
        .order("created", { ascending: false })
        .limit(1);

    if (error) return handleError(c, error);

    console.log(data);
    return c.text("API Home");
});

// Update gym info route
app.get("/gyms/update", async (c) => {
    const data = await parseHTML();
    if (!isGymArray(data)) {
        return handleError(c, { message: "Data is not of type Gym[]" });
    }

    await updateGymInfo(data); // Update logic inside parser module
    return handleSuccess(c, { message: "Data updated successfully" });
});

// Update gym stats route
app.get("/gyms/stats/update", async (c) => {
    try {
        const rawGymData = await parseHTML();
        if (!isGymArray(rawGymData)) {
            return handleError(c, { message: "Data is not of type Gym[]" });
        }

        await insertGymStats(rawGymData); // This can also be adapted to use supabase

        return handleSuccess(c, { message: "Gym stats updated successfully" });
    } catch (error) {
        console.error("Error inserting gym stats:", error);
        return handleError(c, error);
    }
});

// Fetch latest gym stats
app.get("/gyms/stats/latest", async (c) => {
    // 1️⃣ Get latest timestamp
    const { data: latestTimeData, error: latestError } = await supabase
        .from("Revo_Gym_Count")
        .select("created")
        .order("created", { ascending: false })
        .limit(1);

    if (latestError || !latestTimeData?.length) {
        return handleError(c, {
            message: "Could not get latestTime in database",
        });
    }

    const latestCreated = latestTimeData[0].created;

    // 2️⃣ Fetch all gym rows matching that timestamp
    const { data: latestData, error: dataError } = await supabase
        .from("Revo_Gym_Count")
        .select("*")
        .eq("created", latestCreated)
        .order("percentage", { ascending: false });

    if (dataError || !latestData) {
        return handleError(c, {
            message: "Could not get latestData in database",
        });
    }

    return handleSuccess(c, latestData);
});

callEveryFiveMinutes();

export default {
    port: 3050,
    fetch: app.fetch,
};
