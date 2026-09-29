import { NextRequest, NextResponse } from "next/server";
import { GET as coreGET, POST as corePOST } from "./core";

type Env = { DB: D1Database };
type RunPayload = Record<string, unknown> & {
  ruleId?: string;
  evidenceId?: string;
  status?: string;
  failures?: number;
};

const text = (value: unknown) => String(value ?? "").trim();

export const GET = coreGET;

/**
 * Decorates the evidence-automation core response with the exact finding ID
 * touched by a manual onboarding run. The UI must never derive or fabricate
 * finding identifiers from a rule ID; it consumes this response directly.
 */
export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action);
  const response = await corePOST(req);

  if (action !== "run-rule" || !response.ok) return response;

  const payload = await response.clone().json().catch(() => ({})) as RunPayload;
  const ruleId = text(payload.ruleId);
  if (!ruleId) return response;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Env;
  const evidenceId = text(payload.evidenceId);
  let findingId = "";

  if (evidenceId) {
    const finding = await runtime.DB.prepare(
      "SELECT id FROM evidence_automation_findings WHERE rule_id=? AND evidence_id=? AND status!='closed' ORDER BY updated_at DESC LIMIT 1",
    ).bind(ruleId, evidenceId).first<{ id: string }>();
    findingId = text(finding?.id);
  } else if (text(payload.status) === "error") {
    const rule = await runtime.DB.prepare(
      "SELECT auto_finding,failure_threshold FROM evidence_automation_rules WHERE id=?",
    ).bind(ruleId).first<{ auto_finding: number; failure_threshold: number }>();
    const failures = Number(payload.failures ?? 0);
    const threshold = Number(rule?.failure_threshold ?? Number.POSITIVE_INFINITY);

    // Error runs have no evidence row. Only expose an open finding when this
    // exact run crossed the configured threshold, which guarantees corePOST
    // invoked upsertFinding for this rule during this request.
    if (rule?.auto_finding && failures >= threshold) {
      const finding = await runtime.DB.prepare(
        "SELECT id FROM evidence_automation_findings WHERE rule_id=? AND status!='closed' ORDER BY updated_at DESC LIMIT 1",
      ).bind(ruleId).first<{ id: string }>();
      findingId = text(finding?.id);
    }
  }

  return NextResponse.json(
    { ...payload, findingId },
    { status: response.status, headers: { "cache-control": "no-store" } },
  );
}
