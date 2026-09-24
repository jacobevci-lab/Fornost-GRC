import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { ensureAssuranceWorkSchema } from "../../../continuous-assurance-runtime";
import { buildContinuousAssuranceDashboard, type AssuranceFindingSnapshot, type AssuranceRuleSnapshot, type AssuranceWorkSnapshot } from "../../../continuous-assurance-dashboard";

type Env = Record<string, unknown> & { DB: D1Database };
type RuleRow = {
  id: string;
  name: string;
  control_refs: string;
  enabled: number;
  last_status: string | null;
  last_evidence_at: string | null;
  freshness_hours: number;
  consecutive_failures: number;
  next_run_at: string | null;
};
type FindingRow = {
  id: string;
  rule_id: string;
  title: string;
  severity: string;
  owner: string;
  due_date: string;
  status: string;
};
type WorkRow = {
  id: string;
  finding_id: string;
  rule_id: string;
  action: string;
  status: string;
  decision_json: string;
  actor: string;
  reviewed_by: string | null;
  updated_at: string;
};

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Env;
}
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const parse = (value: string | null | undefined) => {
  try { return JSON.parse(value || "{}") as Record<string, unknown>; }
  catch { return {}; }
};
const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function targetControlRef(value: string) {
  const decision = parse(value);
  const candidate = asObject(decision.candidate);
  const lineage = asObject(candidate.lineage);
  const payload = asObject(candidate.payload);
  return String(payload.controlRef || lineage.controlRef || decision.targetControlRef || decision.controlRef || "");
}

async function loadRules(db: D1Database): Promise<AssuranceRuleSnapshot[]> {
  try {
    const rows = await db.prepare("SELECT id,name,control_refs,enabled,last_status,last_evidence_at,freshness_hours,consecutive_failures,next_run_at FROM evidence_automation_rules ORDER BY name").all<RuleRow>();
    return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      controlRefs: row.control_refs || "",
      enabled: !!row.enabled,
      lastStatus: row.last_status,
      lastEvidenceAt: row.last_evidence_at,
      freshnessHours: Number(row.freshness_hours || 24),
      consecutiveFailures: Number(row.consecutive_failures || 0),
      nextRunAt: row.next_run_at,
    }));
  } catch { return []; }
}

async function loadFindings(db: D1Database): Promise<AssuranceFindingSnapshot[]> {
  try {
    const rows = await db.prepare("SELECT id,rule_id,title,severity,owner,due_date,status FROM evidence_automation_findings ORDER BY due_date,updated_at DESC LIMIT 1000").all<FindingRow>();
    return rows.results.map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      title: row.title,
      severity: row.severity,
      owner: row.owner,
      dueDate: row.due_date,
      status: row.status,
    }));
  } catch { return []; }
}

async function loadWork(db: D1Database): Promise<AssuranceWorkSnapshot[]> {
  try {
    await ensureAssuranceWorkSchema(db);
    const rows = await db.prepare("SELECT id,finding_id,rule_id,action,status,decision_json,actor,reviewed_by,updated_at FROM continuous_assurance_work_items ORDER BY updated_at DESC LIMIT 1000").all<WorkRow>();
    return rows.results.map((row) => ({
      id: row.id,
      findingId: row.finding_id,
      ruleId: row.rule_id,
      action: row.action,
      status: row.status,
      targetControlRef: targetControlRef(row.decision_json),
      actor: row.actor,
      reviewedBy: row.reviewed_by || "",
      updatedAt: row.updated_at,
    }));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const env = await runtime();
  const [rules, findings, workItems] = await Promise.all([
    loadRules(env.DB),
    loadFindings(env.DB),
    loadWork(env.DB),
  ]);
  const dashboard = buildContinuousAssuranceDashboard({ rules, findings, workItems, now: new Date() });
  return json({ ...dashboard, dataQuality: {
    rulesAvailable: rules.length > 0,
    findingsAvailable: findings.length > 0,
    workQueueAvailable: workItems.length > 0,
  }});
}
