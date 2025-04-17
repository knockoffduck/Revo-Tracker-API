import {
	mysqlTable,
	mysqlSchema,
	AnyMySqlColumn,
	primaryKey,
	varchar,
	datetime,
	int,
	double,
	text,
	index,
	foreignKey,
	unique,
	boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const revoGymCount = mysqlTable(
	"Revo_Gym_Count",
	{
		id: varchar({ length: 36 }).notNull(),
		created: datetime({ mode: "string" }).notNull(),
		count: int().notNull(),
		ratio: double().notNull(),
		gymName: text("gym_name").notNull(),
		percentage: double(),
	},
	(table) => [primaryKey({ columns: [table.id], name: "Revo_Gym_Count_id" })]
);

export const revoGyms = mysqlTable(
	"Revo_Gyms",
	{
		id: varchar({ length: 36 }).notNull(),
		name: text().notNull(),
		state: text().notNull(),
		areaSize: int("area_size").notNull(),
		lastUpdated: datetime("last_updated").notNull(),
		address: text().notNull(),
		postcode: int().notNull(),
	},
	(table) => [primaryKey({ columns: [table.id], name: "Revo_Gyms_id" })]
);

export const biosLinks = mysqlTable(
	"bios_links",
	{
		id: varchar({ length: 36 }).notNull(),
		motherboardId: int("motherboard_id")
			.notNull()
			.references(() => motherboards.mid, { onDelete: "cascade" }),
		biosVersion: varchar("bios_version", { length: 100 }).notNull(),
		downloadUrl: varchar("download_url", { length: 1024 }).notNull(),
		releaseDate: varchar("release_date", { length: 12 }),
	},
	(table) => [
		index("idx_motherboard_id").on(table.motherboardId),
		primaryKey({ columns: [table.id], name: "bios_links_id" }),
		unique("uq_motherboard_version").on(table.motherboardId, table.id),
	]
);

export const categories = mysqlTable(
	"categories",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		href: varchar({ length: 255 }).notNull(),
		cid: int().notNull(),
		scrapeableSubcategories: boolean("scrapeable_subcategories").notNull(),
		scrapeableCategories: boolean("scrapeable_categories").notNull(),
		created: datetime({ mode: "string" }).notNull(),
		updated: datetime({ mode: "string" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.id], name: "categories_id" })]
);

export const itemSets = mysqlTable(
	"item_sets",
	{
		id: varchar({ length: 36 }).notNull(),
		dateFetched: varchar("date_fetched", { length: 255 }),
		status: varchar({ length: 255 }),
		created: datetime({ mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "item_sets_id" })]
);

export const items = mysqlTable(
	"items",
	{
		id: varchar({ length: 36 }).notNull(),
		pleCode: varchar("ple_code", { length: 255 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		rrp: double("RRP"),
		staffPrice: double("staff_price"),
		percentageDifference: double("percentage_difference"),
		costDifference: double("cost_difference"),
		msrp: double("MSRP"),
		percentageDifferenceMsrp: double("percentage_difference_MSRP"),
		costDifferenceMsrp: double("cost_difference_MSRP"),
		itemUrl: varchar("item_url", { length: 255 }),
		imgUrl: varchar("img_url", { length: 255 }),
		category: varchar({ length: 255 }),
		model: varchar({ length: 255 }),
		itemSet: varchar("item_set", { length: 36 }).references(() => itemSets.id, {
			onDelete: "cascade",
		}),
		created: datetime({ mode: "string" }),
	},
	(table) => [
		index("idx_item_set").on(table.itemSet),
		primaryKey({ columns: [table.id], name: "items_id" }),
	]
);

export const motherboards = mysqlTable(
	"motherboards",
	{
		id: varchar({ length: 36 }).notNull(),
		modelName: varchar("model_name", { length: 255 }).notNull(),
		productUrl: varchar("product_url", { length: 1024 }).notNull(),
		mid: int().notNull(),
		lastChecked: datetime("last_checked", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "motherboards_id" }),
		unique("model_name").on(table.modelName),
		unique("mid").on(table.mid),
	]
);

export const subcategories = mysqlTable(
	"subcategories",
	{
		id: varchar({ length: 36 }).notNull(),
		cid: int(),
		name: varchar({ length: 255 }),
		categories: varchar({ length: 15 }).references(() => categories.id),
		created: datetime({ mode: "string" }),
		updated: datetime({ mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "subcategories_id" })]
);
