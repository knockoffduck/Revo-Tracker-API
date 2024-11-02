import axios from "axios";
import * as cheerio from "cheerio";
import { supabaseClient } from "./supabaseClient";
import { SupabaseClient } from "@supabase/supabase-js";
import { Gym } from "./types";
import { file } from "bun";

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

	const gymData: Gym[] = [];

	$("div[data-counter-card]").each((i, element) => {
		const name = $(element).attr("data-counter-card"); // Extract the gym name from the attribute
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

		if (name && size && memberCount) {
			// Push the formatted object into the gymData array
			const memberAreaRatio = size / memberCount;

			gymData.push({
				name: name,
				size: size, // Remove extra whitespaces from the size
				member_count: memberCount,
				member_ratio: memberAreaRatio,
				percentage:
					(1 - (memberAreaRatio > 60 ? 60 : memberAreaRatio) / 60) * 100,
			});
		}
	});
	return gymData;
};

export const insertData = async (gymData: Gym[]) => {
	const supabase = supabaseClient();
	if (!(supabase instanceof SupabaseClient)) {
		console.error("Unable to access Supabase client");
		return;
	}
	const jsonFile = Bun.file("src/utils/gyms.json");
	const GYMS: { name: string; size: number }[] = await jsonFile.json();

	for (let i = 0; i < GYMS.length; i++) {
		const currentGym = GYMS[i];
		const exists = gymData.some((gym) => gym.name === currentGym.name);
		if (!exists) {
			console.log(`Gym ${currentGym.name} has 0 members`);
			gymData.push({
				name: currentGym.name,
				size: currentGym.size,
				member_count: 0,
				member_ratio: 0,
				percentage: 0,
			});
		}
	}
	const { data, error } = await supabase
		.from("Revo Member Stats")
		.insert(gymData)
		.select();
	if (error) {
		console.error(error);
		return 500;
	}
	return data;
};
