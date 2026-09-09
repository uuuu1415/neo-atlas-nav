import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export function openDatabase(directory: string) {
  mkdirSync(directory, { recursive: true });
  const sqlite = new Database(path.join(directory, "atlas.sqlite"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const version = Number(sqlite.pragma("user_version", { simple: true }));
  if (version > 1) {
    sqlite.close();
    throw new Error("数据库版本高于当前程序支持的版本");
  }
  if (version === 0) {
    sqlite.transaction(() => {
      sqlite.exec(`CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE websites (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon_url TEXT NOT NULL DEFAULT '', category_id TEXT NOT NULL REFERENCES categories(id), tags TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL);
        INSERT INTO categories VALUES ('uncategorized', '未分类', 0);
        PRAGMA user_version = 1;`);
    })();
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
let connection: ReturnType<typeof openDatabase> | undefined;
export function getDatabase() {
  connection ??= openDatabase(
    process.env.ATLAS_DATA_DIR ?? path.join(process.cwd(), "data"),
  );
  return connection.db;
}
