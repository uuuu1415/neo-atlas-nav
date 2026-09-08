import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});
export const websites = sqliteTable("websites", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description").notNull().default(""),
  iconUrl: text("icon_url").notNull().default(""),
  categoryId: text("category_id").notNull().references(() => categories.id),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
});
export type Website = typeof websites.$inferSelect;
export type Category = typeof categories.$inferSelect;
