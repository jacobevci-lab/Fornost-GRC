import { sameOrigin } from "../auth/security";
import { JsonBodyError, readBoundedJsonObject } from "../request-body";
import { NextRequest, NextResponse } from "next/server";
import { GET as coreGET, POST as corePOST } from "./core";

type Env = { DB: D1Database };
type RunPayload = Record<string, unknown> & {
  ruleId?: string;
  evidenceId?: string;
  status?: string;
  failures?: number;
};
type AutomationGetPayload = Record<string, unknown> & {
  runs?: Array<Record<string, unknown>>;
};

const text = (value: unknown) => String(value ?? "").trim();

/**
 * Adds the authoritative rule ID to each recent run returned by the core API.
 * Consumers must not join runs to sources by display names because connector
 * names and rule names are not identity fields.
 */
export async function GET(req: NextRequest) {
  const response = await coreGET(req);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => ({})) as AutomationGetPayload;
  const runs = Array.isArray(payload.runs) ? payload.runs : [];
  if (!runs.length) return response;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Env;
  const rows = await runtime.DB.prepare(
    "SELECT id,rule_id FROM evidence_automation_runs ORDER BY created_at DESC LIMIT 100",
  ).all<{ id: string; rule_id: string }>();
  const ruleIds = new Map(rows.results.map((row) => [text(row.id), text(row.rule_id)]));

  return NextResponse.json(
    { ...payload, runs: runs.map((run) => ({ ...run, ruleId: ruleIds.get(text(run.id)) || "" })) },
    { status: response.status, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Decorates the evidence-automation core response with the exact finding ID
 * touched by a manual onboarding run. The UI must never derive or fabricate
 * finding identifiers from a rule ID; it consumes this response directly.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await readBoundedJsonObject(req.clone(), 65_536); }
  catch (error) { if (error instanceof JsonBodyError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
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
