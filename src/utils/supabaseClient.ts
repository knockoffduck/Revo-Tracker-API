import { createClient } from "@supabase/supabase-js";

export const supabaseClient = async () => {
	const supabaseUrl = "https://database.daffydvck.live";
	const supabaseKey = process.env.SUPABASE_KEY;
	if (supabaseKey == undefined)
		return console.error("Could not access Supabase: Key is Undefined");
	const supabase = createClient(supabaseUrl, supabaseKey);
	return supabase;
};
