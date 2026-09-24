import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { buildContinuousAssuranceDashboard } from "../../../continuous-assurance-dashboard";
import { loadContinuousAssuranceSnapshots } from "../../../continuous-assurance-store";

type Env = Record<string, unknown> & { DB: D1Database };

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Env;
}
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const env = await runtime();
  const snapshots = await loadContinuousAssuranceSnapshots(env.DB);
  const dashboard = buildContinuousAssuranceDashboard({
    rules: snapshots.rules,
    findings: snapshots.findings,
    workItems: snapshots.workItems,
    now: new Date(),
  });
  return json({ ...dashboard, dataQuality: snapshots.dataQuality });
}
