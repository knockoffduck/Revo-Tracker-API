import "dotenv/config";
import PocketBase from "pocketbase";

const POCKETBASE_URL = process.env.POCKETBASE_URL ?? "https://pb.dvcklab.work";

export const pb = new PocketBase(POCKETBASE_URL);

/**
 * Drop the cached superuser token so the next `ensureAdminAuth()` authenticates
 * again from `POCKETBASE_ADMIN_*`.
 *
 * PocketBase revokes every previously issued token whenever the superuser
 * record changes (tokenKey rotation on a dashboard save, `pocketbase superuser`
 * CLI update, restore), but the SDK only inspects the JWT `exp` — so the
 * revoked token keeps looking valid for up to its full 24h lifetime while every
 * privileged request is rejected.
 */
export const invalidateAdminAuth = (): void => {
	pb.authStore.clear();
};

// A 401/403 on a request that carried a token means the server no longer
// accepts it, regardless of what `authStore.isValid` believes. Clear the store
// so the next call re-authenticates instead of failing until `exp` passes.
pb.afterSend = (response, data) => {
	if ((response.status === 401 || response.status === 403) && pb.authStore.token) {
		console.warn(
			`[PocketBase] ${response.status} on ${response.url} — cached admin token rejected, clearing`,
		);
		invalidateAdminAuth();
	}
	return data;
};

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
