import { NextResponse } from "next/server";
import { getDatabase } from "@/server/database";
import { applyBatch } from "@/server/catalog-management";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    return NextResponse.json(applyBatch(getDatabase(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
