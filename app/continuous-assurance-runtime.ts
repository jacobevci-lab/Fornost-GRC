import { assessRetestRun, parseAssuranceObject, type RetestOutcome, type RetestRun } from "./assurance-retest";

export type AssuranceRunStatus = "pass" | "fail" | "error";

export type AssuranceWorkRow = {
  id: string;
  finding_id: string;
  rule_id: string;
  action: string;
  status: string;
  decision_json: string;
  created_at: string;
  updated_at: string;
  actor: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  result_ref?: string | null;
  completed_at?: string | null;
};

const createWorkTable = `CREATE TABLE IF NOT EXISTS continuous_assurance_work_items(id TEXT PRIMARY KEY,finding_id TEXT NOT NULL,rule_id TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,decision_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,actor TEXT NOT NULL)`;

const workIndexes = [
  `CREATE INDEX IF NOT EXISTS continuous_assurance_work_items_status_idx ON continuous_assurance_work_items(status,action,updated_at)`,
  `CREATE INDEX IF NOT EXISTS continuous_assurance_work_items_finding_idx ON continuous_assurance_work_items(finding_id,action,status)`,
];

const workColumns: Record<string, string> = {
  reviewed_by: "TEXT",
  reviewed_at: "TEXT",
  review_note: "TEXT",
  result_ref: "TEXT",
  completed_at: "TEXT",
};

async function tableHasColumn(db: D1Database, table: string, name: string) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return info.results.some((row) => row.name === name);
}

async function addMissingColumns(db: D1Database, table: string, columns: Record<string, string>) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const present = new Set(info.results.map((row) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (present.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
      present.add(name);
    } catch (error) {
      // D1/SQLite has no ADD COLUMN IF NOT EXISTS. Two cold-start requests can both
      // observe a legacy column as missing and race to add it; if the other request
      // won the race, re-read the schema and treat the migration as successful.
      if (await tableHasColumn(db, table, name)) {
        present.add(name);
        continue;
      }
      throw error;
    }
  }
}

export async function ensureAssuranceWorkSchema(db: D1Database) {
  await db.prepare(createWorkTable).run();
  await addMissingColumns(db, "continuous_assurance_work_items", workColumns);
  // Create indexes only after all legacy columns required by current queries exist.
  for (const sql of workIndexes) await db.prepare(sql).run();
}

function asNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : fallback;
}

function residualLevel(score: number) {
  if (score >= 16) return "Kritik";
  if (score >= 10) return "Yüksek";
  if (score >= 5) return "Orta";
  return "Düşük";
}

export function buildResidualRiskReassessment(data: Record<string, unknown>, status: AssuranceRunStatus, runId: string, at: string) {
  const inherentLikelihood = asNumber(data.inherentLikelihood ?? data.likelihood, 4);
  const inherentImpact = asNumber(data.inherentImpact ?? data.impact, 4);
  const hasApprovedResidualLikelihood = asNumber(data.residualLikelihood, 0) > 0;
  const hasApprovedResidualImpact = asNumber(data.residualImpact, 0) > 0;
  const previousResidualLikelihood = hasApprovedResidualLikelihood ? Number(data.residualLikelihood) : inherentLikelihood;
  const previousResidualImpact = hasApprovedResidualImpact ? Number(data.residualImpact) : inherentImpact;

  // A passing automated control proves the assurance signal recovered; it does not, by itself,
  // justify inventing a new risk-reduction factor. Preserve an already approved residual rating.
  // If no residual rating exists, remain at the inherent baseline and require human reassessment.
  const residualLikelihood = status === "fail" ? inherentLikelihood : previousResidualLikelihood;
  const residualImpact = status === "fail" ? inherentImpact : previousResidualImpact;
  const residualScore = Math.max(1, Math.round(residualLikelihood * residualImpact));
  const reviewRequired = status !== "pass" || data.residualRiskReviewRequired === true || !hasApprovedResidualLikelihood || !hasApprovedResidualImpact;
  const existingReviewRequestedAt = String(data.riskReviewRequestedAt || "").trim();
  return {
    ...data,
    residualLikelihood: String(residualLikelihood),
    residualImpact: String(residualImpact),
    residualScore: String(residualScore),
    residualRiskLevel: residualLevel(residualScore),
    assuranceState: status === "pass" ? "effective" : status === "fail" ? "ineffective" : "degraded",
    residualRiskReviewRequired: reviewRequired,
    riskReviewRequestedAt: reviewRequired ? existingReviewRequestedAt || at : "",
    riskReviewEscalationState: reviewRequired ? String(data.riskReviewEscalationState || "none") : "none",
    lastReassessedAt: at,
    lastAssuranceRunRef: runId,
    reassessmentSource: "Continuous Assurance",
    reassessmentReason: status === "pass"
      ? hasApprovedResidualLikelihood && hasApprovedResidualImpact
        ? "Verified remediation passed the post-closure control re-test; the previous residual rating and any pending independent review were preserved."
        : "Verified remediation passed the post-closure control re-test; no approved residual rating existed, so no automatic risk reduction was inferred."
      : status === "fail"
        ? "Post-closure control re-test failed; residual exposure returned to the inherent baseline and requires risk-owner review."
        : "Post-closure control re-test returned an execution error; residual exposure was not reduced and requires review.",
  };
}

