import { NextResponse } from "next/server";
import { z } from "zod";
import { listCategories, addCategory } from "@/server/catalog";
import { apiError } from "@/server/http";
import { getDatabase } from "@/server/database";
import { changeCategory } from "@/server/catalog-management";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request) {
  try {
    return NextResponse.json(
      changeCategory(getDatabase(), await request.json()),
    );
  } catch (error) {
    return apiError(error);
  }
}
export function GET() {
  try {
    return NextResponse.json(listCategories());
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await request.json());
    return NextResponse.json(addCategory(name), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
