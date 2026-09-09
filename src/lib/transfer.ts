import { z } from "zod";
import { settingsSchema, websiteInputSchema } from "./schemas";

export const MAX_TRANSFER_BYTES = 10_000_000;
export const MAX_TRANSFER_ENTRIES = 10_000;
const identifier = z.string().min(1).max(200);
export const backupCategorySchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(500),
  position: z.number().int().nonnegative(),
});
export const backupWebsiteSchema = websiteInputSchema.extend({
  id: identifier,
  categoryId: identifier,
  position: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export const backupSchema = z
  .object({
    format: z.literal("neo-atlas-nav"),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    categories: z.array(backupCategorySchema).min(1).max(MAX_TRANSFER_ENTRIES),
    websites: z.array(backupWebsiteSchema).max(MAX_TRANSFER_ENTRIES),
    settings: settingsSchema,
  })
  .superRefine((backup, context) => {
    const categories = new Set(
      backup.categories.map((category) => category.id),
    );
    const sites = new Set(backup.websites.map((site) => site.id));
    const invalid =
      categories.size !== backup.categories.length ||
      sites.size !== backup.websites.length ||
      !categories.has("uncategorized") ||
      backup.websites.some((site) => !categories.has(site.categoryId)) ||
      (backup.settings.defaultCategory !== "all" &&
        !categories.has(backup.settings.defaultCategory));
    if (invalid)
      context.addIssue({
        code: "custom",
        message: "备份存在重复 ID、缺失分类或无效默认分类",
      });
  });
export type Backup = z.infer<typeof backupSchema>;
export const transferRequestSchema = z.object({
  format: z.enum(["html", "json"]),
  content: z.string().max(MAX_TRANSFER_BYTES),
  mode: z.enum(["merge", "restore"]).default("merge"),
  expectedFingerprint: z.string().optional(),
});
export type TransferRequest = z.infer<typeof transferRequestSchema>;
export type ImportEntry = z.infer<typeof websiteInputSchema> & {
  categoryName: string;
};
export type ImportRow = {
  title: string;
  url: string;
  categoryName: string;
  status: "new" | "duplicate" | "invalid" | "trashed";
  reason?: string;
};
export type TransferPreview = {
  mode: "merge" | "restore";
  total: number;
  added: number;
  duplicates: number;
  invalid: number;
  trashed: number;
  categoryCount: number;
  currentCount: number;
  fingerprint: string;
  rows: ImportRow[];
  truncated: boolean;
  settingsName?: string;
};
