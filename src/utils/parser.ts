import * as cheerio from "cheerio";
import { GymInfo } from "./types";
import { file } from "bun";
import { pb, ensureAdminAuth, toPbDate, toSqlDate } from "./database";
import { sqlDb } from "../db/database";
import { revoGyms, revoGymCount } from "../db/schema";
import { simpleIntegerHash } from "./tools";
import { axiosGetWithProxyFallback } from "./proxy";
import { PHPSerializer } from "../../Scraper/deserializer";
import { sendAlert } from "./alerts";

// ---- Logging helpers ----

const STAGE = {
	COOKIES: "\x1b[36m[COOKIES]\x1b[0m",
	FETCH: "\x1b[35m[FETCH]\x1b[0m",
	PARSE: "\x1b[34m[PARSE]\x1b[0m",
	DB: "\x1b[33m[DB]\x1b[0m",
	OK: "\x1b[32m✔\x1b[0m",
	WARN: "\x1b[33m⚠\x1b[0m",
	FAIL: "\x1b[31m✖\x1b[0m",
	INFO: "\x1b[90mℹ\x1b[0m",
};

type CookieAttempt = {
	index: number;
	label: string;
	duration_ms: number;
	gymsFound: number;
	proxy: string;
	status: "network_error" | "zero_gyms" | "valid";
	error?: string;
};

type ScrapeSession = {
	startedAt: string;
	cookiesAvailable: number;
	cookieAttempts: CookieAttempt[];
	workingCookieIndex?: number;
	totalGymsFound: number;
	missingGyms: number;
	totalKnownGyms: number;
	dbInserts: number;
	dbUpdates: number;
	duration_ms: number;
};

let currentSession: ScrapeSession | null = null;
let lastAllCookiesFailedAlert = 0;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // minimum 1h between same alerts

const nowIso = () => new Date().toISOString();

const cookieToReadable = (cookie: string): string => {
	try {
		const serialized = cookie.includes("=") ? cookie.split("=")[1] : cookie;
		const decoded = decodeURIComponent(serialized);
		const serializer = new PHPSerializer();
		const obj = serializer.unserialize(decoded);
		return `${obj.firstName} ${obj.lastName} <${obj.email}>`;
	} catch {
		return cookie.length > 60 ? cookie.substring(0, 60) + "..." : cookie;
	}
};

const alertAllCookiesFailed = (cookies: string[]) => {
	const now = Date.now();
	if (now - lastAllCookiesFailedAlert < ALERT_COOLDOWN_MS) {
		console.log(`${STAGE.FETCH} Alert suppressed (cooldown active — last alert < 1h ago)`);
		return;
	}
	lastAllCookiesFailedAlert = now;

	const body = [
		`All <b>${cookies.length}</b> cookies exhausted — zero gyms scraped.`,
		``,
		`Likely causes:`,
		`• All cookies expired or banned`,
		`• Proxy IP blocked by Revo`,
		`• Portal structure changed`,
		``,
		`Run <code>bun run Scraper/generate_cookies.ts</code> to regenerate cookies.`,
	].join("\n");

	sendAlert("error", "All Cookies Failed — Zero Gyms", body);
};

// ---- Cookie management ----

