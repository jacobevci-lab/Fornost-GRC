import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { loadContinuousAssuranceOperationsHealth } from "../../../evidence/operations-health";

type Env = Record<string, unknown> & { DB: D1Database };

const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Env;
  const now = new Date();

  try {
    return json(await loadContinuousAssuranceOperationsHealth(runtime.DB, now));
  } catch {
    return json({
      generatedAt: now.toISOString(),
      windowHours: 24,
      available: false,
      summary: null,
      connectors: [],
    });
  }
}
