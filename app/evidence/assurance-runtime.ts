import { isAutomatedEvidence } from './automation-identity';
import { projectAutomatedEvidence } from './assessment-projection';
import { historyIntegrity } from './history-overview';
import type { EvidenceVersionRow } from './versioning';
import type { EvidenceAssuranceSnapshot } from './assurance-snapshot';

/** Read-only, bounded evidence assessment. Anchors and versions share a D1 read batch. */
export async function loadEvidenceAssuranceSnapshot(db: D1Database, now = new Date()): Promise<EvidenceAssuranceSnapshot> {
  const issues: string[] = [], rows: EvidenceAssuranceSnapshot['rows'] = [];
  try {
    const results = await db.batch([
      db.prepare("SELECT r.id,r.data_json,COUNT(v.id) version_count FROM simple_grc_records r LEFT JOIN evidence_versions v ON v.evidence_id=r.id WHERE r.module='Kanıtlar' GROUP BY r.id ORDER BY r.id LIMIT 10001"),
      db.prepare("SELECT v.* FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' ORDER BY v.evidence_id,v.version_no LIMIT 5001"),
    ]);
    const records = results[0].results as unknown as Array<{ id: string; data_json: string; version_count: number }>;
    const versions = results[1].results as unknown as EvidenceVersionRow[];
    if (records.length > 10000) issues.push('records-incomplete');
    const grouped = new Map<string, EvidenceVersionRow[]>();
    for (const version of versions.slice(0, 5000)) {
      const group = grouped.get(version.evidence_id) || [];
      group.push(version); grouped.set(version.evidence_id, group);
    }
    for (const record of records.slice(0, 10000)) {
      try {
        const data: unknown = JSON.parse(record.data_json);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid record');
        const metadata = data as Record<string, unknown>;
        const integrity = await historyIntegrity(grouped.get(record.id) || [], record.version_count, metadata);
        if (integrity.state === 'unavailable') issues.push('integrity-incomplete');
        // Persisted derived labels are never trusted as a prior verification.
        const automated = isAutomatedEvidence({ id: record.id, data: metadata });
        delete metadata.automationAssessment;
        if (automated) metadata.automationAssessment = 'configuration-unverified';
        rows.push({ id: record.id, module: 'Kanıtlar', data: { ...metadata, evidenceIntegrity: integrity.state,
          evidenceIntegrityCheckedVersions: integrity.checked, evidenceIntegrityFailedVersion: integrity.failedVersion } });
      } catch { issues.push('records-invalid'); }
    }
  } catch { issues.push('evidence-unavailable'); }
  const projection = await projectAutomatedEvidence(db, rows, now);
  if (!projection.available) issues.push('assessment-unavailable');
  return { rows: projection.rows, verified: !issues.length, issues: [...new Set(issues)].sort(), generatedAt: now.toISOString() };
}
