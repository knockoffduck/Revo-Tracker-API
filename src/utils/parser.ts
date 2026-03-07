import * as cheerio from "cheerio";
import { GymInfo } from "./types";
import { file } from "bun";
import { db } from "./database";
import { revoGymCount, revoGyms } from "../db/schema";
import { simpleIntegerHash } from "./tools";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { axiosGetWithProxyFallback } from "./proxy";

const refreshCookies = async () => {
	try {
		console.log("[Parser] Refreshing cookies...");
		const proc = Bun.spawn(["bun", "run", "Scraper/generate_cookies.ts"]);
		await proc.exited;
		console.log("[Parser] Cookies refreshed successfully.");
	} catch (e) {
		console.error("[Parser] Failed to refresh cookies:", e);
	}
};

const checkAndRefreshCookies = async () => {
	const cookieFile = file("Scraper/cookies.json");
	if (await cookieFile.exists()) {
		const lastModified = cookieFile.lastModified;
		const now = Date.now();
		const oneDay = 24 * 60 * 60 * 1000;
		if (lastModified && now - lastModified > oneDay) {
			await refreshCookies();
		}
	} else {
		await refreshCookies();
	}
};

const getRotatedCookie = async () => {
	try {
		await checkAndRefreshCookies();
		const cookiesContent = await file("Scraper/cookies.json").text();
		const cookies = JSON.parse(cookiesContent);
		console.log(`[Parser] cookies.json content:`, cookies);
		const randomIndex = Math.floor(Math.random() * cookies.length);
		return cookies[randomIndex];
	} catch (e) {
		console.error("Error reading cookies.json:", e);
		return "";
	}
};

const fetchPHPData = async (retries = 5): Promise<cheerio.CheerioAPI | null> => {
	const url = "https://revocentral.revofitness.com.au/portal/club-counter.php?id=10";
	const cookie = await getRotatedCookie();

	const startTime = Date.now();
	try {
		const response = await axiosGetWithProxyFallback<string>("Parser", url, {
			headers: {
				accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				cookie: cookie,
				referer: "https://revocentral.revofitness.com.au/portal/rewards/",
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15",
			},
			timeout: 10000,
		});
		const duration = Date.now() - startTime;
		console.log(`[Parser] Fetched data successfully (${duration}ms)`);
		return cheerio.load(response.data);
	} catch (e: any) {
		if (retries > 0) {
			console.log(`[Parser] Fetch failed, retrying... (${retries} left)`);
			return fetchPHPData(retries - 1);
		}
		console.error("[Parser] Error fetching PHP data after all retries:", e.message);
		return null;
	}
};

