import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/server/http";
import { fetchMetadata } from "@/server/metadata";
import { settingsStore } from "@/server/settings";
const inputSchema = z.object({
  url: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
});
export async function POST(request: Request) {
  try {
    const { url } = inputSchema.parse(await request.json());
    const { settings } = await settingsStore.read();
    try {
      return NextResponse.json(
        await fetchMetadata(url, settings.fetchTimeoutMs),
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: "METADATA_FETCH",
            message:
              error instanceof Error ? error.message : "获取失败，请手动填写",
          },
        },
        { status: 422 },
      );
    }
  } catch (error) {
    return apiError(error);
  }
}
