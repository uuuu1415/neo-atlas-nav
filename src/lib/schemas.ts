import { z } from "zod";

export const settingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  revision: z.number().int().nonnegative().default(0),
  name: z.string().trim().min(1).max(80).default("Neo Atlas"),
  description: z.string().max(240).default("把值得常来的地方，放在一起。"),
  logoUrl: z.union([z.url(), z.literal("")]).default(""),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6554db"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  motion: z.enum(["rich", "simple", "off"]).default("rich"),
  showDescription: z.boolean().default(true),
  openInNewTab: z.boolean().default(true),
  defaultCategory: z.string().default("all"),
  searchEngine: z.enum(["google", "bing", "baidu"]).default("google"),
  fetchTimeoutMs: z.number().int().min(1000).max(30000).default(10000),
  metadataCacheMinutes: z.number().int().min(0).max(10080).default(60),
  fillEmptyOnly: z.boolean().default(true),
  autoCheckUpdates: z.boolean().default(true),
  updateIntervalHours: z.number().int().min(1).max(168).default(24),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = settingsSchema.parse({});

export const websiteInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z
    .url()
    .refine(
      (value) => ["http:", "https:"].includes(new URL(value).protocol),
      "请输入 HTTP 或 HTTPS 网址",
    ),
  description: z.string().max(1000).default(""),
  iconUrl: z.union([z.url(), z.literal("")]).default(""),
  categoryId: z.string().default("uncategorized"),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  pinned: z.boolean().default(false),
});
export type WebsiteInput = z.infer<typeof websiteInputSchema>;
