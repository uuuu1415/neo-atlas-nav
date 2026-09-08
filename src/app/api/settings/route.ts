import { NextResponse } from "next/server";
import { settingsStore } from "@/server/settings";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(await settingsStore.read()); } catch (error) { return apiError(error); } }
export async function PUT(request: Request) { try { return NextResponse.json(await settingsStore.save(await request.json())); } catch (error) { return apiError(error); } }
