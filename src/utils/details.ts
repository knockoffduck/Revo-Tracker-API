import * as cheerio from "cheerio";
import { GymInfo } from "./types";
import { axiosGetWithProxyFallback } from "./proxy";

const getSlug = (name: string): string => {
	// Special case for OConnor -> oconnor (removing CamelCase/apostrophe implication issues if any, but based on gyms.json it is "OConnor")
	// The URL is usually lowercase with hyphens.
	// "Shenton Park" -> "shenton-park"
	// "OConnor" -> "oconnor"
    // "Karrinyup" -> "karrinyup"

	return name.toLowerCase().replace(/\s+/g, "-");
};

const STATE_REGEX = /\b(WA|NSW|VIC|SA|QLD|TAS|ACT|NT)\b/;
const POSTCODE_REGEX = /\b(\d{4})\b/;
const STREET_KEYWORD_REGEX = /\b(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Highway|Hwy|Boulevard|Blvd|Square|Plaza|Way|Lane|Place|Terrace|Tce|Parkway|Pde)\b/i;
const SIZE_REGEX = /(\d[\d,]*)\s*(?:square\s*met(?:er|re)s?|sq\s*\/?\s*m)/i;
const SQUAT_RACKS_REGEX = /(\d+)\s*Squat\s*racks/i;

export type GymDetails = {
	squatRacks: number | null;
	address: string | null;
	postcode: number | null;
	state: string | null;
	areaSize: number | null;
};

const extractAddress = ($: cheerio.CheerioAPI): { address: string; postcode: number; state: string | null } | null => {
	let best: { address: string; postcode: number; state: string | null; score: number } | null = null;

	$("p, li, span, div").each((_, el) => {
		const text = $(el).text().replace(/\s+/g, " ").trim();
		if (text.length < 10 || text.length > 250) return;
		if (!POSTCODE_REGEX.test(text)) return;
		if (!STREET_KEYWORD_REGEX.test(text)) return;

		// Avoid addresses that look like CSS/JS classes, emails, or area-size boilerplate
		if (text.includes("{") || text.includes(";") || text.includes("function")) return;
		if (/\S+@\S+\.\S+/.test(text)) return;
		if (/\bsq\s*\/\s*m\b/i.test(text) || /\bsqm\b/i.test(text)) return;

		// Use the last 4-digit number as the postcode — it's almost always at the end of an address
		const allPostcodes = text.match(/\b\d{4}\b/g) || [];
		const postcodeStr = allPostcodes[allPostcodes.length - 1];
		const postcode = parseInt(postcodeStr, 10);
		if (postcode < 200 || postcode > 9999) return;

		const stateMatch = text.match(STATE_REGEX);
		const state = stateMatch ? stateMatch[1] : null;

		// Prefer candidates that include a state code, a leading street number, and a trailing postcode
		let score = 0;
		if (state) score += 2;
		if (/^\s*\d+\s+[A-Z]/.test(text)) score += 2;
		if (/,\s*[A-Z][a-z]+/.test(text)) score += 1;
		if (text.split(",").length >= 2) score += 1;
		// Bonus when the postcode sits at the very end of the string
		if (new RegExp(`\\b${postcodeStr}\\s*${state ? "?(?:\\s*\\b(?:WA|NSW|VIC|SA|QLD|TAS|ACT|NT)\\b)?" : ""}\\s*\\.?\\s*$`).test(text)) {
			score += 3;
		}

		if (!best || score > best.score) {
			best = { address: text, postcode, state, score };
		}
	});

	return best ? { address: best.address, postcode: best.postcode, state: best.state } : null;
};

export const getGymDetails = async (gymName: string): Promise<GymDetails> => {
	const slug = getSlug(gymName);
	const url = `https://revofitness.com.au/gyms/${slug}/`;

	const result: GymDetails = {
		squatRacks: null,
		address: null,
		postcode: null,
		state: null,
		areaSize: null,
	};

	try {
		const { data } = await axiosGetWithProxyFallback<string>("Details", url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "text/html",
			},
			timeout: 10000,
		});

		const $ = cheerio.load(data);

		$("span, div, p").each((_, el) => {
			if (result.squatRacks !== null) return;
			const text = $(el).text();
			if (text.toLowerCase().includes("squat racks")) {
				const match = text.match(SQUAT_RACKS_REGEX);
				if (match) result.squatRacks = parseInt(match[1], 10);
			}
		});

		$("span, div, p").each((_, el) => {
			if (result.areaSize !== null) return;
			const text = $(el).text();
			const match = text.match(SIZE_REGEX);
			if (match) {
				const size = parseInt(match[1].replace(/,/g, ""), 10);
				if (Number.isFinite(size) && size > 0) result.areaSize = size;
			}
		});

		const addressInfo = extractAddress($);
		if (addressInfo) {
			result.address = addressInfo.address;
			result.postcode = addressInfo.postcode;
			result.state = addressInfo.state;
		}

		return result;
	} catch (error) {
		console.warn(`[Details] Failed: ${gymName} — ${error instanceof Error ? error.message : error}`);
		return result;
	}
};

export const getSquatRacksCount = async (gymName: string): Promise<number | null> => {
	const details = await getGymDetails(gymName);
	return details.squatRacks;
};

export const enrichGymData = async (gyms: GymInfo[]): Promise<GymInfo[]> => {
	console.log(`[Details] Enriching ${gyms.length} gyms with detail page data...`);

	const enrichedGyms: GymInfo[] = [];
	const chunkSize = 5;

	for (let i = 0; i < gyms.length; i += chunkSize) {
		const chunk = gyms.slice(i, i + chunkSize);
		const promises = chunk.map(async (gym) => {
			const details = await getGymDetails(gym.name);
			const enriched: GymInfo = { ...gym };
			const parts: string[] = [];

			if (details.squatRacks !== null) {
				enriched.squat_racks = details.squatRacks;
				parts.push(`${details.squatRacks} squat racks`);
			}
			if (details.areaSize !== null) {
				enriched.size = details.areaSize;
				parts.push(`${details.areaSize} m²`);
			}
			if (details.address !== null) {
				enriched.address = details.address;
				parts.push(details.address);
			}
			if (details.postcode !== null) {
				enriched.postcode = details.postcode;
			}
			if (details.state !== null) {
				enriched.state = details.state;
			}

			if (parts.length > 0) {
				console.log(`[Details]   ✔ ${gym.name}: ${parts.join(" | ")}`);
			} else {
				console.log(`[Details]   ⚠ ${gym.name}: no details extracted`);
			}

			return enriched;
		});

		const results = await Promise.all(promises);
		enrichedGyms.push(...results);

		if (i + chunkSize < gyms.length) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	console.log(`[Details] Enrichment complete.`);
	return enrichedGyms;
};
