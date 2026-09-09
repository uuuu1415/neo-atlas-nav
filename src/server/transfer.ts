import { asc, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  backupSchema,
  type Backup,
  type ImportEntry,
  type TransferPreview,
  type TransferRequest,
} from "../lib/transfer";
import type { Settings } from "../lib/schemas";
import { type openDatabase } from "./database";
import { categories, websites } from "./schema";
import { SettingsStore } from "./settings";
import { CatalogError } from "./catalog-management";
import { canonicalUrl, parseTransfer } from "./bookmark-parser";
import {
  atomicJson,
  recoverRestore,
  type RestoreJournal,
} from "./restore-journal";

type Connection = ReturnType<typeof openDatabase>;
export function snapshot(connection: Connection, settings: Settings): Backup {
  return backupSchema.parse({
    format: "neo-atlas-nav",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    categories: connection.db
      .select()
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.id))
      .all(),
    websites: connection.db
      .select()
      .from(websites)
      .orderBy(asc(websites.position), asc(websites.id))
      .all(),
  });
}
function fingerprint(backup: Backup) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        categories: backup.categories,
        websites: backup.websites,
        settings: backup.settings,
      }),
    )
    .digest("hex");
}
function prepare(request: TransferRequest, current: Backup) {
  const parsed = parseTransfer(request);
  const seen = new Set(current.websites.map((site) => canonicalUrl(site.url)));
  const additions: ImportEntry[] = [];
  const entries = new Map<string, ImportEntry>();
  for (const entry of parsed.entries) {
    const key = canonicalUrl(entry.url);
    if (!entries.has(key)) entries.set(key, entry);
  }
  // Walk rows in source order. A duplicate later in the same file is skipped too.
  for (const row of parsed.rows) {
    if (row.status !== "new" || request.mode === "restore") continue;
    const key = canonicalUrl(row.url);
    if (seen.has(key)) row.status = "duplicate";
    else {
      seen.add(key);
      const entry = entries.get(key);
      if (entry)
        additions.push({
          ...entry,
          title: row.title,
          categoryName: row.categoryName,
        });
    }
  }
  const preview: TransferPreview = {
    mode: request.mode,
    total: parsed.rows.length,
    added:
      request.mode === "restore"
        ? (parsed.backup?.websites.length ?? 0)
        : additions.length,
    duplicates: parsed.rows.filter((row) => row.status === "duplicate").length,
    invalid: parsed.rows.filter((row) => row.status === "invalid").length,
    trashed:
      request.mode === "restore"
        ? (parsed.backup?.websites.filter((site) => site.deletedAt).length ?? 0)
        : parsed.rows.filter((row) => row.status === "trashed").length,
    categoryCount:
      request.mode === "restore"
        ? (parsed.backup?.categories.length ?? 0)
        : new Set(
            additions
              .map((entry) => entry.categoryName)
              .filter(
                (name) =>
                  !current.categories.some(
                    (category) => category.name === name,
                  ),
              ),
          ).size,
    currentCount: current.websites.length,
    fingerprint: fingerprint(current),
    rows: parsed.rows.slice(0, 200),
    truncated: parsed.rows.length > 200,
    settingsName:
      request.mode === "restore" ? parsed.backup?.settings.name : undefined,
  };
  return { preview, additions, backup: parsed.backup };
}
export function exportBackup(connection: Connection, store: SettingsStore) {
  return store.withSnapshot((settings) => snapshot(connection, settings));
}
export function previewTransfer(
  connection: Connection,
  store: SettingsStore,
  request: TransferRequest,
) {
  return store.withSnapshot(
    (settings) => prepare(request, snapshot(connection, settings)).preview,
  );
}
function mergeEntries(connection: Connection, additions: ImportEntry[]) {
  connection.db.transaction((tx) => {
    const existing = tx
      .select()
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.id))
      .all();
    const categoryIds = new Map(
      existing.map((category) => [category.name, category.id]),
    );
    let categoryPosition =
      Math.max(0, ...existing.map((category) => category.position)) + 1;
    let position =
      Number(
        tx.get<{ position: number }>(
          sql`SELECT COALESCE(MAX(position), 0) AS position FROM websites`,
        )?.position ?? 0,
      ) + 1;
    for (const entry of additions) {
      let categoryId = categoryIds.get(entry.categoryName);
      if (!categoryId) {
        categoryId = randomUUID();
        categoryIds.set(entry.categoryName, categoryId);
        tx.insert(categories)
          .values({
            id: categoryId,
            name: entry.categoryName,
            position: categoryPosition++,
          })
          .run();
      }
      const { categoryName: _categoryName, ...site } = entry;
      void _categoryName;
      tx.insert(websites)
        .values({
          ...site,
          id: randomUUID(),
          categoryId,
          position: position++,
          createdAt: new Date().toISOString(),
          deletedAt: null,
        })
        .run();
    }
  });
}
export function restoreSnapshot(
  connection: Connection,
  directory: string,
  before: Backup,
  incoming: Backup,
  beforeCommit?: () => void,
) {
  const id = randomUUID();
  const backupName = `before-restore-${id}.json`;
  const backupDirectory = path.join(directory, "backups");
  mkdirSync(backupDirectory, { recursive: true });
  atomicJson(path.join(backupDirectory, backupName), before);
  const settingsFile = path.join(directory, "settings.json");
  const after = {
    ...incoming.settings,
    revision: before.settings.revision + 1,
  };
  const journal: RestoreJournal = { id, before: before.settings, after };
  atomicJson(path.join(directory, "restore-journal.json"), journal);
  try {
    connection.db.transaction((tx) => {
      tx.delete(websites).run();
      tx.delete(categories).run();
      for (const category of incoming.categories)
        tx.insert(categories).values(category).run();
      for (const website of incoming.websites)
        tx.insert(websites).values(website).run();
      copyFileSync(settingsFile, `${settingsFile}.bak`);
      atomicJson(settingsFile, after);
      beforeCommit?.();
      tx.run(sql`INSERT INTO restore_commits (id) VALUES (${id})`);
    });
    unlinkSync(path.join(directory, "restore-journal.json"));
  } catch (error) {
    recoverRestore(directory, connection.sqlite);
    throw error;
  }
  return backupName;
}
export function applyTransfer(
  connection: Connection,
  store: SettingsStore,
  request: TransferRequest,
) {
  return store.withSnapshot((settings, directory) => {
    const current = snapshot(connection, settings);
    if (
      !request.expectedFingerprint ||
      request.expectedFingerprint !== fingerprint(current)
    )
      throw new CatalogError("数据在预览后已改变，请重新预览，尚未导入");
    const { preview, additions, backup } = prepare(request, current);
    if (request.mode === "restore") {
      if (!backup) throw new CatalogError("未提供完整备份");
      const backupName = restoreSnapshot(
        connection,
        directory,
        current,
        backup,
      );
      return { ...preview, backupName };
    }
    mergeEntries(connection, additions);
    return { ...preview, backupName: null };
  });
}
