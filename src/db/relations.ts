import { relations } from "drizzle-orm/relations";
import {
	motherboards,
	biosLinks,
	itemSets,
	items,
	categories,
	subcategories,
} from "./schema";

export const biosLinksRelations = relations(biosLinks, ({ one }) => ({
	motherboard: one(motherboards, {
		fields: [biosLinks.motherboardId],
		references: [motherboards.mid],
	}),
}));

export const motherboardsRelations = relations(motherboards, ({ many }) => ({
	biosLinks: many(biosLinks),
}));

export const itemsRelations = relations(items, ({ one }) => ({
	itemSet: one(itemSets, {
		fields: [items.itemSet],
		references: [itemSets.id],
	}),
}));

export const itemSetsRelations = relations(itemSets, ({ many }) => ({
	items: many(items),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
	category: one(categories, {
		fields: [subcategories.categories],
		references: [categories.id],
	}),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
	subcategories: many(subcategories),
}));
