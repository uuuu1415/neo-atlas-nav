import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../src/server/database";
import { SettingsStore } from "../src/server/settings";
import { categories, websites } from "../src/server/schema";
import { parseTransfer } from "../src/server/bookmark-parser";
import {
  applyTransfer,
  exportBackup,
  previewTransfer,
  restoreSnapshot,
} from "../src/server/transfer";
import { atomicJson } from "../src/server/restore-journal";
import { backupSchema, type TransferRequest } from "../src/lib/transfer";
import {
  MAX_TRANSFER_REQUEST_BYTES,
  readTransferRequest,
} from "../src/server/transfer-http";

let directory: string;
let connection: ReturnType<typeof openDatabase>;
let store: SettingsStore;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "atlas-transfer-"));
  connection = openDatabase(directory);
  store = new SettingsStore(directory);
  await store.read();
});
afterEach(async () => {
  if (connection.sqlite.open) connection.sqlite.close();
  await rm(directory, { recursive: true, force: true });
});

const html: TransferRequest = {
  format: "html",
  mode: "merge",
  content: `<!DOCTYPE NETSCAPE-Bookmark-file-1>
  <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
  <TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>
  <DL><p>
    <DT><H3>工作 &amp; 学习</H3>
    <DL><p>
      <DT><A HREF="https://EXAMPLE.com" TAGS="first" ICON_URI="https://example.com/first.ico">First &amp; Best</A>
      <DT><H3>工具</H3>
      <DL><p>
        <DT><A HREF="https://example.com/" TAGS="last" ICON_URI="https://example.com/last.ico">Duplicate</A>
        <DT><A HREF="https://tool.test" ICON="data:image/png;base64,AAA">Tool</A>
      </DL><p>
    </DL><p>
    <DT><A HREF="javascript:alert(1)">Invalid</A>
    <DT><A HREF="https://empty.test"></A>
  </DL><p>`,
};
async function apply(request: TransferRequest) {
  const preview = await previewTransfer(connection, store, request);
  return applyTransfer(connection, store, {
    ...request,
    expectedFingerprint: preview.fingerprint,
  });
}

it("parses actual bookmark nesting and entities; merges first duplicate's complete fields", async () => {
  const parsed = parseTransfer(html);
  expect(parsed.rows.map((row) => row.categoryName)).toEqual([
    "工作 & 学习",
    "工作 & 学习 / 工具",
    "工作 & 学习 / 工具",
    "未分类",
    "未分类",
  ]);
  const preview = await previewTransfer(connection, store, html);
  expect(preview).toMatchObject({
    total: 5,
    added: 2,
    duplicates: 1,
    invalid: 2,
    categoryCount: 2,
  });
  await apply(html);
  const data = await exportBackup(connection, store);
  expect(
    data.websites.find((site) => site.url === "https://example.com/"),
  ).toMatchObject({
    title: "First & Best",
    tags: ["first"],
    iconUrl: "https://example.com/first.ico",
  });
  expect(data.websites.find((site) => site.title === "Tool")?.iconUrl).toBe("");
  expect(await apply(html)).toMatchObject({
    added: 0,
    duplicates: 3,
    categoryCount: 0,
  });
  expect(connection.db.select().from(categories).all()).toHaveLength(3);
});

it("rejects stale previews after either a catalog or settings change", async () => {
  const preview = await previewTransfer(connection, store, html);
  connection.db.insert(categories).values({ id: "extra", name: "额外" }).run();
  await expect(
    applyTransfer(connection, store, {
      ...html,
      expectedFingerprint: preview.fingerprint,
    }),
  ).rejects.toThrow("重新预览");
  const next = await previewTransfer(connection, store, html);
  await store.save({ ...(await store.read()).settings, name: "Changed" });
  await expect(
    applyTransfer(connection, store, {
      ...html,
      expectedFingerprint: next.fingerprint,
    }),
  ).rejects.toThrow("重新预览");
  expect(connection.db.select().from(websites).all()).toHaveLength(0);
});

