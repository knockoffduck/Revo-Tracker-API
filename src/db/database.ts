import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";

export const sqlDb = process.env.DATABASE_URL
	? drizzle(process.env.DATABASE_URL)
	: null;