const refreshCookies = async () => {
	console.log(`${STAGE.COOKIES} Refreshing cookies...`);
	try {
		const proc = Bun.spawn(["bun", "run", "Scraper/generate_cookies.ts"]);
		await proc.exited;
		if (proc.exitCode !== 0) {
			throw new Error(`generate_cookies.ts exited with code ${proc.exitCode}`);
		}
		console.log(`${STAGE.COOKIES} ${STAGE.OK} Refreshed successfully`);
	} catch (e) {
		console.error(`${STAGE.COOKIES} ${STAGE.FAIL} Refresh failed:`, e);
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

// ---- Fetch helpers ----

const SCRAPE_URL = "https://revocentral.revofitness.com.au/portal/club-counter.php";
const NP_API = "https://revofitness.netpulse.com";

const loginAndFetchToken = async (): Promise<string | null> => {
	const email = process.env.SCRAPE_EMAIL;
	const password = process.env.SCRAPE_PASSWORD;
	if (!email || !password) return null;

	try {
		const loginRes = await fetch(`${NP_API}/np/exerciser/login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
				"User-Agent": "RevoFitness/4.3 (com.netpulse.revofitness; build:404; iOS 26.2.0) Alamofire/5.9.1",
				"X-NP-API-Version": "1.5",
				Accept: "application/json,text/plain",
			},
			body: `password=${encodeURIComponent(password)}&username=${encodeURIComponent(email)}`,
		});
		if (!loginRes.ok) return null;

		const jsessionId = loginRes.headers.get("set-cookie");
		if (!jsessionId) return null;
		const cookieMatch = jsessionId.match(/JSESSIONID=([^;]+)/);
		if (!cookieMatch) return null;

		const loginData: any = await loginRes.json();
		const uuid = loginData.uuid;
		if (!uuid) return null;

		const tokenRes = await fetch(`${NP_API}/np/micro-web-app/v1.0/exercisers/${uuid}/tokens/BMA`, {
			headers: {
				Cookie: `JSESSIONID=${cookieMatch[1]}`,
				"User-Agent": "RevoFitness/4.3 (com.netpulse.revofitness; build:404; iOS 26.2.0) Alamofire/5.9.1",
				"X-NP-API-Version": "1.5",
				Accept: "application/json,text/plain",
			},
		});
		if (!tokenRes.ok) return null;

		const tokenData: any = await tokenRes.json();
		return tokenData.accessToken || null;
	} catch {
		return null;
	}
};

const fetchClubCounterWithToken = async (token: string): Promise<{ $: cheerio.CheerioAPI; duration_ms: number } | { error: string; duration_ms: number }> => {
	const url = `${SCRAPE_URL}?token=${token}`;
	const startTime = Date.now();

	try {
		const response = await axiosGetWithProxyFallback<string>("Parser", url, {
			headers: {
				accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"user-agent":
					"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
			},
			timeout: 15000,
		});
		const duration_ms = Date.now() - startTime;
		return { $: cheerio.load(response.data), duration_ms };
	} catch (e: any) {
		const duration_ms = Date.now() - startTime;
		return { error: e.message, duration_ms };
	}
};

const fetchPHPDataWithCookie = async (
	cookie: string,
	cookieIndex: number,
	retries = 2
): Promise<{ $: cheerio.CheerioAPI; duration_ms: number } | { error: string; duration_ms: number }> => {
	const url = `${SCRAPE_URL}?id=10`;
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
			timeout: 15000,
		});
		const duration_ms = Date.now() - startTime;
		return { $: cheerio.load(response.data), duration_ms };
	} catch (e: any) {
		const duration_ms = Date.now() - startTime;
		return { error: e.message, duration_ms };
	}
};

// ---- Main scrape logic ----

const fetchPHPData = async (): Promise<{
	$: cheerio.CheerioAPI;
	clubCounts: { name: string; count: number }[];
	session: ScrapeSession;
} | null> => {
	const sessionStart = Date.now();

	const useLogin = process.env.SCRAPE_EMAIL && process.env.SCRAPE_PASSWORD;
	const useToken = process.env.SCRAPE_TOKEN;

	if (useLogin || useToken) {
		let token: string | null = null;

		if (useLogin) {
			console.log(`${STAGE.FETCH} Logging in with SCRAPE_EMAIL...`);
			token = await loginAndFetchToken();
			if (token) {
				console.log(`${STAGE.FETCH} ${STAGE.OK} Token obtained from login`);
			} else if (useToken) {
				console.log(`${STAGE.FETCH} ${STAGE.WARN} Login failed — using SCRAPE_TOKEN`);
				token = useToken;
			}
		} else {
			token = useToken;
		}

		if (token) {
			const result = await fetchClubCounterWithToken(token);
			if (!("error" in result)) {
				const clubCounts = extractClubCounts(result.$);
				if (clubCounts.length > 0) {
					currentSession = {
						startedAt: nowIso(),
						cookiesAvailable: 0,
						cookieAttempts: [],
						totalGymsFound: clubCounts.length,
						missingGyms: 0,
						totalKnownGyms: 0,
						dbInserts: 0,
						dbUpdates: 0,
						duration_ms: 0,
					};
					return { $: result.$, clubCounts, session: currentSession };
				}
			}
		}
		console.log(`${STAGE.FETCH} ${STAGE.WARN} Token auth failed — falling back to cookies`);
	}

	await checkAndRefreshCookies();
	const cookiesContent = await file("Scraper/cookies.json").text();
	const cookies = JSON.parse(cookiesContent);

	if (cookies.length === 0) {
		console.error(`${STAGE.FETCH} ${STAGE.FAIL} No cookies found in cookies.json`);
		return null;
	}

	currentSession = {
		startedAt: nowIso(),
		cookiesAvailable: cookies.length,
		cookieAttempts: [],
		totalGymsFound: 0,
		missingGyms: 0,
		totalKnownGyms: 0,
		dbInserts: 0,
		dbUpdates: 0,
		duration_ms: 0,
	};

	console.log(`${STAGE.FETCH} Starting scrape session — ${cookies.length} cookies available`);
	console.log(`${STAGE.FETCH} ─── Cookie Attempt Log ───────────────────────────`);

	for (let i = 0; i < cookies.length; i++) {
		const cookie = cookies[i];
		const cookieLabel = cookieToReadable(cookie);
		const proxyLabel = process.env.DOMAIN_NAME ?? "direct";

		process.stdout.write(`${STAGE.FETCH} [${i + 1}/${cookies.length}] ${cookieLabel} ... `);

		const result = await fetchPHPDataWithCookie(cookie, i);
		const attempt: CookieAttempt = {
			index: i,
			label: cookieLabel,
			proxy: proxyLabel,
			duration_ms: result.duration_ms,
			gymsFound: 0,
			status: "network_error",
		};

		if ("error" in result) {
			process.stdout.write(`${STAGE.FAIL} network error (${result.duration_ms}ms)\n`);
			process.stdout.write(`       └─ ${result.error}\n`);
			attempt.error = result.error;
			if (currentSession) currentSession.cookieAttempts.push(attempt);
			continue;
		}

		const clubCounts = extractClubCounts(result.$);
		attempt.duration_ms = result.duration_ms;

		if (clubCounts.length === 0) {
			process.stdout.write(`${STAGE.WARN} 0 gyms returned (${result.duration_ms}ms)\n`);
			process.stdout.write(`       └─ cookie invalid or blocked\n`);
			attempt.status = "zero_gyms";
			attempt.gymsFound = 0;
			if (currentSession) currentSession.cookieAttempts.push(attempt);
			continue;
		}

		process.stdout.write(`${STAGE.OK} ${clubCounts.length} gyms (${result.duration_ms}ms)\n`);
		attempt.status = "valid";
		attempt.gymsFound = clubCounts.length;

		if (currentSession) {
			currentSession.cookieAttempts.push(attempt);
			currentSession.workingCookieIndex = i;
			currentSession.totalGymsFound = clubCounts.length;
		}

		console.log(`${STAGE.FETCH} ──────────────────────────────────────────────────`);
		return { $: result.$, clubCounts, session: currentSession! };
	}

	console.log(`${STAGE.FETCH} ──────────────────────────────────────────────────`);
	console.error(`${STAGE.FETCH} ${STAGE.FAIL} All ${cookies.length} cookies exhausted — no valid response`);
	alertAllCookiesFailed(cookies);

	// Print summary of all attempts
	console.log(`${STAGE.FETCH} Attempt summary:`);
	if (currentSession) {
		for (const a of currentSession.cookieAttempts) {
			const icon = a.status === "valid" ? STAGE.OK : a.status === "zero_gyms" ? STAGE.WARN : STAGE.FAIL;
			console.log(`       ${icon} [#${a.index + 1}] ${a.label} | ${a.duration_ms}ms | gyms=${a.gymsFound} | ${a.error ?? ""}`);
		}
	}

	return null;
};

// ---- Parsing helpers ----

const normalizeGymName = (name: string) => {
	return name
		.normalize("NFKD")
		.replace(/['']/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
};

type PbGym = {
	id: string;
	name: string;
	state: string;
	area_size: number;
	address: string;
	postcode: number;
	active: boolean;
	timezone: string;
	longitude?: number;
	latitude?: number;
	Squat_Racks?: number;
};

const getGymMetadataScore = (gym: PbGym) => {
	let score = 0;
	if (gym.active) score += 100;
	if ((gym.postcode ?? 0) > 0) score += 10;
	if ((gym.area_size ?? 0) > 0) score += 10;
	if (gym.address && gym.address !== "Pending Update") score += 10;
	return score;
};

const buildGymsByNormalizedName = (gyms: PbGym[]) => {
	const gymsByNormalizedName = new Map<string, PbGym>();
	for (const gym of gyms) {
		const normalizedName = normalizeGymName(gym.name);
		const existingGym = gymsByNormalizedName.get(normalizedName);
		if (!existingGym || getGymMetadataScore(gym) > getGymMetadataScore(existingGym)) {
			gymsByNormalizedName.set(normalizedName, gym);
		}
	}
	return gymsByNormalizedName;
};

const calculateGymRatios = (size: number, count: number) => {
	if (size <= 0 || count <= 0) return { memberRatio: 0, percentage: 0 };
	const memberRatio = size / count;
	const estimatedCapacity = size / 10;
	const percentage = Math.min((count / estimatedCapacity) * 100, 100);
	return { memberRatio, percentage };
};

// ---- MySQL dual-write helpers ----

const insertGymStatsSql = async (
	gymData: GymInfo[],
	currentTime: string,
	gymList: PbGym[],
	missingGyms: PbGym[]
) => {
	if (!sqlDb) return;

	try {
		const sqlTime = toSqlDate(new Date(currentTime));
		const gymsByNormalizedName = buildGymsByNormalizedName(gymList);
		const rows = [];

		for (const gym of gymData) {
			const existingGym = gymsByNormalizedName.get(normalizeGymName(gym.name));
			const canonicalName = existingGym?.name ?? gym.name;
			const canonicalPostcode = existingGym?.postcode || gym.postcode;
			const canonicalSize = existingGym?.area_size || gym.size;
			const count = gym.member_count > 0 ? gym.member_count : 0;
			const { memberRatio, percentage } = calculateGymRatios(canonicalSize, count);
			rows.push({
				id: crypto.randomUUID(),
				created: sqlTime,
				count,
				ratio: memberRatio,
				gymName: canonicalName,
				percentage,
				gymId: existingGym?.id ?? simpleIntegerHash(canonicalName + canonicalPostcode.toString()).toString(),
			});
		}

		for (const gym of missingGyms) {
			rows.push({
				id: crypto.randomUUID(),
				created: sqlTime,
				count: 0,
				ratio: 0,
				gymName: gym.name,
				percentage: 0,
				gymId: gym.id,
			});
		}

		if (rows.length > 0) {
			await sqlDb.insert(revoGymCount).values(rows);
		}
	} catch (err) {
		console.error(`${STAGE.DB} ${STAGE.FAIL} MySQL gym stats write failed:`, err);
	}
};

const updateGymInfoSql = async (gymData: GymInfo[], currentTime: string, gymList: PbGym[]) => {
	if (!sqlDb) return;

	try {
		const sqlTime = toSqlDate(new Date(currentTime));
		const gymsByNormalizedName = buildGymsByNormalizedName(gymList);

		for (const gym of gymData) {
			const existingGym = gymsByNormalizedName.get(normalizeGymName(gym.name));
			const postcode = gym.postcode || existingGym?.postcode || 0;
			const gymId = existingGym?.id ?? simpleIntegerHash((existingGym?.name ?? gym.name) + postcode.toString()).toString();
			const info = {
				id: gymId,
				name: existingGym?.name ?? gym.name,
				address: gym.address !== "Pending Update" ? gym.address : (existingGym?.address ?? gym.address),
				postcode,
				state: gym.state !== "Unknown" ? gym.state : (existingGym?.state ?? gym.state),
				areaSize: gym.size || existingGym?.area_size || 0,
				lastUpdated: sqlTime,
				active: 1,
				timezone: existingGym?.timezone ?? "Australia/Perth",
				longitude: existingGym?.longitude ?? 0,
				latitude: existingGym?.latitude ?? 0,
				squatRacks: gym.squat_racks ?? existingGym?.Squat_Racks ?? 0,
			};

			await sqlDb
				.insert(revoGyms)
				.values(info)
				.onDuplicateKeyUpdate({
					set: {
						name: info.name,
						address: info.address,
						postcode: info.postcode,
						state: info.state,
						areaSize: info.areaSize,
						lastUpdated: info.lastUpdated,
						active: info.active,
						timezone: info.timezone,
						longitude: info.longitude,
						latitude: info.latitude,
						squatRacks: info.squatRacks,
					},
				});
		}
	} catch (err) {
		console.error(`${STAGE.DB} ${STAGE.FAIL} MySQL gym info write failed:`, err);
	}
};

const extractClubCounts = ($: cheerio.CheerioAPI) => {
	const scripts = $("script").map((_, el) => $(el).html() || "").get();

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
		} catch {
			console.warn(`${STAGE.PARSE} ${STAGE.WARN} clubCounterLists JSON parse failed, falling back to DOM`);
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

// ---- Public API ----

export const parseHTML = async (): Promise<GymInfo[]> => {
	const parseStart = Date.now();
	console.log(`\n${STAGE.PARSE} ═══════════════════════════════════════════════════`);
	console.log(`${STAGE.PARSE} PHASE 1: Fetch & Parse`);

	const result = await fetchPHPData();
	if (result == null) {
		console.error(`${STAGE.PARSE} ${STAGE.FAIL} Scrape failed — all cookies exhausted\n`);
		return [];
	}

	const { $, clubCounts } = result;
	const parseDuration = Date.now() - parseStart;

	await ensureAdminAuth();
	const existingGyms = await pb.collection("Revo_Gyms").getFullList<PbGym>({
		filter: "active=true",
		batch: 200,
	});
	const gymsByNormalizedName = buildGymsByNormalizedName(existingGyms);
	const gymData: GymInfo[] = [];

	for (const club of clubCounts) {
		const scrapedName = club.name;
		const memberCount = club.count;
		const metadata = gymsByNormalizedName.get(normalizeGymName(scrapedName));

		if (metadata) {
			const size = metadata.area_size || 0;
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

	// Log sample gyms
	const sampleGyms = gymData.slice(0, 3).map((g) => `${g.name} (${g.member_count})`).join(", ");
	console.log(`${STAGE.PARSE} Parsed ${gymData.length} gyms in ${parseDuration}ms`);
	console.log(`${STAGE.PARSE} Samples: [${sampleGyms}${gymData.length > 3 ? ", ..." : ""}]`);
	console.log(`${STAGE.PARSE} ═══════════════════════════════════════════════════\n`);

	return gymData;
};

export const insertGymStats = async (gymData: GymInfo[]) => {
	const dbStart = Date.now();
	console.log(`${STAGE.DB} ═══════════════════════════════════════════════════`);
	console.log(`${STAGE.DB} PHASE 2: Database Write`);

	const currentTime = toPbDate(new Date());
	await ensureAdminAuth();
	const gymList = await pb.collection("Revo_Gyms").getFullList<PbGym>({
		filter: "active=true",
		batch: 200,
	});
	const gymsByNormalizedName = buildGymsByNormalizedName(gymList);

	let inserts = 0;
	for (const gym of gymData) {
		const existingGym = gymsByNormalizedName.get(normalizeGymName(gym.name));
		const canonicalName = existingGym?.name ?? gym.name;
		const canonicalPostcode = existingGym?.postcode || gym.postcode;
		const canonicalSize = existingGym?.area_size || gym.size;
		const count = gym.member_count > 0 ? gym.member_count : 0;
		const { memberRatio, percentage } = calculateGymRatios(canonicalSize, count);
		const gymId = existingGym?.id ?? simpleIntegerHash(canonicalName + canonicalPostcode.toString()).toString();
		await pb.collection("Revo_Gym_Count").create({
			created: currentTime,
			count,
			ratio: memberRatio,
			gym_name: canonicalName,
			percentage,
			gym_id: gymId,
			...(existingGym?.id ? { gym_id_rel: existingGym.id } : {}),
		});
		inserts++;
	}

	const scrapedGymNames = new Set(gymData.map((g) => normalizeGymName(g.name)));
	const missingGyms = gymList.filter((g) => !scrapedGymNames.has(normalizeGymName(g.name)));

	if (missingGyms.length > 0) {
		console.log(`${STAGE.DB} ${STAGE.WARN} ${missingGyms.length} known gyms missing from scrape:`);
		for (const gym of missingGyms) {
			console.log(`${STAGE.DB}       - ${gym.name} (${gym.postcode})`);
			await pb.collection("Revo_Gym_Count").create({
				created: currentTime,
				count: 0,
				ratio: 0,
				gym_name: gym.name,
				percentage: 0,
				gym_id: gym.id,
				gym_id_rel: gym.id,
			});
			inserts++;
		}
	}

	await insertGymStatsSql(gymData, currentTime, gymList, missingGyms);

	// Persist session log
	const logPath = "logs/updated_stats.json";
	let logs: any[] = [];
	try {
		const logContent = await file(logPath).text();
		logs = JSON.parse(logContent);
	} catch {}

	const fullData = [
		...gymData,
		...missingGyms.map((g) => ({
			name: g.name,
			address: g.address || "Pending Update",
			postcode: g.postcode || 0,
			size: g.area_size || 0,
			state: g.state || "Unknown",
			member_count: 0,
			member_ratio: 0,
			percentage: 0,
		})),
	];

	const sessionEntry = {
		timestamp: currentTime,
		gymCount: gymData.length,
		missingGyms: missingGyms.length,
		totalKnownGyms: gymList.length,
		data: fullData,
	};

	logs.unshift(sessionEntry);
	await Bun.write(logPath, JSON.stringify(logs.slice(0, 5), null, 2));

	const dbDuration = Date.now() - dbStart;
	console.log(`${STAGE.DB} ${STAGE.OK} ${inserts} rows inserted (${dbDuration}ms)`);
	console.log(`${STAGE.DB}       gyms=${gymData.length} | missing=${missingGyms.length} | total=${gymList.length}`);
	console.log(`${STAGE.DB} ═══════════════════════════════════════════════════\n`);
};

export const updateGymInfo = async (gymData: GymInfo[]) => {
	const currentTime = toPbDate(new Date());
	await ensureAdminAuth();
	const gymList = await pb.collection("Revo_Gyms").getFullList<PbGym>({
		filter: "active=true",
		batch: 200,
	});
	const gymsByNormalizedName = buildGymsByNormalizedName(gymList);

	let updates = 0;
	for (const gym of gymData) {
		const existingGym = gymsByNormalizedName.get(normalizeGymName(gym.name));
		const postcode = gym.postcode || existingGym?.postcode || 0;
		const gymId = existingGym?.id ?? simpleIntegerHash((existingGym?.name ?? gym.name) + postcode.toString()).toString();
		const info = {
			id: gymId,
			name: existingGym?.name ?? gym.name,
			address: gym.address !== "Pending Update" ? gym.address : (existingGym?.address ?? gym.address),
			postcode,
			state: gym.state !== "Unknown" ? gym.state : (existingGym?.state ?? gym.state),
			area_size: gym.size || existingGym?.area_size || 0,
			last_updated: currentTime,
			active: true,
			timezone: existingGym?.timezone ?? "Australia/Perth",
			longitude: existingGym?.longitude ?? 0,
			latitude: existingGym?.latitude ?? 0,
			Squat_Racks: gym.squat_racks ?? existingGym?.Squat_Racks ?? 0,
		};

		try {
			await pb.collection("Revo_Gyms").update(gymId, info);
			updates++;
		} catch (err: any) {
			if (err?.status === 404) {
				try {
					await pb.collection("Revo_Gyms").create(info);
					updates++;
				} catch (createErr) {
					console.error(`${STAGE.DB} ${STAGE.FAIL} Failed to create gym ${info.name}:`, createErr);
				}
			} else {
				console.error(`${STAGE.DB} ${STAGE.FAIL} Failed to update gym ${info.name}:`, err);
			}
		}
	}

	await updateGymInfoSql(gymData, currentTime, gymList);

	console.log(`${STAGE.DB} ${STAGE.OK} Gym metadata updated: ${updates} rows`);
};
