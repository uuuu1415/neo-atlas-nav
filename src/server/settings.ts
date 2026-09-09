import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultSettings, settingsSchema, type Settings } from "../lib/schemas";
import { recoverRestore } from "./restore-journal";

export class SettingsConflictError extends Error {}
export class SettingsStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private get file() {
    return path.join(this.directory, "settings.json");
  }
  private async readFile(file: string) {
    return settingsSchema.parse(JSON.parse(await readFile(file, "utf8")));
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async replace(settings: Settings) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify(settings, null, 2) + "\n",
      "utf8",
    );
    await rename(temporary, this.file);
  }
  private async load(): Promise<{ settings: Settings; warning?: string }> {
    recoverRestore(this.directory);
    try {
      return { settings: await this.readFile(this.file) };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        await this.replace(defaultSettings);
        return { settings: { ...defaultSettings } };
      }
      // Preserve the broken file before recovering; never replace it with defaults.
      const backup = await this.readFile(`${this.file}.bak`);
      await copyFile(this.file, `${this.file}.corrupt-${randomUUID()}`);
      await this.replace(backup);
      return {
        settings: backup,
        warning: "设置文件损坏，已恢复上一个有效版本；原文件已保留。",
      };
    }
  }
  read() {
    return this.serialize(() => this.load());
  }
  /** Keep restore's synchronous DB/file transaction inside the settings queue. */
  withSnapshot<T>(
    operation: (settings: Settings, directory: string) => T,
  ): Promise<T> {
    return this.serialize(async () => {
      const { settings } = await this.load();
      return operation(settings, this.directory);
    });
  }
  save(input: unknown) {
    return this.serialize(async () => {
      const proposed = settingsSchema.parse(input);
      const { settings: current } = await this.load();
      if (current.revision !== proposed.revision)
        throw new SettingsConflictError("设置已被其他页面修改，请刷新后重试");
      const next = { ...proposed, revision: current.revision + 1 };
      await copyFile(this.file, `${this.file}.bak`);
      await this.replace(next);
      return next;
    });
  }
}
export const settingsStore = new SettingsStore(
  process.env.ATLAS_DATA_DIR ?? path.join(process.cwd(), "data"),
);
