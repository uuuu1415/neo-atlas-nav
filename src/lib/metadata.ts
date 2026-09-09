import { z } from "zod";
export const metadataPreviewSchema = z.object({
  title: z.string(),
  description: z.string(),
  iconUrl: z.string(),
  sourceUrl: z.string(),
  fetchedAt: z.string(),
  warning: z.string(),
});
export type MetadataPreview = z.infer<typeof metadataPreviewSchema>;
export type MetadataFields = Pick<
  MetadataPreview,
  "title" | "description" | "iconUrl"
>;
export function fillEmptyFields(
  current: MetadataFields,
  fetched: MetadataFields,
): MetadataFields {
  return {
    title: current.title.trim() ? current.title : fetched.title,
    description: current.description.trim()
      ? current.description
      : fetched.description,
    iconUrl: current.iconUrl.trim() ? current.iconUrl : fetched.iconUrl,
  };
}
