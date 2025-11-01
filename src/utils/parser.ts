import axios from "axios";
import * as cheerio from "cheerio";
import { GymInfo } from "./types";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./database";
import { simpleIntegerHash } from "./tools";

// ========== Utility Helpers ==========

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
    return 6164;
  }
  return 0;
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
  return "Unknown State";
};

const extractState = (address: string) => {
  const postcode = extractPostcode(address);
  if (postcode === 0) return "Unknown State";
  return getStateFromPostcode(postcode);
};

// ========== Scraper Functions ==========

const fetchHTML = async () => {
  try {
    const response = await axios.get(
      "https://revofitness.com.au/livemembercount/",
    );
    return cheerio.load(response.data);
  } catch (e) {
    console.error("Error fetching HTML:", e);
  }
};

export const parseHTML = async (): Promise<GymInfo[]> => {
  const $ = await fetchHTML();
  if (!$) {
    console.log("undefined HTML");
    return [];
  }

  const gymData: GymInfo[] = [];

  $("div[data-counter-card]").each((_, element) => {
    const name = $(element).attr("data-counter-card");
    const address = $(element).find("[data-address] > span.is-h6").text();

    if (!name || !address) return;

    const size = Number(
      $(element)
        .find("span.is-h6")
        .last()
        .text()
        .trim()
        .replace(/\s+/g, "")
        .replace(/sq\/m/g, ""),
    );

    const memberCount = Number(
      $(`span[data-live-count="${name}"]`).text().trim(),
    );

    if (name && size && memberCount && address) {
      const memberAreaRatio = size / memberCount;
      const state = extractState(address);

      gymData.push({
        name,
        address,
        postcode: extractPostcode(address),
        size,
        state,
        member_count: memberCount,
        member_ratio: memberAreaRatio,
        percentage:
          (1 - (memberAreaRatio > 60 ? 60 : memberAreaRatio) / 60) * 100,
      });
    }
  });
  return gymData;
};

// ========== Supabase Replacements ==========

export const insertGymStats = async (gymData: GymInfo[]) => {
  const currentTime = new Date().toISOString();

  // Get all gyms from Supabase
  const { data: gymList, error: gymListError } = await supabase
    .from("Revo_Gyms")
    .select("name, postcode");

  if (gymListError) {
    console.error("Error fetching gyms:", gymListError);
    return;
  }

  // Insert or update records for gyms in data
  for (const gym of gymData) {
    const gym_id = simpleIntegerHash(
      gym.name + gym.postcode.toString(),
    ).toString();

    const { error } = await supabase.from("Revo_Gym_Count").insert([
      {
        id: uuidv4(),
        created: currentTime,
        count: gym.member_count,
        ratio: gym.member_ratio,
        gym_name: gym.name,
        percentage: gym.percentage,
        gym_id,
      },
    ]);

    if (error) console.error(`Error inserting ${gym.name}:`, error);
  }

  // Identify missing gyms
  const missingGyms = (gymList || []).filter(
    (g: any) => !gymData.some((d) => d.name === g.name),
  );
  console.log("Missing gyms:", missingGyms);

  for (const gym of missingGyms) {
    const gym_id = simpleIntegerHash(
      gym.name + gym.postcode.toString(),
    ).toString();

    const { error } = await supabase.from("Revo_Gym_Count").insert([
      {
        id: uuidv4(),
        created: currentTime,
        count: 0,
        ratio: 0,
        gym_name: gym.name,
        percentage: 0,
        gym_id,
      },
    ]);

    if (error) console.error(`Error inserting missing gym ${gym.name}:`, error);
  }
};

export const updateGymInfo = async (gymData: GymInfo[]) => {
  const currentTime = new Date().toISOString();

  for (const gym of gymData) {
    const state = extractState(gym.address);
    const gym_id = simpleIntegerHash(
      gym.name + gym.postcode.toString(),
    ).toString();

    const info = {
      id: gym_id,
      name: gym.name,
      address: gym.address,
      postcode: gym.postcode,
      state,
      area_size: gym.size,
      last_updated: currentTime,
    };

    // Supabase supports `upsert`
    const { error } = await supabase.from("Revo_Gyms").upsert([info], {
      onConflict: "id",
    });

    if (error) {
      console.error(`Error upserting gym ${gym.name}:`, error);
    } else {
      console.log(`Gym ${gym.name} (${gym.postcode}) updated successfully`);
    }
  }
};
