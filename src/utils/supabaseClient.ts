import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/supabase";

// Initialize Supabase client only once and reuse it
const supabaseUrl = "https://database.daffydvck.live";
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseKey) {
	throw new Error(
		"Supabase key is undefined. Ensure the environment variables are set."
	);
}

// Correctly typed custom fetch function
const customFetch: typeof fetch = (url, options = {}) => {
	return fetch(url, { ...options, cache: "no-store" });
};

// Create the client once with the custom fetch
const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
	global: {
		fetch: customFetch,
	},
});

export const supabaseClient = () => {
	return supabase;
};
