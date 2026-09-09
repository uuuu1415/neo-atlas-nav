import { NextResponse } from "next/server";
import { getConnection } from "@/server/database";
import { settingsStore } from "@/server/settings";
import { applyTransfer } from "@/server/transfer";
import { readTransferRequest } from "@/server/transfer-http";
import { apiError } from "@/server/http";

export async function POST(request: Request) {
  try {
    const input = await readTransferRequest(request);
    return NextResponse.json(
      await applyTransfer(getConnection(), settingsStore, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
