import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SettingsConflictError } from "./settings";
export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION", message: error.issues[0]?.message ?? "输入无效" } }, { status: 400 });
  if (error instanceof SettingsConflictError) return NextResponse.json({ error: { code: "CONFLICT", message: error.message } }, { status: 409 });
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "操作失败，请稍后重试" } }, { status: 500 });
}
