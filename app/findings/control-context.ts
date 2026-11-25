import type { ControlAssessment } from '../connectors/control-templates';
import { evidenceFreshness } from '../evidence/continuous-controls';

export type ContextRun = {
  id: string; ruleName: string; status: string; detail: string; evidenceId: string | null;
  createdAt: string; errorCode: string | null; assessment: ControlAssessment | null;
  diagnostics: 'available' | 'legacy' | 'unavailable';
};
export type FindingControlContext = {
  state: 'available';
  rule: { id: string; name: string; enabled: boolean; freshnessHours: number };
  automationFinding: { id: string; status: string; occurrenceCount: number };
  baseline: ContextRun | null; latest: ContextRun | null;
  freshness: ReturnType<typeof evidenceFreshness>;
} | { state: 'not-applicable' | 'lineage-unavailable' | 'source-unavailable' };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function parse(value: string) { try { return object(JSON.parse(value)); } catch { return {}; } }

// Stored JSON is not a public response contract. Project only validated diagnostic fields;
// never return connector config, credentials, raw snapshots or arbitrary provider attributes.
export function readControlAssessment(raw: string | null): ControlAssessment | null {
  if (!raw || raw.length > 250_000) return null;
  const value = parse(raw), counts = [value.total, value.passed, value.failed, value.unknown];
  if (typeof value.templateId !== 'string' || !Number.isInteger(value.templateVersion) || Number(value.templateVersion) < 1
    || !['pass', 'fail', 'error'].includes(String(value.status)) || value.scope !== 'credential-visible'
    || counts.some(n => !Number.isSafeInteger(n) || Number(n) < 0)
    || Number(value.total) !== Number(value.passed) + Number(value.failed) + Number(value.unknown)
    || !Number.isFinite(value.score) || Number(value.score) < 0 || Number(value.score) > 100
    || typeof value.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(value.evaluatedAt))
    || !Array.isArray(value.issues) || typeof value.issuesTruncated !== 'boolean') return null;
  if (value.status === 'pass' && (!value.total || value.failed !== 0 || value.unknown !== 0)) return null;
  if (value.status === 'fail' && !value.failed) return null;
  const issues: ControlAssessment['issues'] = [];
  for (const entry of value.issues.slice(0, 100)) {
    const item = object(entry);
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.reason !== 'string'
      || (item.status !== 'fail' && item.status !== 'unknown')) return null;
    issues.push({ id: item.id.slice(0, 240), name: item.name.slice(0, 240), reason: item.reason.slice(0, 160), status: item.status });
  }
  return { templateId: value.templateId.slice(0, 80), templateVersion: Number(value.templateVersion),
    status: value.status as ControlAssessment['status'], total: Number(value.total), passed: Number(value.passed),
    failed: Number(value.failed), unknown: Number(value.unknown), score: Number(value.score),
    evaluatedAt: value.evaluatedAt, scope: 'credential-visible', issues,
    issuesTruncated: value.issuesTruncated || value.issues.length > 100 };
}

type RunRow = { id: string; rule_name: string; status: string; detail: string; evidence_id: string | null;
  created_at: string; error_code: string | null; assessment_json: string | null; response_hash: string };
const runColumns = 'id,rule_name,status,detail,evidence_id,created_at,error_code,assessment_json,response_hash';
function run(row: RunRow | null): ContextRun | null {
  if (!row) return null;
  const parsed = readControlAssessment(row.assessment_json);
  const assessment = parsed?.status === row.status ? parsed : null;
  return { id: row.id, ruleName: row.rule_name, status: row.status, detail: row.detail.slice(0, 2000),
    evidenceId: row.evidence_id, createdAt: row.created_at, errorCode: row.error_code,
    assessment, diagnostics: assessment ? 'available' : row.assessment_json ? 'unavailable' : 'legacy' };
}

export async function loadFindingControlContext(db: D1Database, findingId: string, now = new Date()): Promise<FindingControlContext | null> {
  const finding = await db.prepare('SELECT source_type,source_ref,control_ref FROM enterprise_findings WHERE id=?')
    .bind(findingId).first<{ source_type: string; source_ref: string; control_ref: string }>();
  if (!finding) return null;
  if (finding.source_type !== 'continuous-control') return { state: 'not-applicable' };
  // The submit workflow changes enterprise_findings.evidence_reference. Use the immutable
  // promotion event and its approved work item, never the most recent finding for a rule.
  const origin = await db.prepare("SELECT evidence_reference,evidence_sha256 FROM enterprise_finding_events WHERE finding_id=? AND action='continuous-assurance-promotion' ORDER BY created_at,rowid LIMIT 1")
    .bind(findingId).first<{ evidence_reference: string; evidence_sha256: string }>();
  if (!origin?.evidence_reference || !/^[a-f0-9]{64}$/i.test(origin.evidence_sha256 || '')) return { state: 'lineage-unavailable' };
  const work = await db.prepare("SELECT finding_id,rule_id,decision_json FROM continuous_assurance_work_items WHERE action='capa-promotion' AND status='completed' AND result_ref=? ORDER BY completed_at,rowid LIMIT 51")
    .bind(findingId).all<{ finding_id: string; rule_id: string; decision_json: string }>();
  if (work.results.length > 50) return { state: 'lineage-unavailable' };
  const matching = work.results.filter(item => {
    const candidate = object(parse(item.decision_json).candidate), lineage = object(candidate.lineage);
    return item.rule_id === finding.source_ref && lineage.automationRuleRef === item.rule_id
      && lineage.automationFindingRef === item.finding_id && lineage.controlRef === finding.control_ref
      && lineage.originEvidenceReference === origin.evidence_reference
      && String(lineage.originEvidenceSha256).toLowerCase() === origin.evidence_sha256.toLowerCase();
  });
  if (!matching.length || new Set(matching.map(item => item.finding_id)).size !== 1) return { state: 'lineage-unavailable' };
  const [rule, automationFinding] = await Promise.all([
    db.prepare('SELECT id,name,enabled,freshness_hours FROM evidence_automation_rules WHERE id=?').bind(finding.source_ref)
      .first<{ id: string; name: string; enabled: number; freshness_hours: number }>(),
    db.prepare('SELECT id,status,occurrence_count FROM evidence_automation_findings WHERE id=? AND rule_id=?').bind(matching[0].finding_id, finding.source_ref)
      .first<{ id: string; status: string; occurrence_count: number }>(),
  ]);
  if (!rule || !automationFinding) return { state: 'source-unavailable' };
  const [baselineRow, latestRow] = await Promise.all([
    db.prepare(`SELECT ${runColumns} FROM evidence_automation_runs WHERE rule_id=? AND evidence_id=? AND lower(response_hash)=? ORDER BY created_at DESC,rowid DESC LIMIT 1`)
      .bind(rule.id, origin.evidence_reference, origin.evidence_sha256.toLowerCase()).first<RunRow>(),
    db.prepare(`SELECT ${runColumns} FROM evidence_automation_runs WHERE rule_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).bind(rule.id).first<RunRow>(),
  ]);
  return { state: 'available', rule: { id: rule.id, name: rule.name, enabled: !!rule.enabled, freshnessHours: rule.freshness_hours },
    automationFinding: { id: automationFinding.id, status: automationFinding.status, occurrenceCount: automationFinding.occurrence_count },
    baseline: run(baselineRow), latest: run(latestRow),
    freshness: evidenceFreshness(latestRow?.evidence_id ? latestRow.created_at : null, rule.freshness_hours, now) };
}
