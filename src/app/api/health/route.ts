import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/database";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    getDatabase().get(sql`select 1`);
    return NextResponse.json({ status: "ok", version: "0.1.0" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
