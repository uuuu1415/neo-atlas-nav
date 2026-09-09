import { getConnection } from "@/server/database";
import { settingsStore } from "@/server/settings";
import { exportBackup } from "@/server/transfer";
import { apiError } from "@/server/http";

export async function GET() {
  try {
    const backup = await exportBackup(getConnection(), settingsStore);
    return new Response(JSON.stringify(backup, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="neo-atlas-${backup.exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
