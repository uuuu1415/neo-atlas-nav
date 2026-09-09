import Database from "better-sqlite3";
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { settingsSchema } from "../lib/schemas";

const journalSchema = z.object({
  id: z.string().uuid(),
  before: settingsSchema,
  after: settingsSchema,
});
export type RestoreJournal = z.infer<typeof journalSchema>;
export function atomicJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temporary, "wx");
    try {
      writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, file);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
export function recoverRestore(
  directory: string,
  existing?: Database.Database,
) {
  const file = path.join(directory, "restore-journal.json");
  if (!existsSync(file)) return;
  const journal = journalSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const connection =
    existing ?? new Database(path.join(directory, "atlas.sqlite"));
  try {
    const committed = connection
      .prepare("SELECT id FROM restore_commits WHERE id = ?")
      .get(journal.id);
    // SQLite decides which side of the cross-file operation survived a crash.
    atomicJson(
      path.join(directory, "settings.json"),
      committed ? journal.after : journal.before,
    );
    unlinkSync(file);
  } finally {
    if (!existing) connection.close();
  }
}
