import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../src/server/database";
import { categories, websites } from "../src/server/schema";
import {
  applyBatch,
  changeCategory,
  moveWebsite,
} from "../src/server/catalog-management";
import { asc, eq } from "drizzle-orm";

let directory: string;
let connection: ReturnType<typeof openDatabase>;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "atlas-catalog-"));
  connection = openDatabase(directory);
  connection.db
    .insert(categories)
    .values({ id: "work", name: "工作", position: 1 })
    .run();
  connection.db
    .insert(websites)
    .values(
      ["a", "b", "c"].map((id) => ({
        id,
        title: id,
        url: `https://${id}.test`,
        categoryId: "work",
        tags: ["existing"],
        position: 1,
        createdAt: new Date().toISOString(),
      })),
    )
    .run();
});
afterEach(async () => {
  connection.sqlite.close();
  await rm(directory, { recursive: true, force: true });
});
const entries = () =>
  connection.db
    .select()
    .from(websites)
    .orderBy(asc(websites.position), asc(websites.id))
    .all();
describe("catalog transactions", () => {
  it("moves both active and trashed records before category deletion", () => {
    applyBatch(connection.db, { action: "trash", ids: ["b"] });
    changeCategory(connection.db, { action: "delete", id: "work" });
    expect(
      entries().every((entry) => entry.categoryId === "uncategorized"),
    ).toBe(true);
    expect(entries().find((entry) => entry.id === "b")?.deletedAt).toBeTruthy();
    expect(() =>
      changeCategory(connection.db, { action: "delete", id: "uncategorized" }),
    ).toThrow();
  });
  it("rejects missing IDs without updating valid IDs", () => {
    expect(() =>
      applyBatch(connection.db, {
        action: "pin",
        ids: ["a", "missing"],
        pinned: true,
      }),
    ).toThrow();
    expect(entries().every((entry) => !entry.pinned)).toBe(true);
  });
  it("requires trash before permanent deletion and preserves other records", () => {
    expect(() =>
      applyBatch(connection.db, { action: "delete", ids: ["a", "b"] }),
    ).toThrow();
    applyBatch(connection.db, { action: "trash", ids: ["a", "b"] });
    applyBatch(connection.db, { action: "restore", ids: ["b"] });
    applyBatch(connection.db, { action: "delete", ids: ["a"] });
    expect(entries().map((entry) => entry.id)).toEqual(["b", "c"]);
  });
  it("rolls back earlier updates when a later entry exceeds its tag limit", () => {
    connection.db
      .update(websites)
      .set({ tags: Array.from({ length: 30 }, (_, index) => `tag${index}`) })
      .where(eq(websites.id, "b"))
      .run();
    expect(() =>
      applyBatch(connection.db, {
        action: "tags",
        ids: ["a", "b"],
        mode: "add",
        tags: ["new"],
      }),
    ).toThrow();
    expect(entries().find((entry) => entry.id === "a")?.tags).toEqual([
      "existing",
    ]);
  });
  it("deduplicates added tags and removes only specified tags", () => {
    applyBatch(connection.db, {
      action: "tags",
      ids: ["a"],
      mode: "add",
      tags: ["existing", "new"],
    });
    applyBatch(connection.db, {
      action: "tags",
      ids: ["a"],
      mode: "remove",
      tags: ["existing"],
    });
    expect(entries().find((entry) => entry.id === "a")?.tags).toEqual(["new"]);
  });
  it("orders tied positions deterministically and never crosses categories", () => {
    connection.db
      .update(websites)
      .set({ categoryId: "uncategorized" })
      .where(eq(websites.id, "c"))
      .run();
    moveWebsite(connection.db, { id: "b", direction: "up" });
    expect(
      entries()
        .filter((entry) => entry.categoryId === "work")
        .map((entry) => entry.id),
    ).toEqual(["b", "a"]);
    expect(entries().find((entry) => entry.id === "c")?.position).toBe(1);
  });
  it("rejects a missing destination and keeps records intact", () => {
    expect(() =>
      applyBatch(connection.db, {
        action: "move",
        ids: ["a", "b"],
        categoryId: "missing",
      }),
    ).toThrow();
    expect(entries().every((entry) => entry.categoryId === "work")).toBe(true);
  });
});
