import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listWebsites,
  saveWebsite,
  trashWebsite,
  deleteWebsite,
} from "@/server/catalog";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return NextResponse.json(listWebsites());
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    return NextResponse.json(saveWebsite(await request.json()), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = z
      .object({
        id: z.string(),
        action: z.enum(["edit", "trash", "restore"]),
        data: z.unknown().optional(),
      })
      .parse(await request.json());
    const result =
      body.action === "edit"
        ? saveWebsite(body.data, body.id)
        : trashWebsite(body.id, body.action === "restore");
    return NextResponse.json(result ?? null);
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const { id } = z.object({ id: z.string() }).parse(await request.json());
    deleteWebsite(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
