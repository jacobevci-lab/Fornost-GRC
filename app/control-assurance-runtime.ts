import type { AssuranceRow } from './control-assurance';
import { buildConnectedGrcEnterpriseRows } from './connected-grc-sources';
import { loadContinuousAssuranceSnapshots } from './continuous-assurance-store';
import { buildContinuousAssuranceDashboard } from './continuous-assurance-dashboard';
import { controlHealth, evidenceFreshness } from './evidence/continuous-controls';
import { verifyEvidenceVersionChainWithAnchor, type EvidenceVersionRow } from './evidence/versioning';
import type { ControlAssuranceSnapshot } from './control-assurance-state';

/** Bounded read-only projection. An incomplete source can never certify a healthy portfolio. */
export async function loadControlAssuranceSnapshot(db: D1Database, now = new Date()): Promise<ControlAssuranceSnapshot> {
  const issues: string[] = [];
  async function read<T>(source: string, sql: string, limit: number): Promise<T[]> {
    try {
      const result = await db.prepare(sql).all<T>();
      if (result.results.length > limit) issues.push(`${source}-incomplete`);
      return result.results.slice(0, limit);
    } catch { issues.push(`${source}-unavailable`); return []; }
  }
  const [records, findings, versions, assurance] = await Promise.all([
    read<{ id: string; module: string; data_json: string; code: string }>('records',
      'SELECT r.id,r.module,r.data_json,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id ORDER BY r.id LIMIT 10001', 10000),
    read<Record<string, unknown>>('capa', 'SELECT * FROM enterprise_findings ORDER BY id LIMIT 3001', 3000),
    read<EvidenceVersionRow>('integrity', 'SELECT * FROM evidence_versions ORDER BY evidence_id,version_no LIMIT 5001', 5000),
    // The version scan below verifies every loaded manual evidence chain once.
    loadContinuousAssuranceSnapshots(db, { integrityControlRefs: [] }),
  ]);
  const core: AssuranceRow[] = [];
  for (const row of records) {
    try {
      const data: unknown = JSON.parse(row.data_json);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid record');
      core.push({ id: row.id, module: row.module, code: row.code || undefined, data: data as Record<string, unknown> });
    } catch { issues.push('records-invalid'); }
  }
  const versionsById = new Map<string, EvidenceVersionRow[]>();
  for (const version of versions) versionsById.set(version.evidence_id, [...(versionsById.get(version.evidence_id) || []), version]);
  for (const row of core.filter(row => row.module === 'Kanıtlar')) {
    const chain = versionsById.get(row.id) || [];
    const result = issues.some(issue => issue.startsWith('integrity-'))
      ? { state: 'unavailable', checked: 0, failedVersion: 0 }
      : (Number(row.data.versionNo) > 0 && chain.length !== Number(row.data.versionNo)) || (!chain.length && !!row.data.versionChainSha256)
        ? { state: 'broken', checked: 0, failedVersion: Number(row.data.versionNo) || 1 }
        : await verifyEvidenceVersionChainWithAnchor(chain, { versionNo: row.data.versionNo, chainSha256: row.data.versionChainSha256 });
    row.data = { ...row.data, evidenceIntegrity: result.state, evidenceIntegrityCheckedVersions: result.checked, evidenceIntegrityFailedVersion: result.failedVersion };
  }
  for (const [source, available, complete] of [
    ['rules', assurance.dataQuality.rulesAvailable, assurance.dataQuality.rulesComplete],
    ['findings', assurance.dataQuality.findingsAvailable, assurance.dataQuality.findingsComplete],
    ['work', assurance.dataQuality.workQueueAvailable, assurance.dataQuality.workQueueComplete],
  ] as const) {
    if (!available) issues.push(`${source}-unavailable`);
    else if (!complete) issues.push(`${source}-incomplete`);
  }
  const enterprise = buildConnectedGrcEnterpriseRows({ findings: { findings }, evidenceAutomation: {
    rules: assurance.rules.map(rule => ({ ...rule, health: controlHealth(rule, now) === 'healthy' && rule.lastStatus !== 'pass' ? 'unknown' : controlHealth(rule, now), freshness: evidenceFreshness(rule.lastEvidenceAt, rule.freshnessHours, now) })),
    findings: assurance.findings,
  } });
  const work = buildContinuousAssuranceDashboard({ ...assurance, now, priorityLimit: null }).priorities
    .filter(item => item.kind === 'work-item').map(item => ({
      id: `enterprise:automation-work:${item.id}`, module: 'Kanıt Otomasyonu', data: {
        kind: 'automation-work', title: item.title, status: item.state, owner: item.owner,
        automationControlRefs: item.targetControlRefs || [], automationRuleRef: [item.ruleId],
      },
    }));
  return { rows: [...core, ...enterprise, ...work], verified: issues.length === 0, issues: [...new Set(issues)].sort(), generatedAt: now.toISOString() };
}
