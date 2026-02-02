import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as cheerio from "cheerio";
import { file } from "bun";

const getRotatedCookie = async () => {
	try {
		const cookiesContent = await file("Scraper/cookies.json").text();
		const cookies = JSON.parse(cookiesContent);
		const randomIndex = Math.floor(Math.random() * cookies.length);
		return cookies[randomIndex];
	} catch (e) {
		console.error("Error reading cookies.json:", e);
		return "";
	}
};

const getProxyList = async () => {
	try {
		const proxiesContent = await file("Scraper/proxies.json").text();
		return JSON.parse(proxiesContent);
	} catch (e) {
		console.log("❌ Error reading Scraper/proxies.json. Please create it with your WebShare proxies.");
		return [];
	}
};

const testSingleProxy = async (proxyStr: string, cookie: string) => {
	const parts = proxyStr.split(":");
	if (parts.length < 2) {
		console.log(`❌ Invalid proxy format. Expected host:port or host:port:user:pass`);
		return false;
	}

	let proxyUrl = "";
	if (parts.length >= 4) {
		proxyUrl = `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
	} else {
		proxyUrl = `http://${parts[0]}:${parts[1]}`;
	}

	const agent = new HttpsProxyAgent(proxyUrl);
	const url = "https://revocentral.revofitness.com.au/portal/club-counter.php?id=10";

	console.log(`\nTesting Proxy: ${parts[0]}:${parts[1]}${parts.length >= 4 ? " (With Auth)" : ""}...`);
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
			proxy: false,
			timeout: 10000,
		});

		const duration = Date.now() - startTime;
		const $ = cheerio.load(response.data);
		const gyms: any[] = [];

		$("a.club-shortname").each((i, el) => {
			const name = $(el).attr("data-club-name");
			const count = $(el).attr("data-member-in-club");
			if (name) gyms.push({ name, count });
		});

		if (gyms.length > 0) {
			console.log(`✅ SUCCESS (${duration}ms)`);
			console.log(`Extracted ${gyms.length} gyms.`);
			return true;
		} else {
			console.log(`⚠️  CONNECTED but found 0 gyms.`);
			return false;
		}
	} catch (e: any) {
		console.log(`❌ FAILED: ${e.message}`);
		return false;
	}
};

const runManualMode = async () => {
    const cookie = await getRotatedCookie();
    console.log("\n--- Manual Private Proxy Test Mode ---");
    console.log("Enter proxy as host:port:user:pass or host:port");
    
    while (true) {
        const input = prompt("Enter proxy:");
        if (!input || input.toLowerCase() === 'exit') break;
        
        await testSingleProxy(input.trim(), cookie);
        console.log("------------------------------");
    }
};

const runAutoMode = async () => {
	const proxies = await getProxyList();
	const cookie = await getRotatedCookie();

	if (proxies.length === 0) return;

	console.log(`Starting Private Proxy Test (${proxies.length} available)`);

	let successCount = 0;
	for (const proxy of proxies) {
		const success = await testSingleProxy(proxy, cookie);
		if (success) successCount++;
	}

	console.log(`\nFinal Result: ${successCount}/${proxies.length} proxies worked.`);
};

const isManual = process.argv.includes("--manual") || process.argv.includes("-m");

if (isManual) {
    runManualMode();
} else {
    runAutoMode();
}
