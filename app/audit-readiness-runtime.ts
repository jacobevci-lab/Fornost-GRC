import { loadEvidenceAssuranceSnapshot } from './evidence/assurance-runtime';
import type { EvidenceAssuranceSnapshot } from './evidence/assurance-snapshot';
import { buildAuditEvidenceAssurance } from './audit-evidence-assurance';
import { auditRowsInScope, buildAuditReadiness, type AuditReadinessRow, type AuditReadinessIssue } from './audit-readiness';
import { loadContinuousAssuranceSnapshots } from './continuous-assurance-store';
import { buildContinuousAssuranceDashboard } from './continuous-assurance-dashboard';

/** Reuse one bounded read and signal projection for every engagement in a portfolio. */
export async function loadAuditReadinessContext(db: D1Database, now = new Date(), evidenceSnapshot?: EvidenceAssuranceSnapshot) {
  let rows: AuditReadinessRow[] = [], recordsAvailable = true, recordsComplete = true;
  try {
    const result = await db.prepare("SELECT id,module,data_json FROM simple_grc_records WHERE module IN ('Denetim Yönetimi','Kanıtlar') ORDER BY id LIMIT 10001").all<{ id: string; module: string; data_json: string }>();
    recordsComplete = result.results.length <= 10000;
    rows = result.results.slice(0, 10000).flatMap(row => {
      try {
        const data = JSON.parse(row.data_json);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid-record');
        return [{ id: row.id, module: row.module, data }];
      } catch { recordsComplete = false; return []; }
    });
  } catch { recordsAvailable = false; recordsComplete = false; }
  const requirements = buildAuditEvidenceAssurance(auditRowsInScope(rows, ''), [], now).requirements;
  const [sources, evidence] = await Promise.all([
    loadContinuousAssuranceSnapshots(db, { integrityControlRefs: requirements.map(item => item.reference),now }),
    evidenceSnapshot || loadEvidenceAssuranceSnapshot(db, now),
  ]);
  const projected = new Map(evidence.rows.map(row => [row.id, row]));
  const additionalIssues: AuditReadinessIssue[] = [];
  for (const issue of evidence.issues) {
    additionalIssues.push(issue === 'assessment-unavailable' ? issue : issue.startsWith('integrity-') ? 'integrity-incomplete'
      : issue === 'evidence-unavailable' ? 'integrity-unavailable' : 'records-incomplete');
  }
  rows = rows.map(row => {
    if (row.module !== 'Kanıtlar') return row;
    const canonical = projected.get(row.id);
    if (!canonical) { recordsComplete = false; return { ...row, data: { ...row.data, evidenceIntegrity: 'unavailable' } }; }
    return canonical;
  });
  const priorities = buildContinuousAssuranceDashboard({ ...sources, now, priorityLimit: null }).priorities;
  return { rows, sources, recordsAvailable, recordsComplete, additionalIssues, priorities, now };
}

export async function loadAuditReadiness(db: D1Database, auditName = '', now = new Date()) {
  return buildAuditReadiness({ ...await loadAuditReadinessContext(db, now), auditName });
}
