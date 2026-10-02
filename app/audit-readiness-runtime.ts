import { buildAuditEvidenceAssurance } from './audit-evidence-assurance';
import { auditRowsInScope, buildAuditReadiness, type AuditReadinessRow } from './audit-readiness';
import { loadContinuousAssuranceSnapshots } from './continuous-assurance-store';

export async function loadAuditReadiness(db: D1Database, auditName = '', now = new Date()) {
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
  const requirements = buildAuditEvidenceAssurance(auditRowsInScope(rows, auditName), [], now).requirements;
  const sources = await loadContinuousAssuranceSnapshots(db, { integrityControlRefs: requirements.map(item => item.reference) });
  return buildAuditReadiness({ rows, auditName, sources, recordsAvailable, recordsComplete, now });
}