const normalizeGymName = (name: string) => {
	return name
		.normalize("NFKD")
		.replace(/[’']/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
};

const getGymMetadataScore = (gym: {
	active?: number | null;
	postcode?: number | null;
	areaSize?: number | null;
	address?: string | null;
}) => {
	let score = 0;

	if ((gym.active ?? 0) > 0) score += 100;
	if ((gym.postcode ?? 0) > 0) score += 10;
	if ((gym.areaSize ?? 0) > 0) score += 10;
	if (gym.address && gym.address !== "Pending Update") score += 10;

	return score;
};

const buildGymsByNormalizedName = (
	gyms: Array<{
		id: string;
		name: string;
		address: string;
		postcode: number;
		state: string;
		areaSize: number;
		active: number;
		squatRacks?: number;
	}>
) => {
	const gymsByNormalizedName = new Map<string, (typeof gyms)[number]>();

	for (const gym of gyms) {
		const normalizedName = normalizeGymName(gym.name);
		const existingGym = gymsByNormalizedName.get(normalizedName);

		if (
			!existingGym ||
			getGymMetadataScore(gym) > getGymMetadataScore(existingGym)
		) {
			gymsByNormalizedName.set(normalizedName, gym);
		}
	}

	return gymsByNormalizedName;
};

const calculateGymRatios = (size: number, count: number) => {
	if (size <= 0 || count <= 0) {
		return { memberRatio: 0, percentage: 0 };
	}

	const memberRatio = size / count;
	const percentage = (1 - (memberRatio > 60 ? 60 : memberRatio) / 60) * 100;
	return { memberRatio, percentage };
};

const extractClubCounts = ($: cheerio.CheerioAPI) => {
	const scripts = $("script")
		.map((_, el) => $(el).html() || "")
		.get();

	for (const script of scripts) {
		const match = script.match(/var\s+clubCounterLists\s*=\s*(\{[\s\S]*?\})\s*;/);
		if (!match) continue;

		try {
			const clubCounterLists = JSON.parse(match[1]) as Record<
				string,
				{ name?: string; shortname?: string; in_club?: string | number }
			>;

			return Object.values(clubCounterLists)
				.map((club) => ({
					name: String(club.name ?? club.shortname ?? "").replace(/\s+/g, " ").trim(),
					count: Number(club.in_club),
				}))
				.filter((club) => club.name && Number.isFinite(club.count));
		} catch (error) {
			console.warn("[Parser] Failed to parse clubCounterLists JSON, falling back to DOM parsing.", error);
		}
	}

	return $("a.club-shortname")
		.map((_, el) => ({
			name: String($(el).attr("data-club-name") ?? "").replace(/\s+/g, " ").trim(),
			count: Number($(el).attr("data-member-in-club")),
		}))
		.get()
		.filter((club) => club.name && Number.isFinite(club.count));
};

export const parseHTML = async () => {
	const $ = await fetchPHPData();

	if ($ == null) {
		console.log("Failed to fetch PHP data");
		return [];
	}

	const existingGyms = await db.select().from(revoGyms);
	const gymsByNormalizedName = buildGymsByNormalizedName(existingGyms);
	const gymData: GymInfo[] = [];
	const clubCounts = extractClubCounts($);

	for (const club of clubCounts) {
		const scrapedName = club.name;
		const memberCount = club.count;
		
		// Find metadata for this gym in our records using a normalized name to
		// handle source formatting differences like OConnor vs O'Connor.
		const metadata = gymsByNormalizedName.get(normalizeGymName(scrapedName));

		if (metadata) {
			const size = metadata.areaSize || 0;
			const count = memberCount > 0 ? memberCount : 0;
			const { memberRatio, percentage } = calculateGymRatios(size, count);
			
			gymData.push({
				name: metadata.name,
				address: metadata.address || "",
				postcode: metadata.postcode || 0,
				size: size,
				state: metadata.state || "",
				member_count: count,
				member_ratio: memberRatio,
				percentage: percentage,
			});
		} else {
			// If it's a new gym not in our DB yet, we push basic info
			// Note: This gym won't have address/size until the original scraper runs or manual update
			gymData.push({
				name: scrapedName,
				address: "Pending Update",
				postcode: 0,
				size: 0,
				state: "Unknown",
				member_count: memberCount,
				member_ratio: 0,
				percentage: 0,
			});
		}
	}

	const samples = gymData.slice(0, 2).map((g) => `${g.name} (${g.member_count} members)`);
	console.log(`Successfully parsed ${gymData.length} gyms from PHP portal.`);
	console.log(`Data Samples: [${samples.join(", ")}${gymData.length > 2 ? ", ..." : ""}]`);
	return gymData;
};

export const insertGymStats = async (gymData: GymInfo[]) => {
	const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
	const gymList = await db
		.select()
		.from(revoGyms);
	const gymsByNormalizedName = buildGymsByNormalizedName(gymList);

	for (const gym of gymData) {
		const existingGym = gymsByNormalizedName.get(normalizeGymName(gym.name));
		const canonicalName = existingGym?.name ?? gym.name;
		const canonicalPostcode = existingGym?.postcode || gym.postcode;
		const canonicalSize = existingGym?.areaSize || gym.size;
		const count = gym.member_count > 0 ? gym.member_count : 0;
		const { memberRatio, percentage } = calculateGymRatios(canonicalSize, count);
		const inputInfo = {
			id: uuidv4(),
			created: currentTime,
			count,
			ratio: memberRatio,
			gymName: canonicalName,
			percentage,
			gymId: existingGym?.id ?? simpleIntegerHash(canonicalName + canonicalPostcode.toString()).toString(),
		};
		await db.insert(revoGymCount).values(inputInfo);
	}

	const scrapedGymNames = new Set(
		gymData.map((gym) => normalizeGymName(gym.name))
	);
	const missingGyms = gymList.filter((gym) => {
		return !scrapedGymNames.has(normalizeGymName(gym.name));
	});

	if (missingGyms.length > 0) {
		console.log("Missing gyms in current scrape:", missingGyms.map(g => g.name));
		for (const gym of missingGyms) {
			const inputInfo = {
				id: uuidv4(),
				created: currentTime,
				count: 0,
				ratio: 0,
				gymName: gym.name,
				percentage: 0,
				gymId: simpleIntegerHash(gym.name + gym.postcode.toString()).toString(),
			};
			await db.insert(revoGymCount).values(inputInfo);
		}
	}

	// Logging last 5 sessions
	try {
		const logPath = "logs/updated_stats.json";
		let logs: any[] = [];
		try {
			const logContent = await file(logPath).text();
			logs = JSON.parse(logContent);
		} catch (e) {
			// File doesn't exist yet or is invalid
		}

		const fullData = [
			...gymData,
			...missingGyms.map(gym => ({
				name: gym.name,
				address: gym.address || "Pending Update",
				postcode: gym.postcode || 0,
				size: gym.areaSize || 0,
				state: gym.state || "Unknown",
				member_count: 0,
				member_ratio: 0,
				percentage: 0,
			}))
		];

		const newEntry = {
			timestamp: currentTime,
			gymCount: gymData.length,
			missingGyms: missingGyms.length,
			totalGyms: gymList.length,
			data: fullData, // Log the full list of gyms (including missing ones)
		};

		logs.unshift(newEntry);
		const limitedLogs = logs.slice(0, 5);
		await Bun.write(logPath, JSON.stringify(limitedLogs, null, 2));
	} catch (e) {
		console.error("Failed to update session logs:", e);
	}
};

export const updateGymInfo = async (gymData: GymInfo[]) => {
	const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
	const gymList = await db.select().from(revoGyms);
	const gymsByNormalizedName = buildGymsByNormalizedName(gymList);

	for (const gym of gymData) {
		const existingGym = gymsByNormalizedName.get(normalizeGymName(gym.name));
		const postcode = gym.postcode || existingGym?.postcode || 0;
		const info = {
			id: existingGym?.id ?? simpleIntegerHash((existingGym?.name ?? gym.name) + postcode.toString()).toString(),
			name: existingGym?.name ?? gym.name,
			address: gym.address !== "Pending Update" ? gym.address : (existingGym?.address ?? gym.address),
			postcode,
			state: gym.state !== "Unknown" ? gym.state : (existingGym?.state ?? gym.state),
			areaSize: gym.size || existingGym?.areaSize || 0,
			lastUpdated: currentTime,
			active: 1 as number,
			squatRacks: gym.squat_racks ?? existingGym?.squatRacks ?? 0,
		};

		const updateSet: any = {
			name: sql`values(${revoGyms.name})`,
			address: sql`values(${revoGyms.address})`,
			postcode: sql`values(${revoGyms.postcode})`,
			state: sql`values(${revoGyms.state})`,
			areaSize: sql`values(${revoGyms.areaSize})`,
			lastUpdated: sql`values(${revoGyms.lastUpdated})`,
			squatRacks: sql`values(${revoGyms.squatRacks})`,
		};

		await db
			.insert(revoGyms)
			.values(info)
			.onDuplicateKeyUpdate({
				set: updateSet,
			});
	}
};
