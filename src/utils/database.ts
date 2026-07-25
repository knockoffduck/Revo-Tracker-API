import "dotenv/config";
import PocketBase from "pocketbase";

const POCKETBASE_URL = process.env.POCKETBASE_URL ?? "https://pb.dvcklab.work";

export const pb = new PocketBase(POCKETBASE_URL);

let adminAuthPromise: Promise<void> | null = null;

export const ensureAdminAuth = async (): Promise<void> => {
	if (pb.authStore.isValid) return;

	if (!adminAuthPromise) {
		const email = process.env.POCKETBASE_ADMIN_EMAIL;
		const password = process.env.POCKETBASE_ADMIN_PASSWORD;
		if (!email || !password) {
			throw new Error("POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are required");
		}

		adminAuthPromise = pb.admins
			.authWithPassword(email, password)
			.then(() => {
				console.log("[PocketBase] Admin authenticated");
				adminAuthPromise = null;
			})
			.catch((err) => {
				adminAuthPromise = null;
				throw err;
			});
	}

	return adminAuthPromise;
};

// Refresh admin token once per day.
setInterval(async () => {
	try {
		if (pb.authStore.isValid) {
			await pb.admins.authRefresh();
		} else {
			await ensureAdminAuth();
		}
	} catch (err) {
		console.error("[PocketBase] Admin auth refresh failed:", err);
	}
}, 24 * 60 * 60 * 1000);

// Attempt initial auth on startup, but do not block server boot.
ensureAdminAuth().catch((err) => {
	console.error("[PocketBase] Initial admin auth failed:", err);
});

/** Format a JS Date as a PocketBase date string (ISO 8601). */
export const toPbDate = (date: Date): string => date.toISOString();

/** Format a JS Date as a MySQL-compatible datetime string (YYYY-MM-DD HH:MM:SS). */
export const toSqlDate = (date: Date): string =>
	date.toISOString().slice(0, 19).replace("T", " ");
