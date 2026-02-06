import axios from "axios";
import * as cheerio from "cheerio";
import { GymInfo } from "./types";

const getSlug = (name: string): string => {
	// Special case for OConnor -> oconnor (removing CamelCase/apostrophe implication issues if any, but based on gyms.json it is "OConnor")
	// The URL is usually lowercase with hyphens.
	// "Shenton Park" -> "shenton-park"
	// "OConnor" -> "oconnor"
    // "Karrinyup" -> "karrinyup"
    
	return name.toLowerCase().replace(/\s+/g, "-");
};

export const getSquatRacksCount = async (gymName: string): Promise<number | null> => {
	const slug = getSlug(gymName);
	const url = `https://revofitness.com.au/gyms/${slug}/`;

	try {
		const { data } = await axios.get(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "text/html",
			},
            timeout: 10000,
		});

		const $ = cheerio.load(data);

		// Strategy: Look for the text "Squat racks" in standard elements
        // The user's grep showed: <span class="px-3 font-bold text-white">6 Squat racks</span>
        
        let squatCount: number | null = null;

		$("span, div, p").each((_, el) => {
            if (squatCount !== null) return; // already found

			const text = $(el).text();
			if (text.toLowerCase().includes("squat racks")) {
				const match = text.match(/(\d+)\s*Squat\s*racks/i);
				if (match) {
					squatCount = parseInt(match[1], 10);
				}
			}
		});

		return squatCount;
	} catch (error) {
		console.warn(`[Details] Failed to fetch details for ${gymName} (${url}):`, error instanceof Error ? error.message : error);
		return null;
	}
};

export const enrichGymData = async (gyms: GymInfo[]): Promise<GymInfo[]> => {
	console.log(`[Details] Enriching ${gyms.length} gyms with squat rack data...`);
    
    // Process in batches to avoid flagging WAF too hard, although 40 isn't many.
    // Let's do it in chunks of 5.
    const enrichedGyms: GymInfo[] = [];
    const chunkSize = 5;
    
    for (let i = 0; i < gyms.length; i += chunkSize) {
        const chunk = gyms.slice(i, i + chunkSize);
        const promises = chunk.map(async (gym) => {
            const racks = await getSquatRacksCount(gym.name);
            if (racks !== null) {
                return { ...gym, squat_racks: racks };
            }
            return gym;
        });
        
        const results = await Promise.all(promises);
        enrichedGyms.push(...results);
        
        // Small delay between chunks
        if (i + chunkSize < gyms.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log(`[Details] Enrichment complete.`);
	return enrichedGyms;
};