it("restores every field, trash, order and settings while saving a complete before backup", async () => {
  await apply(html);
  const before = await exportBackup(connection, store);
  const incoming = backupSchema.parse({
    ...before,
    settings: {
      ...before.settings,
      name: "恢复后的空间",
      theme: "dark",
      revision: 90,
    },
    websites: before.websites.map((site, index) => ({
      ...site,
      position: 10 - index,
      description: `desc-${index}`,
      pinned: true,
      deletedAt: index === 0 ? new Date().toISOString() : null,
    })),
  });
  const result = await apply({
    format: "json",
    mode: "restore",
    content: JSON.stringify(incoming),
  });
  const after = await exportBackup(connection, store);
  expect(after.settings).toEqual({
    ...incoming.settings,
    revision: before.settings.revision + 1,
  });
  expect(after.categories).toEqual(incoming.categories);
  expect(after.websites).toEqual(
    [...incoming.websites].sort((a, b) => a.position - b.position),
  );
  expect(result.trashed).toBe(1);
  expect(
    JSON.parse(
      await readFile(
        path.join(directory, "backups", result.backupName!),
        "utf8",
      ),
    ),
  ).toMatchObject({
    categories: before.categories,
    websites: before.websites,
    settings: before.settings,
  });
  expect(
    JSON.parse(
      await readFile(path.join(directory, "settings.json.bak"), "utf8"),
    ),
  ).toEqual(before.settings);
  expect(existsSync(path.join(directory, "restore-journal.json"))).toBe(false);
});

it("rolls SQLite and settings back when restoring fails after writing settings", async () => {
  await apply(html);
  const before = await exportBackup(connection, store);
  expect(() =>
    restoreSnapshot(
      connection,
      directory,
      before,
      {
        ...before,
        websites: [],
        settings: { ...before.settings, name: "Should roll back" },
      },
      () => {
        throw new Error("injected failure");
      },
    ),
  ).toThrow("injected failure");
  const after = await exportBackup(connection, store);
  expect(after.websites).toEqual(before.websites);
  expect(after.settings).toEqual(before.settings);
  expect(existsSync(path.join(directory, "restore-journal.json"))).toBe(false);
});

it.each([false, true])(
  "recovers interrupted restore on reopen (SQLite committed: %s)",
  async (committed) => {
    const before = (await store.read()).settings;
    const after = {
      ...before,
      name: "Committed",
      revision: before.revision + 1,
    };
    const id = randomUUID();
    atomicJson(path.join(directory, "restore-journal.json"), {
      id,
      before,
      after,
    });
    atomicJson(path.join(directory, "settings.json"), after);
    if (committed)
      connection.sqlite
        .prepare("INSERT INTO restore_commits (id) VALUES (?)")
        .run(id);
    connection.sqlite.close();
    connection = openDatabase(directory);
    expect((await new SettingsStore(directory).read()).settings).toEqual(
      committed ? after : before,
    );
    expect(existsSync(path.join(directory, "restore-journal.json"))).toBe(
      false,
    );
  },
);

it("rejects invalid backup relationships, duplicate IDs and future versions before writes", async () => {
  const before = await exportBackup(connection, store);
  const variants = [
    { ...before, version: 2 },
    { ...before, categories: [] },
    { ...before, categories: [...before.categories, ...before.categories] },
    { ...before, settings: { ...before.settings, defaultCategory: "missing" } },
  ];
  for (const data of variants) {
    await expect(
      apply({ format: "json", mode: "restore", content: JSON.stringify(data) }),
    ).rejects.toThrow();
  }
  expect((await exportBackup(connection, store)).categories).toEqual(
    before.categories,
  );
});

it("upgrades a v1 catalog without removing data", () => {
  connection.db.insert(categories).values({ id: "kept", name: "保留" }).run();
  connection.sqlite.exec(
    "DROP TABLE restore_commits; PRAGMA user_version = 1;",
  );
  connection.sqlite.close();
  connection = openDatabase(directory);
  expect(connection.sqlite.pragma("user_version", { simple: true })).toBe(2);
  expect(connection.db.select().from(categories).all()).toHaveLength(2);
});

it("bounds HTML invalid rows and streamed request bodies", async () => {
  expect(() =>
    parseTransfer({
      ...html,
      content: `<DL><DT><H3>${"x".repeat(501)}</H3><DL>${'<DT><A HREF="https://a.test">A</A>'.repeat(10_001)}</DL></DL>`,
    }),
  ).toThrow("10,000");
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_TRANSFER_REQUEST_BYTES + 1));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("http://localhost/api/import/preview", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await expect(readTransferRequest(request)).rejects.toThrow("过大");
  expect(canceled).toBe(true);
});
