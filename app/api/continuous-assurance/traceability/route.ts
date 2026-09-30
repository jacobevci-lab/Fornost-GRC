import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { ensureAssuranceWorkSchema } from "../../../continuous-assurance-runtime";
import { ensureFindingsSchemaCompatibility } from "../../findings/schema-compat";

type Env = Record<string, unknown> & { DB: D1Database };

type TraceabilityRow = {
  work_item_id: string;
  finding_id: string;
  result_ref: string;
  completed_at: string | null;
  enterprise_id: string | null;
  enterprise_code: string | null;
  enterprise_status: string | null;
  evidence_reference: string | null;
  verification_evidence_reference: string | null;
  recurrence_count: number | null;
};

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

  const env = await runtime();
  await ensureAssuranceWorkSchema(env.DB);
  await ensureFindingsSchemaCompatibility(env.DB);

  try {
    const result = await env.DB.prepare(`
      SELECT
        w.id AS work_item_id,
        w.finding_id,
        w.result_ref,
        w.completed_at,
        ef.id AS enterprise_id,
        ef.code AS enterprise_code,
        ef.status AS enterprise_status,
        ef.evidence_reference,
        ef.verification_evidence_reference,
        ef.recurrence_count
      FROM continuous_assurance_work_items w
      LEFT JOIN enterprise_findings ef ON ef.id = w.result_ref
      WHERE w.action = 'capa-promotion'
        AND w.status = 'completed'
        AND w.result_ref IS NOT NULL
        AND TRIM(w.result_ref) != ''
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC
      LIMIT 500
    `).all<TraceabilityRow>();

    const items = result.results.map((row) => ({
      workItemId: row.work_item_id,
      findingId: row.finding_id,
      resultRef: row.result_ref,
      completedAt: row.completed_at || "",
      enterpriseFinding: row.enterprise_id ? {
        id: row.enterprise_id,
        code: row.enterprise_code || "",
        status: row.enterprise_status || "",
        evidenceReference: row.evidence_reference || "",
        verificationEvidenceReference: row.verification_evidence_reference || "",
        recurrenceCount: Math.max(0, Number(row.recurrence_count || 0)),
      } : null,
    }));

    return json({
      available: true,
      items,
      summary: {
        total: items.length,
        linked: items.filter((item) => Boolean(item.enterpriseFinding)).length,
        unresolved: items.filter((item) => !item.enterpriseFinding).length,
      },
    });
  } catch {
    return json({
      available: false,
      items: [],
      summary: { total: 0, linked: 0, unresolved: 0 },
      error: "CAPA traceability projection is temporarily unavailable.",
    }, 503);
  }
}
