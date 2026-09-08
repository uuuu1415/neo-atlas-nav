import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";
import { categories, websites } from "./schema";
import { websiteInputSchema } from "../lib/schemas";

export function listWebsites() { return getDatabase().select().from(websites).orderBy(asc(websites.position)).all(); }
export function listCategories() { return getDatabase().select().from(categories).orderBy(asc(categories.position)).all(); }
export function saveWebsite(input: unknown, id?: string) {
  const value = websiteInputSchema.parse(input);
  const db = getDatabase();
  if (id) return db.update(websites).set(value).where(eq(websites.id, id)).returning().get();
  return db.insert(websites).values({ ...value, id: randomUUID(), createdAt: new Date().toISOString(), position: Date.now() }).returning().get();
}
export function trashWebsite(id: string, restore: boolean) {
  return getDatabase().update(websites).set({ deletedAt: restore ? null : new Date().toISOString() }).where(eq(websites.id, id)).returning().get();
}
export function deleteWebsite(id: string) { getDatabase().delete(websites).where(eq(websites.id, id)).run(); }
export function addCategory(name: string) {
  return getDatabase().insert(categories).values({ id: randomUUID(), name, position: Date.now() }).returning().get();
}
