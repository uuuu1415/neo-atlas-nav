import { z } from "zod";
const ids = z
  .array(z.string().min(1))
  .min(1)
  .max(1000)
  .refine((items) => new Set(items).size === items.length, "网站不能重复");
export const batchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pin"), ids, pinned: z.boolean() }),
  z.object({ action: z.literal("move"), ids, categoryId: z.string().min(1) }),
  z.object({
    action: z.literal("tags"),
    ids,
    mode: z.enum(["add", "remove"]),
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
  }),
  z.object({ action: z.enum(["trash", "restore", "delete"]), ids }),
]);
export type BatchCommand = z.infer<typeof batchSchema>;
export const categoryCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    id: z.string(),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({ action: z.literal("delete"), id: z.string() }),
  z.object({
    action: z.literal("move"),
    id: z.string(),
    direction: z.enum(["up", "down"]),
  }),
]);
export const moveWebsiteSchema = z.object({
  id: z.string(),
  direction: z.enum(["up", "down"]),
});
