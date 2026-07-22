import { mysqlTable, primaryKey, varchar, datetime, int, double, text, tinyint, json, timestamp } from "drizzle-orm/mysql-core";

export const revoGyms = mysqlTable("Revo_Gyms", {
	id: varchar({ length: 36 }).notNull(),
	name: text().notNull(),
	state: text().notNull(),
	areaSize: int("area_size").notNull(),
	lastUpdated: datetime("last_updated", { mode: "string" }).notNull(),
	address: text().notNull(),
	postcode: int().notNull(),
	active: tinyint().notNull(),
	timezone: varchar({ length: 50 }).default("Australia/Perth").notNull(),
	longitude: double(),
	latitude: double(),
	squatRacks: tinyint("Squat Racks", { unsigned: true }).default(0).notNull(),
}, (table) => [
	primaryKey({ columns: [table.id], name: "Revo_Gyms_id" }),
]);

export const revoGymCount = mysqlTable("Revo_Gym_Count", {
	id: varchar({ length: 36 }).notNull(),
	created: datetime({ mode: "string" }).notNull(),
	count: int().notNull(),
	ratio: double().notNull(),
	gymName: varchar("gym_name", { length: 191 }).notNull(),
	percentage: double().notNull(),
	gymId: varchar("gym_id", { length: 36 }).notNull(),
}, (table) => [
	primaryKey({ columns: [table.id], name: "Revo_Gym_Count_id" }),
]);

export const gymTrendCache = mysqlTable("gym_trend_cache", {
	gymId: varchar("gym_id", { length: 36 }).notNull(),
	dayOfWeek: int("day_of_week").notNull(),
	trendData: json("trend_data").notNull(),
	updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().onUpdateNow(),
}, (table) => [
	primaryKey({ columns: [table.gymId, table.dayOfWeek], name: "gym_trend_cache_gym_id_day_of_week" }),
]);
