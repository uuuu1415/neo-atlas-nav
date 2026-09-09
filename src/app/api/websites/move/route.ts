import { NextResponse } from "next/server";
import { getDatabase } from "@/server/database";
import { moveWebsite } from "@/server/catalog-management";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    return NextResponse.json(moveWebsite(getDatabase(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
