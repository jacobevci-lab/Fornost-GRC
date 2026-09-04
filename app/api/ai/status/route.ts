import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime, getAiSettings } from "@/app/ai/storage";

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), row = await getAiSettings(env.DB);
  return NextResponse.json({
    configured: !!row,
    enabled: !!row?.enabled,
    provider: row?.provider || null,
    model: row?.model || null,
    mode: "read-only-copilot",
  }, { headers: { "cache-control": "no-store" } });
}
