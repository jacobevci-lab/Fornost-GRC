import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
export function fixture() {
  const sql = new DatabaseSync(':memory:'), queries: string[] = [];
  sql.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT);
    CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT);
    CREATE TABLE evidence_versions(id TEXT PRIMARY KEY,evidence_id TEXT,version_no INTEGER,content_sha256 TEXT);
    CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE audit_closure_state(audit_id TEXT PRIMARY KEY,state TEXT);
    CREATE TABLE audit_requests(id TEXT PRIMARY KEY,audit_id TEXT,data_json TEXT,updated_at TEXT);
    CREATE TABLE audit_workpapers(id TEXT PRIMARY KEY,audit_id TEXT,data_json TEXT,updated_at TEXT);
    CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT,title TEXT,owner TEXT,status TEXT,due_date TEXT,evidence_reference TEXT,verification_evidence_reference TEXT,updated_at TEXT);
    CREATE TABLE workflow_evidence_pins(id TEXT PRIMARY KEY,workflow TEXT,entity_id TEXT,purpose TEXT,snapshot_json TEXT,actor TEXT,created_at TEXT);
    CREATE TABLE enterprise_continuity_plans(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE enterprise_continuity_exercises(id TEXT PRIMARY KEY,plan_id TEXT,code TEXT,facilitator TEXT,status TEXT,scheduled_date TEXT);
    CREATE TABLE enterprise_continuity_gaps(id TEXT PRIMARY KEY,plan_id TEXT,title TEXT,owner TEXT,status TEXT,due_date TEXT);
    CREATE TABLE regulatory_intelligence_sources(id TEXT PRIMARY KEY);
    CREATE TABLE regulatory_changes(id TEXT PRIMARY KEY,source_id TEXT,title TEXT);
    CREATE TABLE regulatory_change_impacts(id TEXT PRIMARY KEY,change_id TEXT,target_title TEXT,action_owner TEXT,status TEXT,due_date TEXT);
    INSERT INTO simple_audits VALUES('AUD-1','Audit');
    INSERT INTO evidence_versions VALUES('v1','EVD-1',1,'hash1'),('v2','EVD-1',2,'hash2');
    INSERT INTO simple_grc_record_codes VALUES('EVD-1','EVD-100');`);
  const record = (id: string, module: string, data: object) => sql.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?)').run(id, module, JSON.stringify(data), '2026-10-25');
  record('EVD-1', 'Kanıtlar', { evidenceTitle: 'Access evidence', controlRef: 'CTRL-1', controlRefs: 'CTRL-1; CC6.1; A.5.15; ambiguous; missing' });
  record('CTRL-1', 'Kontroller', { controlTitle: 'Access control' }); record('CMP-1', 'Uyum', { controlId: 'CC6.1', controlTitle: 'Compliance' });
  record('C-ref', 'Kontroller', { controlRef: 'A.5.15', controlTitle: 'Legacy control reference' });
  record('C-A', 'Kontroller', { controlId: 'ambiguous' }); record('C-B', 'Kontroller', { controlId: 'ambiguous' });
  const work = (id: string, status = 'draft', version = 'v1', table = 'audit_workpapers', hash = 'hash1') => sql.prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`).run(id, 'AUD-1', JSON.stringify({ title: id, status, owner: 'owner@test.invalid', reviewer: 'reviewer@test.invalid', dueDate: '2026-10-26', reviewDueDate: '2026-10-27', evidence: [{ evidenceId: 'EVD-1', id: version, versionNo: version === 'v2' ? 2 : 1, contentSha256: hash }], samples: [{ secret: 'not-for-usage' }] }), '2026-10-25');
  function prepare(query: string, args: SQLInputValue[] = []) {
    return { bind(...values: SQLInputValue[]) { return prepare(query, values); }, async all() { queries.push(query); return { results: sql.prepare(query).all(...args) }; }, async first() { queries.push(query); return sql.prepare(query).get(...args) || null; } };
  }
  return { sql, db: { prepare } as unknown as D1Database, record, work, queries };
}
