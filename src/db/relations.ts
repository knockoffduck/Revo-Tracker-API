import { relations } from "drizzle-orm";
import {
  revoGyms,
  revoGymCount,
  motherboards,
  biosLinks,
  itemSets,
  items,
  categories,
  subcategories,
} from "./schema";

// Revo Gym Count → Revo Gym (many-to-one)
export const revoGymCountRelations = relations(revoGymCount, ({ one }) => ({
  revoGym: one(revoGyms, {
    fields: [revoGymCount.gymId],
    references: [revoGyms.id],
  }),
}));

// Revo Gyms → Revo Gym Count (one-to-many)
export const revoGymsRelations = relations(revoGyms, ({ many }) => ({
  revoGymCounts: many(revoGymCount),
}));

// BIOS Links → Motherboards (many-to-one)
export const biosLinksRelations = relations(biosLinks, ({ one }) => ({
  motherboard: one(motherboards, {
    fields: [biosLinks.motherboardId],
    references: [motherboards.mid],
  }),
}));

// Motherboards → BIOS Links (one-to-many)
export const motherboardsRelations = relations(motherboards, ({ many }) => ({
  biosLinks: many(biosLinks),
}));

// Items → Item Sets (many-to-one)
export const itemsRelations = relations(items, ({ one }) => ({
  itemSet: one(itemSets, {
    fields: [items.itemSet],
    references: [itemSets.id],
  }),
}));

// Item Sets → Items (one-to-many)
export const itemSetsRelations = relations(itemSets, ({ many }) => ({
  items: many(items),
}));

// Subcategories → Category (many-to-one)
export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, {
    fields: [subcategories.categories],
    references: [categories.id],
  }),
}));

// Categories → Subcategories (one-to-many)
export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));
