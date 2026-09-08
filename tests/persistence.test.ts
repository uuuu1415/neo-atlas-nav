import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsStore, SettingsConflictError } from "../src/server/settings";
import { openDatabase } from "../src/server/database";
import { categories } from "../src/server/schema";
const directories: string[] = [];
async function directory() { const result = await mkdtemp(path.join(tmpdir(), "atlas-test-")); directories.push(result); return result; }
afterEach(async () => { await Promise.all(directories.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });
describe("durable settings", () => {
  it("serializes conflicting writes and survives reopening", async () => {
    const dir = await directory(); const store = new SettingsStore(dir); const { settings } = await store.read();
    const results = await Promise.allSettled([store.save({ ...settings, name: "First" }), store.save({ ...settings, name: "Second" })]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((await new SettingsStore(dir).read()).settings.name).toBe("First");
    await expect(store.save(settings)).rejects.toBeInstanceOf(SettingsConflictError);
  });
  it("recovers a backup while preserving invalid input", async () => {
    const dir = await directory(); const store = new SettingsStore(dir); const { settings } = await store.read();
    await store.save({ ...settings, name: "Changed" }); await writeFile(path.join(dir, "settings.json"), "broken");
    const result = await store.read(); expect(result.warning).toBeTruthy(); expect(result.settings.name).toBe(settings.name);
  });
  it("does not silently reset damaged data without backup", async () => {
    const dir = await directory(); await writeFile(path.join(dir, "settings.json"), "broken");
    await expect(new SettingsStore(dir).read()).rejects.toThrow();
    expect(await readFile(path.join(dir, "settings.json"), "utf8")).toBe("broken");
  });
});
it("database schema migration is repeatable and persists data", async () => {
  const dir = await directory(); const first = openDatabase(dir);
  first.db.insert(categories).values({ id: "work", name: "工作" }).run(); first.sqlite.close();
  const second = openDatabase(dir); expect(second.db.select().from(categories).all()).toHaveLength(2); second.sqlite.close();
});
