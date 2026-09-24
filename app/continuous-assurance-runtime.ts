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
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function residualLevel(score: number) {
  if (score >= 16) return "Kritik";
  if (score >= 10) return "Yüksek";
  if (score >= 5) return "Orta";
  return "Düşük";
}

export function buildResidualRiskReassessment(data: Record<string, unknown>, status: AssuranceRunStatus, runId: string, at: string) {
  const inherentLikelihood = asNumber(data.inherentLikelihood ?? data.likelihood, 4);
  const inherentImpact = asNumber(data.inherentImpact ?? data.impact ?? data.calculatedImpact, 4);
  const hasApprovedResidualLikelihood = Number.isFinite(Number(data.residualLikelihood)) && Number(data.residualLikelihood) > 0;
  const hasApprovedResidualImpact = Number.isFinite(Number(data.residualImpact)) && Number(data.residualImpact) > 0;
  const previousResidualLikelihood = hasApprovedResidualLikelihood ? Number(data.residualLikelihood) : inherentLikelihood;
  const previousResidualImpact = hasApprovedResidualImpact ? Number(data.residualImpact) : inherentImpact;

  // A passing automated control proves the assurance signal recovered; it does not, by itself,
  // justify inventing a new risk-reduction factor. Preserve an already approved residual rating.
  // If no residual rating exists, remain at the inherent baseline and require human reassessment.
  const residualLikelihood = status === "fail" ? inherentLikelihood : previousResidualLikelihood;
  const residualImpact = status === "fail" ? inherentImpact : previousResidualImpact;
  const residualScore = Math.max(1, Math.round(residualLikelihood * residualImpact));
  const reviewRequired = status !== "pass" || !hasApprovedResidualLikelihood || !hasApprovedResidualImpact;
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
        ? "Verified remediation passed the post-closure control re-test; the previously approved residual rating was preserved."
        : "Verified remediation passed the post-closure control re-test; no approved residual rating existed, so no automatic risk reduction was inferred."
      : status === "fail"
        ? "Post-closure control re-test failed; residual exposure returned to the inherent baseline and requires risk-owner review."
        : "Post-closure control re-test returned an execution error; residual exposure was not reduced and requires review.",
  };
}

async function updateLinkedRiskAfterRetest(db: D1Database, findingId: string, status: AssuranceRunStatus, runId: string, at: string) {
  try {
    const record = await db.prepare("SELECT data_json FROM simple_grc_records WHERE id=? AND module='Risk Assessment'").bind(findingId).first<{ data_json: string }>();
    if (!record) return;
    const data = JSON.parse(record.data_json || "{}") as Record<string, unknown>;
    const reassessed = buildResidualRiskReassessment(data, status, runId, at);
    await db.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(reassessed), at, findingId).run();
  } catch {
    // Risk linkage is best-effort here; the work item still records the re-test outcome for investigation.
  }
}

async function reopenAutomationFindingAfterFailedRetest(db: D1Database, findingId: string, at: string) {
  try {
    await db.prepare("UPDATE evidence_automation_findings SET status='acknowledged',occurrence_count=occurrence_count+1,updated_at=? WHERE id=? AND status='closed'").bind(at, findingId).run();
  } catch {
    // Older deployments may not have the automation finding table yet.
  }
}

export async function reconcileApprovedRetests(db: D1Database, now = new Date()) {
  await ensureAssuranceWorkSchema(db);
  const approved = await db.prepare("SELECT * FROM continuous_assurance_work_items WHERE action='control-retest' AND status='approved-awaiting-retest' ORDER BY reviewed_at,created_at LIMIT 200").all<AssuranceWorkRow>();
  let reconciled = 0;
  for (const item of approved.results) {
    const since = item.reviewed_at || item.updated_at || item.created_at;
    let run: { id: string; status: string; evidence_id: string | null; created_at: string } | null = null;
    try {
      run = await db.prepare("SELECT id,status,evidence_id,created_at FROM evidence_automation_runs WHERE rule_id=? AND created_at>? ORDER BY created_at ASC LIMIT 1").bind(item.rule_id, since).first<{ id: string; status: string; evidence_id: string | null; created_at: string }>();
    } catch {
      continue;
    }
    if (!run) continue;
    const normalized: AssuranceRunStatus = run.status === "pass" ? "pass" : run.status === "fail" ? "fail" : "error";
    const finalStatus = normalized === "pass" ? "completed" : normalized === "fail" ? "failed-retest" : "retest-error";
    const at = run.created_at || now.toISOString();
    await db.prepare("UPDATE continuous_assurance_work_items SET status=?,result_ref=?,completed_at=?,updated_at=? WHERE id=? AND status='approved-awaiting-retest'").bind(finalStatus, run.id, at, at, item.id).run();
    await updateLinkedRiskAfterRetest(db, item.finding_id, normalized, run.id, at);
    if (normalized === "fail") await reopenAutomationFindingAfterFailedRetest(db, item.finding_id, at);
    reconciled += 1;
  }
  return reconciled;
}
