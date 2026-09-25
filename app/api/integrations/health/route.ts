import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";

type Env = Record<string, unknown> & { DB: D1Database };
type HealthEvent = {
  kind: string;
  status: string;
  detail: string;
  created_at: string;
};

const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Env;

  try {
    const result = await runtime.DB.prepare(`
      SELECT kind,status,detail,created_at
      FROM (
        SELECT kind,status,detail,created_at,
          ROW_NUMBER() OVER (PARTITION BY kind ORDER BY created_at DESC, id DESC) AS row_rank
        FROM integration_events
        WHERE action='test'
      ) ranked
      WHERE row_rank=1
      ORDER BY created_at DESC
    `).all<HealthEvent>();

    const latest: Record<string, { status: string; detail: string; testedAt: string }> = {};
    for (const row of result.results) {
      latest[row.kind] = {
        status: row.status === "success" ? "success" : "error",
        detail: row.detail,
        testedAt: row.created_at,
      };
    }

    return json({ health: latest });
  } catch {
    // A fresh deployment can briefly reach this read endpoint before the
    // integration settings route has established its compatibility tables.
    // Return unknown health rather than inventing a healthy state.
    return json({ health: {}, available: false });
  }
}
