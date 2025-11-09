import axios from "axios";
import * as cheerio from "cheerio";
import { GymInfo } from "./types";
import { file } from "bun";
import { db } from "./database";
import { revoGymCount, revoGyms } from "../db/schema";
import { simpleIntegerHash } from "./tools";
import { sql } from "drizzle-orm";
import { add, get } from "cheerio/dist/commonjs/api/traversing";
import { uuid } from "drizzle-orm/gel-core";
import { v4 as uuidv4 } from "uuid";

const options = {
	method: "GET",
	headers: {
		"x-rapidapi-key": "a012f7acdamsh063c385ef42f07fp1d04f0jsnd06f98967540", // Replace with your actual API key
		"x-rapidapi-host": "addressr.p.rapidapi.com",
	},
};

const extractPostcode = (address: string) => {
	const parts = address.replaceAll(",", "").split(" ");
	let index = parts.length - 1;

	while (index >= 0) {
		const part = parts[index];
		if (!isNaN(Number(part)) && part.length === 4) {
			return Number(part);
		}
		index--;
	}
	if (address.includes("Cockburn")) {
		return 6164; // Default postcode for Cockburn
	}
	return 0; // Default value if no postcode is found
};
const getStateFromPostcode = (postcode: number) => {
	if (postcode >= 2000 && postcode <= 2599) return "NSW";
	if (postcode >= 3000 && postcode <= 3999) return "VIC";
	if (postcode >= 4000 && postcode <= 4999) return "QLD";
	if (postcode >= 5000 && postcode <= 5799) return "SA";
	if (postcode >= 5800 && postcode <= 5999) return "NT";
	if (postcode >= 6000 && postcode <= 6999) return "WA";
	if (postcode >= 7000 && postcode <= 7999) return "TAS";
	if (postcode >= 8000 && postcode <= 8999) return "ACT";
	return "Unknown State"; // Default value if no state is found
};

const extractState = (address: string) => {
	// aus postcode to state
	let postcode = extractPostcode(address);
	if (postcode === 0) {
		return "Unknown State"; // Default value if no postcode is found
	}
	return getStateFromPostcode(postcode);
};

const fetchHTML = async () => {
	try {
		const response = await axios.get(
			"https://revofitness.com.au/livemembercount/"
		);
		// Load the HTML into cheerio
		const $ = cheerio.load(response.data);
		return $;
	} catch (e) {
		console.log(e);
	}
};

export const parseHTML = async () => {
	const $ = await fetchHTML();

	if ($ == undefined) return console.log("undefined HTML");

	const gymData: GymInfo[] = [];

	$("div[data-counter-card]").map(async (i, element) => {
		const name = $(element).attr("data-counter-card"); // Extract the gym name from the attribute
		const address = $(element).find("[data-address] > span.is-h6").text(); // Extract the address from the attribute
		if (!name || !address) return; // Skip if name or address is not found
		const size = Number(
			$(element)
				.find("span.is-h6")
				.last()
				.text()
				.trim()
				.replace(/\s+/g, "")
				.replace(/sq\/m/g, "")
		); // Extract and clean size

		// Find the corresponding member count in 'span[data-live-count]'
		const memberCount = Number(
			$(`span[data-live-count="${name}"]`).text().trim()
		); // Match gym with live member count

		if (name && size && memberCount && address) {
			// Push the formatted object into the gymData array
			const memberAreaRatio = size / memberCount;

			const state = extractState(address); // Extract state from address

			gymData.push({
				name: name,
				address: address,
				postcode: extractPostcode(address), // Extract postcode from address
				size: size, // Remove extra whitespaces from the size
				state: state, // Extract state from address
				member_count: memberCount,
				member_ratio: memberAreaRatio,
				percentage:
					(1 - (memberAreaRatio > 60 ? 60 : memberAreaRatio) / 60) * 100,
			});
		}
	});
	return gymData;
};

export const insertGymStats = async (gymData: GymInfo[]) => {
	const currentTime = new Date();
	const gymList = await db
		.select({ name: revoGyms.name, postcode: revoGyms.postcode })
		.from(revoGyms);
	let missingGyms: { name: string; postcode: number }[];

	gymData.map(async (gym) => {
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
		return;
	});
	missingGyms = gymList.filter((gym) => {
		return !gymData.some((g) => g.name === gym.name);
	});
	console.log("Missing gyms:", missingGyms);
	missingGyms.map(async (gym) => {
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
		return;
	});
};

export const updateGymInfo = async (gymData: GymInfo[]) => {
	const currentTime = new Date();
	gymData.map(async (gym) => {
		const state = extractState(gym.address);

		console.log(
			"Gym name:",
			gym.name,
			"State:",
			state,
			"Postcode:",
			gym.postcode
		);
		const info = {
			id: simpleIntegerHash(gym.name + gym.postcode.toString()).toString(),
			name: gym.name,
			address: gym.address,
			postcode: gym.postcode,
			state: extractState(gym.address),
			areaSize: gym.size,
			lastUpdated: currentTime,
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
		console.log(
			`Gym ${gym.name} with postcode ${gym.postcode} updated successfully`
		);
	});

	return;
};
