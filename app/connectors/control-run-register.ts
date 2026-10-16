import { sameDomainModule } from '../domain-identity';
import { parseControlRunId, validControlRun, type ControlRunRecord } from './control-run-contract';

export class InvalidStoredControlRun extends Error {}

/** One exact historical run, independent of the bounded recent-run list and current rule. */
export async function readControlRun(db: D1Database, id: string): Promise<ControlRunRecord | null> {
  const runId = parseControlRunId(id);
  if (!runId) throw new Error('Run identity required.');
  const row = await db.prepare(`SELECT r.id,r.rule_id,r.rule_name,r.source_name,r.status,r.score,r.detail,r.created_at,r.trigger_type,r.duration_ms,r.error_code,r.evidence_id,r.assessment_json,e.module AS evidence_module
    FROM evidence_automation_runs r LEFT JOIN simple_grc_records e ON e.id=r.evidence_id WHERE r.id=?`).bind(runId).first<Record<string, unknown>>();
  if (!row) return null;
  let assessment: unknown = null;
  if (row.assessment_json !== null) {
    try { assessment = JSON.parse(String(row.assessment_json)); }
    catch { throw new InvalidStoredControlRun('Stored run diagnostics are invalid.'); }
    if (assessment === null) throw new InvalidStoredControlRun('Stored run diagnostics are invalid.');
  }
  const evidenceId = row.evidence_id === null || row.evidence_id === '' ? null : row.evidence_id;
  const run = {
    id: row.id, ruleId: row.rule_id, ruleName: row.rule_name, sourceName: row.source_name,
    status: row.status, score: row.score, detail: row.detail, createdAt: row.created_at,
    triggerType: row.trigger_type, durationMs: row.duration_ms, errorCode: row.error_code,
    evidenceId, evidenceState: evidenceId === null ? 'none' : typeof row.evidence_module === 'string' && sameDomainModule(row.evidence_module, 'Kanıtlar') ? 'available' : 'missing', assessment,
  };
  if (!validControlRun(run, runId)) throw new InvalidStoredControlRun('Stored run details are invalid.');
  return run;
}
