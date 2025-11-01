import {
  pgTable,
  pgSchema,
  AnyPgColumn,
  foreignKey,
  primaryKey,
  varchar,
  timestamp,
  integer,
  doublePrecision,
  text,
  index,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const revoGyms = pgTable(
  "Revo_Gyms",
  {
    id: varchar({ length: 36 }).notNull(),
    name: text().notNull(),
    state: text().notNull(),
    areaSize: integer("area_size").notNull(),
    lastUpdated: timestamp("last_updated").notNull(),
    address: text().notNull(),
    postcode: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.id], name: "Revo_Gyms_id" })],
);

export const revoGymCount = pgTable(
  "Revo_Gym_Count",
  {
    id: varchar({ length: 36 }).notNull(),
    created: timestamp().notNull(),
    count: integer().notNull(),
    ratio: doublePrecision().notNull(),
    gymName: text("gym_name").notNull(),
    percentage: doublePrecision(),
    gymId: varchar("gym_id", { length: 36 })
      .notNull()
      .references(() => revoGyms.id),
  },
  (table) => [primaryKey({ columns: [table.id], name: "Revo_Gym_Count_id" })],
);

export const motherboards = pgTable(
  "motherboards",
  {
    id: varchar({ length: 36 }).notNull(),
    modelName: varchar("model_name", { length: 255 }).notNull(),
    productUrl: varchar("product_url", { length: 1024 }).notNull(),
    mid: integer().notNull(),
    lastChecked: timestamp("last_checked", { mode: "string" }),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: "motherboards_id" }),
    unique("model_name").on(table.modelName),
    unique("mid").on(table.mid),
  ],
);

export const biosLinks = pgTable(
  "bios_links",
  {
    id: varchar({ length: 36 }).notNull(),
    motherboardId: integer("motherboard_id")
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
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: varchar({ length: 36 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    href: varchar({ length: 255 }).notNull(),
    cid: integer().notNull(),
    scrapeableSubcategories: boolean("scrapeable_subcategories").notNull(),
    scrapeableCategories: boolean("scrapeable_categories").notNull(),
    created: timestamp({ mode: "string" }).notNull(),
    updated: timestamp({ mode: "string" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.id], name: "categories_id" })],
);

export const itemSets = pgTable(
  "item_sets",
  {
    id: varchar({ length: 36 }).notNull(),
    dateFetched: varchar("date_fetched", { length: 255 }),
    status: varchar({ length: 255 }),
    created: timestamp({ mode: "string" }),
  },
  (table) => [primaryKey({ columns: [table.id], name: "item_sets_id" })],
);

export const items = pgTable(
  "items",
  {
    id: varchar({ length: 36 }).notNull(),
    pleCode: varchar("ple_code", { length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    rrp: doublePrecision("RRP"),
    staffPrice: doublePrecision("staff_price"),
    percentageDifference: doublePrecision("percentage_difference"),
    costDifference: doublePrecision("cost_difference"),
    msrp: doublePrecision("MSRP"),
    percentageDifferenceMsrp: doublePrecision("percentage_difference_MSRP"),
    costDifferenceMsrp: doublePrecision("cost_difference_MSRP"),
    itemUrl: varchar("item_url", { length: 255 }),
    imgUrl: varchar("img_url", { length: 255 }),
    category: varchar({ length: 255 }),
    model: varchar({ length: 255 }),
    itemSet: varchar("item_set", { length: 36 }).references(() => itemSets.id, {
      onDelete: "cascade",
    }),
    created: timestamp({ mode: "string" }),
  },
  (table) => [
    index("idx_item_set").on(table.itemSet),
    primaryKey({ columns: [table.id], name: "items_id" }),
  ],
);

export const subcategories = pgTable(
  "subcategories",
  {
    id: varchar({ length: 36 }).notNull(),
    cid: integer(),
    name: varchar({ length: 255 }),
    categories: varchar({ length: 15 }).references(() => categories.id),
    created: timestamp({ mode: "string" }),
    updated: timestamp({ mode: "string" }),
  },
  (table) => [primaryKey({ columns: [table.id], name: "subcategories_id" })],
);
