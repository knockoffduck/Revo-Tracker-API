import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as cheerio from "cheerio";
import { GymInfo } from "./types";
import { file } from "bun";
import { db } from "./database";
import { revoGymCount, revoGyms } from "../db/schema";
import { simpleIntegerHash } from "./tools";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

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

const getRotatedProxy = async () => {
	try {
		const proxiesContent = await file("Scraper/proxies.json").text();
		const proxies = JSON.parse(proxiesContent);
		if (!proxies || proxies.length === 0) return null;

		const randomIndex = Math.floor(Math.random() * proxies.length);
		const proxyStr = proxies[randomIndex];
		const parts = proxyStr.split(":");

		// Handle host:port:user:pass -> http://user:pass@host:port
		if (parts.length >= 4) {
			return `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
		}

		return `http://${parts[0]}:${parts[1]}`;
	} catch (e) {
		console.error("Error reading proxies.json.");
		return null;
	}
};

const fetchPHPData = async (retries = 5): Promise<cheerio.CheerioAPI | null> => {
	const url = "https://revocentral.revofitness.com.au/portal/club-counter.php?id=10";
	const cookie = await getRotatedCookie();
	const proxy = await getRotatedProxy();
	const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

	const startTime = Date.now();
	try {
		const response = await axios.get(url, {
			headers: {
				accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				cookie: cookie,
				referer: "https://revocentral.revofitness.com.au/portal/rewards/",
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15",
			},
			httpsAgent: agent,
			proxy: false, // Tell axios not to use its own proxy logic
			timeout: 10000,
		});
		const duration = Date.now() - startTime;
		console.log(
			`Fetched data successfully via proxy: ${proxy || "Direct Connection"} (${duration}ms)`
		);
		return cheerio.load(response.data);
	} catch (e: any) {
		if (retries > 0) {
			console.log(`Proxy failed (${proxy || "Direct"}), retrying... (${retries} left)`);
			return fetchPHPData(retries - 1);
		}
		console.error("Error fetching PHP data after all retries:", e.message);
		return null;
	}
};

export const parseHTML = async () => {
	const $ = await fetchPHPData();

	if ($ == null) {
		console.log("Failed to fetch PHP data");
		return [];
	}

	const existingGyms = await db.select().from(revoGyms);
	const gymData: GymInfo[] = [];

	// Extract counts from the dropdown list which contains all clubs
	$("a.club-shortname").each((i, el) => {
		const name = $(el).attr("data-club-name");
		const countStr = $(el).attr("data-member-in-club");
		if (!name || countStr === undefined) return;

		const memberCount = Number(countStr);
		
		// Find metadata for this gym in our records
		const metadata = existingGyms.find((g) => g.name === name);

		if (metadata) {
			const size = metadata.areaSize || 0;
			const memberAreaRatio = size > 0 && memberCount > 0 ? size / memberCount : 0;
			
			gymData.push({
				name: name,
				address: metadata.address || "",
				postcode: metadata.postcode || 0,
				size: size,
				state: metadata.state || "",
				member_count: memberCount,
				member_ratio: memberAreaRatio,
				percentage: size > 0 ? (1 - (memberAreaRatio > 60 ? 60 : memberAreaRatio) / 60) * 100 : 0,
			});
		} else {
			// If it's a new gym not in our DB yet, we push basic info
			// Note: This gym won't have address/size until the original scraper runs or manual update
			gymData.push({
				name: name,
				address: "Pending Update",
				postcode: 0,
				size: 0,
				state: "Unknown",
				member_count: memberCount,
				member_ratio: 0,
				percentage: 0,
			});
		}
	});

	const samples = gymData.slice(0, 2).map((g) => `${g.name} (${g.member_count} members)`);
	console.log(`Successfully parsed ${gymData.length} gyms from PHP portal.`);
	console.log(`Data Samples: [${samples.join(", ")}${gymData.length > 2 ? ", ..." : ""}]`);
	return gymData;
};

export const insertGymStats = async (gymData: GymInfo[]) => {
	const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
	const gymList = await db
		.select({ name: revoGyms.name, postcode: revoGyms.postcode })
		.from(revoGyms);

	for (const gym of gymData) {
		const inputInfo = {
			id: uuidv4(),
			created: currentTime,
			count: gym.member_count,
			ratio: gym.member_ratio,
			gymName: gym.name,
			percentage: gym.percentage,
			gymId: simpleIntegerHash(gym.name + gym.postcode.toString()).toString(),
		};
		await db.insert(revoGymCount).values(inputInfo);
	}

	const missingGyms = gymList.filter((gym) => {
		return !gymData.some((g) => g.name === gym.name);
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

		const newEntry = {
			timestamp: currentTime,
			gymCount: gymData.length,
			missingGyms: missingGyms.length,
			data: gymData.slice(0, 5), // Log first 5 gyms for detail
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
	for (const gym of gymData) {
		const info = {
			id: simpleIntegerHash(gym.name + gym.postcode.toString()).toString(),
			name: gym.name,
			address: gym.address,
			postcode: gym.postcode,
			state: gym.state,
			areaSize: gym.size,
			lastUpdated: currentTime,
			active: 1 as number,
		};

		await db
			.insert(revoGyms)
			.values(info)
			.onDuplicateKeyUpdate({
				set: {
					name: sql`values(${revoGyms.name})`,
					address: sql`values(${revoGyms.address})`,
					postcode: sql`values(${revoGyms.postcode})`,
					state: sql`values(${revoGyms.state})`,
					areaSize: sql`values(${revoGyms.areaSize})`,
					lastUpdated: sql`values(${revoGyms.lastUpdated})`,
				},
			});
	}
};