type RetestFinding = { id: string; rule_id: string; status: string; closed_at: string | null; updated_at: string; closure_evidence_ref: string | null; closure_evidence_sha256: string | null };

export async function reconcileApprovedRetests(db: D1Database, now = new Date()) {
  await ensureAssuranceWorkSchema(db);
  const approved = await db.prepare("SELECT * FROM continuous_assurance_work_items WHERE action='control-retest' AND status='approved-awaiting-retest' ORDER BY reviewed_at,created_at LIMIT 200").all<AssuranceWorkRow>();
  let reconciled = 0;
  for (const item of approved.results) {
    const since = item.reviewed_at || item.updated_at || item.created_at;
    const run = await db.prepare("SELECT id,status,evidence_id,created_at,response_hash,detail,error_code FROM evidence_automation_runs WHERE rule_id=? AND created_at>? AND created_at<=? ORDER BY created_at ASC,rowid ASC LIMIT 1")
      .bind(item.rule_id, since, now.toISOString()).first<RetestRun>();
    if (!run) continue;
    const decision = parseAssuranceObject(item.decision_json) || {};
    const riskRef = typeof decision.riskRef === "string" && decision.riskRef ? decision.riskRef : item.finding_id;
    const [rule, finding, risk, evidence, active] = await Promise.all([
      db.prepare("SELECT freshness_hours FROM evidence_automation_rules WHERE id=?").bind(item.rule_id).first<{ freshness_hours: number }>(),
      db.prepare("SELECT id,rule_id,status,closed_at,updated_at,closure_evidence_ref,closure_evidence_sha256 FROM evidence_automation_findings WHERE id=?").bind(item.finding_id).first<RetestFinding>(),
      db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Risk Assessment'").bind(riskRef).first<{ id: string; data_json: string; updated_at: string }>(),
      run.evidence_id ? db.prepare("SELECT data_json FROM simple_grc_records WHERE id=? AND module='Kanıtlar'").bind(run.evidence_id).first<{ data_json: string }>() : Promise.resolve(null),
      db.prepare("SELECT id FROM evidence_automation_findings WHERE rule_id=? AND status!='closed'").bind(item.rule_id).first<{ id: string }>(),
    ]);
    const riskData = risk ? parseAssuranceObject(risk.data_json) : null;
    const assessment = assessRetestRun(run, evidence?.data_json || null, Number(rule?.freshness_hours), now);
    const outcome: RetestOutcome = { runId: run.id, testStatus: run.status, ...assessment,
      evidenceId: run.evidence_id, evaluatedAt: run.created_at, riskId: risk?.id || null,
      riskUpdate: !risk ? "missing" : !riskData ? "invalid" : Date.parse(String(riskData.lastReassessedAt || "")) > Date.parse(run.created_at) ? "newer-review-preserved" : "applied",
      findingAction: "none", followUpFindingId: null };
    if (!rule || !finding || finding.rule_id !== item.rule_id) { outcome.status = "error"; outcome.reason = "source-unavailable"; outcome.riskUpdate = "not-applied"; }
    else if (!risk) { outcome.status = "error"; outcome.reason = "risk-missing"; }
    else if (!riskData) { outcome.status = "error"; outcome.reason = "risk-data-invalid"; }
    if (outcome.status === "pass" && !(decision.source === "assurance-exception" && decision.mandatory === true)
      && (finding?.status !== "closed" || !finding.closure_evidence_ref || !/^[a-f0-9]{64}$/i.test(finding.closure_evidence_sha256 || ""))) {
      outcome.status = "error"; outcome.reason = "remediation-unverified";
    }
    const reopen = outcome.status === "fail" && finding?.status === "closed" && !active
      && (!finding.closed_at || finding.closed_at <= run.created_at);
    if (outcome.status === "fail") {
      if (active) { outcome.findingAction = "linked-open-finding"; outcome.followUpFindingId = active.id; }
      else if (reopen) { outcome.findingAction = "reopened"; outcome.followUpFindingId = item.finding_id; }
      else if (finding?.closed_at && finding.closed_at > run.created_at) outcome.findingAction = "newer-closure-preserved";
    }
    const finalStatus = outcome.status === "pass" ? "completed" : outcome.status === "fail" ? "failed-retest" : "retest-error";
    // A unique claim token plus snapshot guards make concurrent reconciliation idempotent.
    // A write failure rolls back the work status as well as the risk/finding changes.
    const token = crypto.randomUUID(), at = now.toISOString();
    const decisionJson = JSON.stringify({ ...decision, retestOutcome: outcome, reconciliationToken: token });
    const guards: string[] = [], guardValues: (string | number | null)[] = [];
    if (rule) { guards.push("EXISTS(SELECT 1 FROM evidence_automation_rules WHERE id=? AND freshness_hours=?)"); guardValues.push(item.rule_id, rule.freshness_hours); }
    else { guards.push("NOT EXISTS(SELECT 1 FROM evidence_automation_rules WHERE id=?)"); guardValues.push(item.rule_id); }
    if (evidence && run.evidence_id) { guards.push("EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Kanıtlar' AND data_json=?)"); guardValues.push(run.evidence_id, evidence.data_json); }
    else if (run.evidence_id) { guards.push("NOT EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Kanıtlar')"); guardValues.push(run.evidence_id); }
    if (risk) { guards.push("EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Risk Assessment' AND data_json=? AND updated_at=?)"); guardValues.push(risk.id, risk.data_json, risk.updated_at); }
    else { guards.push("NOT EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Risk Assessment')"); guardValues.push(riskRef); }
    if (finding) { guards.push("EXISTS(SELECT 1 FROM evidence_automation_findings WHERE id=? AND rule_id=? AND status=? AND updated_at=?)"); guardValues.push(finding.id, finding.rule_id, finding.status, finding.updated_at); }
    else { guards.push("NOT EXISTS(SELECT 1 FROM evidence_automation_findings WHERE id=?)"); guardValues.push(item.finding_id); }
    if (active) { guards.push("EXISTS(SELECT 1 FROM evidence_automation_findings WHERE rule_id=? AND id=? AND status!='closed')"); guardValues.push(item.rule_id, active.id); }
    else { guards.push("NOT EXISTS(SELECT 1 FROM evidence_automation_findings WHERE rule_id=? AND status!='closed')"); guardValues.push(item.rule_id); }
    const statements = [db.prepare(`UPDATE continuous_assurance_work_items SET status=?,result_ref=?,completed_at=?,updated_at=?,decision_json=? WHERE id=? AND status='approved-awaiting-retest' AND decision_json=? AND ${guards.join(" AND ")}`)
      .bind(finalStatus, run.id, at, at, decisionJson, item.id, item.decision_json, ...guardValues)];
    const claimed = "EXISTS(SELECT 1 FROM continuous_assurance_work_items WHERE id=? AND json_extract(decision_json,'$.reconciliationToken')=?)";
    if (risk && riskData && outcome.riskUpdate === "applied") {
      const reassessed = buildResidualRiskReassessment(riskData, outcome.status, run.id, run.created_at);
      statements.push(db.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND ${claimed}`)
        .bind(JSON.stringify(reassessed), at, risk.id, item.id, token));
    }
    if (reopen) statements.push(db.prepare(`UPDATE evidence_automation_findings SET status='acknowledged',evidence_id=?,detail=?,occurrence_count=occurrence_count+1,updated_at=? WHERE id=? AND status='closed' AND ${claimed}`)
      .bind(run.evidence_id, run.detail, at, item.finding_id, item.id, token));
    const results = await db.batch(statements);
    if (Number(results[0]?.meta?.changes || 0) > 0) reconciled += 1;
  }
  return reconciled;
}
