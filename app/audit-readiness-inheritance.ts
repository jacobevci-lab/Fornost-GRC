import type { AssuranceRecord, AuditInheritedEvidence } from './audit-evidence-assurance';

type ReadinessRow = AssuranceRecord & { module: string };
type Entry = { audit_name: string; period: string; ref: string; applicability: string; pins: string };

// Keep catalog text and file metadata out of a read that runs across the portfolio.
export async function attachAuditInheritance<T extends ReadinessRow>(db: D1Database, rows: T[]): Promise<T[]> {
  const requirements = rows.filter(row => row.module === 'Denetim Yönetimi');
  if (!requirements.length) return rows;
  const metadata = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='simple_grc_metadata'").first();
  if (!metadata) return rows;
  const hasBaseline = await db.prepare("SELECT 1 FROM simple_grc_metadata WHERE key GLOB 'audit_posture_*' LIMIT 1").first();
  if (!hasBaseline) return rows;

  const auditNames = [...new Set(requirements.map(row => row.data.auditName).filter(name => typeof name === 'string'))];
  const result = await db.prepare(`
    WITH baselines AS (
      SELECT a.name, m.value FROM simple_audits a
      JOIN simple_grc_metadata m ON m.key='audit_posture_'||a.id
      WHERE a.name IN (SELECT value FROM json_each(?))
    ), pins AS MATERIALIZED (
      SELECT b.name, p.key, json_extract(p.value,'$.evidenceId') AS id,
        json_extract(p.value,'$.version') AS version, json_extract(p.value,'$.hash') AS hash
      FROM baselines b JOIN json_each(b.value,'$.evidence') p
    )
    SELECT b.name AS audit_name, json_extract(b.value,'$.period') AS period,
      json_extract(e.value,'$.ref') AS ref, json_extract(e.value,'$.applicability') AS applicability,
      (SELECT json_group_array(DISTINCT json_object('id',p.id,'version',p.version,'hash',p.hash))
       FROM pins p WHERE p.name=b.name AND p.key IN (
         SELECT v.value FROM json_each(e.value,'$.controls') c JOIN json_each(c.value,'$.evidence') v
         UNION SELECT value FROM json_each(e.value,'$.directEvidence'))) AS pins
    FROM baselines b JOIN json_each(b.value,'$.entries') e LIMIT 10001
  `).bind(JSON.stringify(auditNames)).all<Entry>();
  if (result.results.length > 10000) throw new Error('audit-inheritance-incomplete');

  const byAudit = new Map<string, Map<string, AuditInheritedEvidence>>();
  for (const entry of result.results) {
    let entries = byAudit.get(entry.audit_name);
    if (!entries) {
      entries = new Map();
      byAudit.set(entry.audit_name, entries);
    }
    entries.set(entry.ref, {
      period: entry.period,
      excluded: entry.applicability === 'excluded',
      pins: JSON.parse(entry.pins),
    });
  }
  return rows.map(row => {
    if (row.module !== 'Denetim Yönetimi') return row;
    const inherited = byAudit.get(String(row.data.auditName))?.get(String(row.data.requirementRef));
    return inherited ? { ...row, inherited } : row;
  });
}
