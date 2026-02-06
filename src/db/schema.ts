import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, foreignKey, primaryKey, varchar, datetime, int, double, text, tinyint, timestamp, unique, longtext, mysqlEnum, json } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const revoGymCount = mysqlTable("Revo_Gym_Count", {
	id: varchar({ length: 36 }).notNull(),
	created: datetime({ mode: 'string'}).notNull(),
	count: int().notNull(),
	ratio: double().notNull(),
	gymName: varchar("gym_name", { length: 191 }).notNull(),
	percentage: double().notNull(),
	gymId: varchar("gym_id", { length: 36 }).notNull().references(() => revoGyms.id),
},
(table) => [
	index("idx_revo_gym_count_created").on(table.created),
	index("idx_revogym_gym_created").on(table.gymName, table.created),
	index("idx_revogym_gym_created_desc").on(table.gymName, table.created),
	primaryKey({ columns: [table.id], name: "Revo_Gym_Count_id"}),
]);

export const revoGyms = mysqlTable("Revo_Gyms", {
	id: varchar({ length: 36 }).notNull(),
	name: text().notNull(),
	state: text().notNull(),
	areaSize: int("area_size").notNull(),
	lastUpdated: datetime("last_updated", { mode: 'string'}).notNull(),
	address: text().notNull(),
	postcode: int().notNull(),
	active: tinyint().notNull(),
	timezone: varchar({ length: 50 }).default('Australia/Perth').notNull(),
	longitude: double(),
	latitude: double(),
	squatRacks: tinyint("Squat Racks", { unsigned: true }).default(0).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "Revo_Gyms_id"}),
]);

export const account = mysqlTable("account", {
	id: varchar({ length: 36 }).notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" } ),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "account_id"}),
]);

export const announcements = mysqlTable("announcements", {
	id: int().autoincrement().notNull(),
	title: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	summary: text(),
	content: longtext().notNull(),
	category: mysqlEnum(['feature','fix','update','event']).default('update'),
	status: mysqlEnum(['draft','published','archived']).default('draft'),
	authorId: int("author_id"),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "announcements_id"}),
	unique("slug").on(table.slug),
]);

export const biosLinks = mysqlTable("bios_links", {
	id: varchar({ length: 36 }).notNull(),
	motherboardId: int("motherboard_id").notNull().references(() => motherboards.mid, { onDelete: "cascade" } ),
	biosVersion: varchar("bios_version", { length: 100 }).notNull(),
	downloadUrl: varchar("download_url", { length: 1024 }).notNull(),
	releaseDate: varchar("release_date", { length: 12 }),
},
(table) => [
	index("idx_motherboard_id").on(table.motherboardId),
	primaryKey({ columns: [table.id], name: "bios_links_id"}),
	unique("uq_motherboard_version").on(table.motherboardId, table.id),
]);

export const categories = mysqlTable("categories", {
	id: varchar({ length: 36 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	href: varchar({ length: 255 }).notNull(),
	cid: int().notNull(),
	scrapeableSubcategories: tinyint("scrapeable_subcategories").notNull(),
	scrapeableCategories: tinyint("scrapeable_categories").notNull(),
	created: datetime({ mode: 'string'}).notNull(),
	updated: datetime({ mode: 'string'}).notNull(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "categories_id"}),
]);

export const gymTrendCache = mysqlTable("gym_trend_cache", {
	gymId: varchar("gym_id", { length: 36 }).notNull(),
	dayOfWeek: int("day_of_week").notNull(),
	trendData: json("trend_data").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	primaryKey({ columns: [table.gymId, table.dayOfWeek], name: "gym_trend_cache_gym_id_day_of_week"}),
]);

export const itemSets = mysqlTable("item_sets", {
	id: varchar({ length: 36 }).notNull(),
	dateFetched: varchar("date_fetched", { length: 255 }),
	status: varchar({ length: 255 }),
	created: datetime({ mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.id], name: "item_sets_id"}),
]);

export const items = mysqlTable("items", {
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
	itemSet: varchar("item_set", { length: 36 }).references(() => itemSets.id, { onDelete: "cascade" } ),
	created: datetime({ mode: 'string'}),
},
(table) => [
	index("idx_item_set").on(table.itemSet),
	primaryKey({ columns: [table.id], name: "items_id"}),
]);

export const motherboards = mysqlTable("motherboards", {
	id: varchar({ length: 36 }).notNull(),
	modelName: varchar("model_name", { length: 255 }).notNull(),
	productUrl: varchar("product_url", { length: 1024 }).notNull(),
	mid: int().notNull(),
	lastChecked: datetime("last_checked", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.id], name: "motherboards_id"}),
	unique("model_name").on(table.modelName),
	unique("mid").on(table.mid),
]);

export const session = mysqlTable("session", {
	id: varchar({ length: 36 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" } ),
},
(table) => [
	primaryKey({ columns: [table.id], name: "session_id"}),
	unique("session_token_unique").on(table.token),
]);

export const subcategories = mysqlTable("subcategories", {
	id: varchar({ length: 36 }).notNull(),
	cid: int(),
	name: varchar({ length: 255 }),
	categories: varchar({ length: 15 }).references(() => categories.id),
	created: datetime({ mode: 'string'}),
	updated: datetime({ mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.id], name: "subcategories_id"}),
]);

export const user = mysqlTable("user", {
	id: varchar({ length: 36 }).notNull(),
	name: text().notNull(),
	email: varchar({ length: 255 }).notNull(),
	emailVerified: tinyint("email_verified").notNull(),
	image: text(),
	isAdmin: tinyint("is_admin").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	gymPreferences: json("gym_preferences"),
},
(table) => [
	primaryKey({ columns: [table.id], name: "user_id"}),
	unique("user_email_unique").on(table.email),
]);

export const verification = mysqlTable("verification", {
	id: varchar({ length: 36 }).notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
},
(table) => [
	primaryKey({ columns: [table.id], name: "verification_id"}),
]);
