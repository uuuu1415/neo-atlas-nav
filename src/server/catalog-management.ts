import { asc, eq, inArray, isNull } from "drizzle-orm";
import type { getDatabase } from "./database";
import { categories, websites } from "./schema";
import {
  batchSchema,
  categoryCommandSchema,
  moveWebsiteSchema,
} from "../lib/catalog-commands";

export class CatalogError extends Error {}
type Database = ReturnType<typeof getDatabase>;
export function applyBatch(db: Database, input: unknown) {
  const command = batchSchema.parse(input);
  return db.transaction((tx) => {
    const selected = tx
      .select()
      .from(websites)
      .where(inArray(websites.id, command.ids))
      .all();
    if (selected.length !== command.ids.length)
      throw new CatalogError("部分网站已不存在，请刷新后重试");
    if (command.action === "delete" && selected.some((site) => !site.deletedAt))
      throw new CatalogError("只有回收站中的网站可以永久删除");
    if (
      !["restore", "delete"].includes(command.action) &&
      selected.some((site) => site.deletedAt)
    )
      throw new CatalogError("请先恢复回收站中的网站");
    if (
      command.action === "move" &&
      !tx
        .select()
        .from(categories)
        .where(eq(categories.id, command.categoryId))
        .get()
    )
      throw new CatalogError("目标分类不存在");
    for (const site of selected) {
      const condition = eq(websites.id, site.id);
      switch (command.action) {
        case "pin":
          tx.update(websites)
            .set({ pinned: command.pinned })
            .where(condition)
            .run();
          break;
        case "move":
          tx.update(websites)
            .set({ categoryId: command.categoryId })
            .where(condition)
            .run();
          break;
        case "tags": {
          const tags =
            command.mode === "add"
              ? [...new Set([...site.tags, ...command.tags])]
              : site.tags.filter((tag) => !command.tags.includes(tag));
          if (tags.length > 30)
            throw new CatalogError("每个网站最多保留 30 个标签");
          tx.update(websites).set({ tags }).where(condition).run();
          break;
        }
        case "trash":
          tx.update(websites)
            .set({ deletedAt: new Date().toISOString() })
            .where(condition)
            .run();
          break;
        case "restore":
          tx.update(websites).set({ deletedAt: null }).where(condition).run();
          break;
        case "delete":
          tx.delete(websites).where(condition).run();
          break;
      }
    }
    return { changed: selected.length };
  });
}

export function changeCategory(db: Database, input: unknown) {
  const command = categoryCommandSchema.parse(input);
  return db.transaction((tx) => {
    const items = tx
      .select()
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.id))
      .all();
    const index = items.findIndex((item) => item.id === command.id);
    if (index < 0) throw new CatalogError("分类不存在");
    if (command.action === "rename") {
      if (command.id === "uncategorized")
        throw new CatalogError("未分类是保留分类");
      tx.update(categories)
        .set({ name: command.name })
        .where(eq(categories.id, command.id))
        .run();
    } else if (command.action === "delete") {
      if (command.id === "uncategorized")
        throw new CatalogError("不能删除未分类");
      // Move both live and trashed entries before deleting the foreign-key target.
      tx.update(websites)
        .set({ categoryId: "uncategorized" })
        .where(eq(websites.categoryId, command.id))
        .run();
      tx.delete(categories).where(eq(categories.id, command.id)).run();
    } else {
      const other = command.direction === "up" ? index - 1 : index + 1;
      const item = items[index];
      const neighbor = items[other];
      if (item && neighbor) {
        items[index] = neighbor;
        items[other] = item;
      }
      items.forEach((entry, position) =>
        tx
          .update(categories)
          .set({ position })
          .where(eq(categories.id, entry.id))
          .run(),
      );
    }
    return { ok: true };
  });
}

export function moveWebsite(db: Database, input: unknown) {
  const command = moveWebsiteSchema.parse(input);
  return db.transaction((tx) => {
    const current = tx
      .select()
      .from(websites)
      .where(eq(websites.id, command.id))
      .get();
    if (!current || current.deletedAt)
      throw new CatalogError("网站不存在或已在回收站");
    const items = tx
      .select()
      .from(websites)
      .where(isNull(websites.deletedAt))
      .orderBy(asc(websites.position), asc(websites.id))
      .all()
      .filter((item) => item.categoryId === current.categoryId);
    const index = items.findIndex((item) => item.id === current.id);
    const other = command.direction === "up" ? index - 1 : index + 1;
    const item = items[index];
    const neighbor = items[other];
    if (item && neighbor) {
      items[index] = neighbor;
      items[other] = item;
    }
    items.forEach((entry, position) =>
      tx
        .update(websites)
        .set({ position })
        .where(eq(websites.id, entry.id))
        .run(),
    );
    return { ok: true };
  });
}
