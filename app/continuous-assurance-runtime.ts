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

const workSchema = [
  `CREATE TABLE IF NOT EXISTS continuous_assurance_work_items(id TEXT PRIMARY KEY,finding_id TEXT NOT NULL,rule_id TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,decision_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,actor TEXT NOT NULL)`,
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

async function addMissingColumns(db: D1Database, table: string, columns: Record<string, string>) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const present = new Set(info.results.map((row) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!present.has(name)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
  }
}

export async function ensureAssuranceWorkSchema(db: D1Database) {
  for (const sql of workSchema) await db.prepare(sql).run();
  await addMissingColumns(db, "continuous_assurance_work_items", workColumns);
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

async function updateLinkedRiskAfterRetest(db: D1Database, findingId: string, status: AssuranceRunStatus, runId: string, at: string) {
  try {
    const record = await db.prepare("SELECT data_json FROM simple_grc_records WHERE id=? AND module='Risk Assessment'").bind(findingId).first<{ data_json: string }>();
    if (!record) return;
    const data = JSON.parse(record.data_json || "{}") as Record<string, unknown>;
    const inherentLikelihood = asNumber(data.inherentLikelihood ?? data.likelihood, 4);
    const inherentImpact = asNumber(data.inherentImpact ?? data.impact ?? data.calculatedImpact, 4);
    const previousResidualLikelihood = asNumber(data.residualLikelihood, inherentLikelihood);
    const residualLikelihood = status === "pass" ? Math.max(1, inherentLikelihood - 2) : status === "fail" ? inherentLikelihood : previousResidualLikelihood;
    const residualImpact = asNumber(data.residualImpact, inherentImpact);
    const residualScore = Math.max(1, Math.round(residualLikelihood * residualImpact));
    data.residualLikelihood = String(residualLikelihood);
    data.residualImpact = String(residualImpact);
    data.residualScore = String(residualScore);
    data.residualRiskLevel = residualLevel(residualScore);
    data.assuranceState = status === "pass" ? "effective" : status === "fail" ? "ineffective" : "degraded";
    data.lastReassessedAt = at;
    data.lastAssuranceRunRef = runId;
    data.reassessmentSource = "Continuous Assurance";
    data.reassessmentReason = status === "pass"
      ? "Verified remediation passed the post-closure control re-test."
      : status === "fail"
        ? "Post-closure control re-test failed; residual exposure returned to the inherent baseline."
        : "Post-closure control re-test returned an execution error; residual exposure was not reduced.";
    await db.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(data), at, findingId).run();
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
