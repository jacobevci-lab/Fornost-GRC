import { parseTraceabilityWorkIds, readCapaTraceability } from "../../../capa-traceability-store";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { ensureAssuranceWorkSchema } from "../../../continuous-assurance-runtime";
import { ensureFindingsSchemaCompatibility } from "../../findings/schema-compat";

type Env = Record<string, unknown> & { DB: D1Database };

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Env;
}

const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;

  let workIds: string[] | undefined;
  try { workIds = parseTraceabilityWorkIds(req.nextUrl.searchParams.get("workIds")); } catch { return json({error:"Invalid traceability work IDs."},400); }
  const env = await runtime();
  await ensureAssuranceWorkSchema(env.DB);
  await ensureFindingsSchemaCompatibility(env.DB);

  try {
    const {items,coverage} = await readCapaTraceability(env.DB,workIds);
    return json({available:true,items,coverage,summary:{total:items.length,linked:items.filter(item=>Boolean(item.enterpriseFinding)).length,unresolved:items.filter(item=>!item.enterpriseFinding).length}});
  } catch {
    return json({
      available: false,
      items: [],
      summary: { total: 0, linked: 0, unresolved: 0 },
      error: "CAPA traceability projection is temporarily unavailable.",
    }, 503);
  }
}
