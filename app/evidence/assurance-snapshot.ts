import type { AssuranceRow } from '../control-assurance';

export type EvidenceAssuranceSnapshot = { rows: AssuranceRow[]; verified: boolean; issues: string[]; generatedAt: string };

/** Only the loaded core scope is evaluated; newer evidence metadata replaces older copies. */
export function applyEvidenceAssuranceSnapshot(rows: AssuranceRow[], snapshot: EvidenceAssuranceSnapshot | null) {
  const evidence = rows.filter(row => row.module === 'Kanıtlar');
  const byId = new Map(snapshot?.rows.map(row => [row.id, row]) || []);
  const ready = !!snapshot?.verified && evidence.every(row => byId.has(row.id));
  return { ready, rows: rows.map(row => row.module !== 'Kanıtlar' ? row : ready
    ? { ...row, data: byId.get(row.id)!.data }
    : { ...row, data: { ...row.data, evidenceIntegrity: 'unavailable', automationAssessment: 'assessment-unavailable' } }) };
}

export function parseEvidenceAssuranceSnapshot(value: unknown): EvidenceAssuranceSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as EvidenceAssuranceSnapshot;
  if (typeof data.verified !== 'boolean' || !Array.isArray(data.issues) || !data.issues.every(issue => typeof issue === 'string')
    || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt)) || !Array.isArray(data.rows) || data.rows.length > 10000) return null;
  const ids = new Set<string>();
  for (const row of data.rows) {
    if (!row || typeof row.id !== 'string' || !row.id || row.module !== 'Kanıtlar' || !row.data || typeof row.data !== 'object' || Array.isArray(row.data) || ids.has(row.id)) return null;
    if (!['verified', 'broken', 'legacy-unverified', 'unavailable'].includes(String(row.data.evidenceIntegrity))) return null;
    ids.add(row.id);
  }
  if (data.verified && (data.issues.length || data.rows.some(row => row.data.evidenceIntegrity === 'unavailable' || row.data.automationAssessment === 'assessment-unavailable'))) return null;
  return data;
}
