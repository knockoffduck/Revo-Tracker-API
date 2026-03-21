import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { file } from "bun";

const COOKIE_TEST_URL = "https://revocentral.revofitness.com.au/portal/club-counter.php?id=10";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15";

const isInsecureTlsEnabled = () => {
	const flag = process.env.PROXY_INSECURE_TLS;
	if (!flag) return false;
	return flag === "1" || flag.toLowerCase() === "true";
};

const getProxyList = async (): Promise<string[]> => {
	try {
		const content = await file("Scraper/proxies.json").text();
		return JSON.parse(content);
	} catch {
		console.error("[TestCookies] Error reading Scraper/proxies.json");
		return [];
	}
};

const getCookieList = async (): Promise<string[]> => {
	try {
		const content = await file("Scraper/cookies.json").text();
		return JSON.parse(content);
	} catch {
		console.error("[TestCookies] Error reading Scraper/cookies.json");
		return [];
	}
};

const buildProxyUrl = (proxyStr: string): string => {
	const parts = proxyStr.split(":");
	if (parts.length >= 4) {
		return `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
	}
	return `http://${parts[0]}:${parts[1]}`;
};

const testCookieWithProxy = async (cookie: string, proxyStr: string): Promise<{ ok: boolean; duration: number; gymsFound: number; error?: string }> => {
	const proxyUrl = buildProxyUrl(proxyStr);
	const agent = new HttpsProxyAgent(proxyUrl);

	const startTime = Date.now();
	try {
		const response = await axios.get(COOKIE_TEST_URL, {
			headers: {
				accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				cookie,
				referer: "https://revocentral.revofitness.com.au/portal/rewards/",
				"user-agent": USER_AGENT,
			},
			httpsAgent: agent,
			proxy: false,
			timeout: 15000,
		});

		const duration = Date.now() - startTime;

		// Parse gym count from response
		const matches = response.data.match(/data-member-in-club="(\d+)"/g);
		const gymsFound = matches ? matches.length : 0;

		return { ok: true, duration, gymsFound };
	} catch (e: any) {
		const duration = Date.now() - startTime;
		return { ok: false, duration, gymsFound: 0, error: e.message };
	}
};

const printResult = (cookieIndex: number, result: { ok: boolean; duration: number; gymsFound: number; error?: string }) => {
	const mark = result.ok ? "✅" : "❌";
	const gymInfo = result.ok ? `${result.gymsFound} gyms` : result.error;
	console.log(`  [${mark}] Cookie #${cookieIndex + 1} — ${result.duration}ms — ${gymInfo}`);
};

const main = async () => {
	console.log("=== Cookie Validator ===\n");

	const cookies = await getCookieList();
	const proxies = await getProxyList();

	if (cookies.length === 0) {
		console.error("[TestCookies] No cookies found in Scraper/cookies.json");
		process.exit(1);
	}

	if (proxies.length === 0) {
		console.error("[TestCookies] No proxies found in Scraper/proxies.json");
		process.exit(1);
	}

	console.log(`Found ${cookies.length} cookies, ${proxies.length} proxies\n`);

	// Cycle through cookies, each tested with a different proxy to spread load
	const results: { cookieIndex: number; result: { ok: boolean; duration: number; gymsFound: number; error?: string }; proxy: string }[] = [];

	for (let i = 0; i < cookies.length; i++) {
		// Round-robin proxy assignment
		const proxy = proxies[i % proxies.length];
		process.stdout.write(`Testing cookie #${i + 1}/${cookies.length} via ${proxy.split(":")[0]}... `);
		const result = await testCookieWithProxy(cookies[i], proxy);
		printResult(i, result);
		results.push({ cookieIndex: i, result, proxy });

		// Small delay between requests to avoid hammering
		await new Promise((r) => setTimeout(r, 500));
	}

	console.log("\n=== Summary ===");
	const ok = results.filter((r) => r.result.ok);
	const fail = results.filter((r) => !r.result.ok);

	console.log(`Total:  ${results.length}`);
	console.log(`Valid:  ${ok.length} ${ok.length > 0 ? `(${ok.map((r) => `#${r.cookieIndex + 1}`).join(", ")})` : ""}`);
	console.log(`Invalid: ${fail.length} ${fail.length > 0 ? `(${fail.map((r) => `#${r.cookieIndex + 1}`).join(", ")})` : ""}`);

	if (fail.length > 0) {
		console.log("\nRun `bun run Scraper/generate_cookies.ts` to regenerate invalid cookies.");
	}

	process.exit(fail.length > 0 ? 1 : 0);
};

main();
