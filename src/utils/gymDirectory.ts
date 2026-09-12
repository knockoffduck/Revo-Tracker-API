/**
 * The gyms Revo actually operates.
 *
 * revocentral's club-counter reports every club in Revo's chain database, not
 * every location that exists: clubs for unopened sites ("Trinity Gardens",
 * "Busselton"), the retired club of a relocated site ("Nunawading - (Original)",
 * "Cockburn2") and aliases of an already-listed gym ("Knox" for Knoxfield).
 * Creating a gym from each club name is what put phantom locations into
 * Revo_Gyms, where they then collected forever-empty snapshots.
 *
 * The public directory at https://revofitness.com.au/gyms/ publishes a page only
 * for a location that is open, so it decides what a club has to match to be
 * tracked as a gym. It is fetched at most once a day and cached in logs/, since
 * the scrape itself runs every five minutes.
 */

import { file } from "bun";
import { describeError, resolveAlert, sendAlert } from "./alerts";
import { axiosGetWithProxyFallback } from "./proxy";

/** Where the directory of open gyms lives. */
const DIRECTORY_URL = "https://revofitness.com.au/gyms/";
const CACHE_FILE = "logs/open_gyms.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A directory smaller than this means the page markup changed, not that Revo
 * closed its estate. Refusing a suspicious page keeps the previous day's names
 * in play instead of silently rejecting every club.
 */
const MIN_DIRECTORY_SIZE = 20;

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15";

type DirectoryCache = { fetchedAt: string; names: string[] };

/**
 * Gym names from the directory page, which renders a published WordPress post
 * per open gym. The post title is only trusted when the same object is a `gyms`
 * post, so a future page that embeds testimonials or blog posts cannot inject
 * names.
 */
export const parseDirectoryGymNames = (html: string): string[] => {
	const names: string[] = [];
	const pattern = /"post_title":"([^"]+)","post_excerpt":"[^"]*","post_status":"([^"]+)"[^}]*?"post_type":"gyms"/g;

	for (const match of html.matchAll(pattern)) {
		const [, title, status] = match;
		if (status === "publish" && title.trim()) names.push(title.trim());
	}

	return names;
};

const readCache = async (): Promise<DirectoryCache | null> => {
	try {
		const cached = JSON.parse(await file(CACHE_FILE).text()) as DirectoryCache;
		if (typeof cached?.fetchedAt !== "string" || !Array.isArray(cached.names)) return null;
		if (cached.names.length < MIN_DIRECTORY_SIZE) return null;
		return cached;
	} catch {
		return null;
	}
};

const writeCache = async (names: string[]): Promise<void> => {
	try {
		await Bun.write(
			CACHE_FILE,
			JSON.stringify({ fetchedAt: new Date().toISOString(), names }, null, 2),
		);
	} catch (err) {
		console.warn(`[PARSE] ⚠ Could not cache the gym directory: ${describeError(err)}`);
	}
};

const fetchDirectory = async (): Promise<string[] | null> => {
	try {
		const response = await axiosGetWithProxyFallback<string>("Directory", DIRECTORY_URL, {
			headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
			timeout: 20000,
		});
		const names = parseDirectoryGymNames(response.data);

		if (names.length < MIN_DIRECTORY_SIZE) {
			await sendAlert({
				key: "directory.gyms",
				severity: "warning",
				title: "Revo gym directory page unreadable",
				details: `Only ${names.length} gym names were found on ${DIRECTORY_URL} — the page markup has probably changed`,
				hint: "check parseDirectoryGymNames() in src/utils/gymDirectory.ts against the live page; until then only gyms already in Revo_Gyms are tracked",
			});
			return null;
		}

		await resolveAlert("directory.gyms");
		return names;
	} catch (err) {
		await sendAlert({
			key: "directory.gyms",
			severity: "warning",
			title: "Could not fetch the Revo gym directory",
			details: `${DIRECTORY_URL} did not respond; the scrape falls back to a cached copy, then to the gyms already in Revo_Gyms`,
			error: err,
			hint: "no action needed unless this persists — track GymDirectoryFetch in the admin log stream",
		});
		return null;
	}
};

/**
 * Names of the open Revo gyms, or `null` when the directory is neither
 * fetchable nor cached — callers then fall back to the gyms already in the
 * database instead of tracking whatever the member portal reports.
 */
export const getOpenGymNames = async (): Promise<Set<string> | null> => {
	const cached = await readCache();
	if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
		return new Set(cached.names);
	}

	const names = await fetchDirectory();
	if (names) {
		await writeCache(names);
		return new Set(names);
	}

	if (cached) {
		console.warn(
			`[PARSE] ⚠ Using the cached gym directory from ${cached.fetchedAt} (${cached.names.length} gyms)`,
		);
		return new Set(cached.names);
	}

	return null;
};
