import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { isCoreRecordRequest } from '../app/core-record-focus';
import { readEvidenceUsage } from '../app/evidence/usage-store';
import { EvidenceUsageError, usageNeedsReview, usageReferences } from '../app/evidence/usage';
import { scopedApiAllowed, type AccessSubject } from '../app/module-access';
const admin = { role: 'Admin' };
function fixture() {
  const sql = new DatabaseSync(':memory:'), queries: string[] = [];
  sql.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT);
    CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT);
    CREATE TABLE evidence_versions(id TEXT PRIMARY KEY,evidence_id TEXT,version_no INTEGER,content_sha256 TEXT);
    CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE audit_closure_state(audit_id TEXT PRIMARY KEY,state TEXT);
    CREATE TABLE audit_requests(id TEXT PRIMARY KEY,audit_id TEXT,data_json TEXT,updated_at TEXT);
    CREATE TABLE audit_workpapers(id TEXT PRIMARY KEY,audit_id TEXT,data_json TEXT,updated_at TEXT);
    CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT,title TEXT,owner TEXT,status TEXT,due_date TEXT,evidence_reference TEXT,verification_evidence_reference TEXT,updated_at TEXT);
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
test('exact IDs/codes and unique control IDs resolve; ambiguity and substring matches do not', async () => {
  const f = fixture(); try {
    f.record('REQ-1', 'Denetim Yönetimi', { requirement: 'Review access', evidenceRef: ['EVD-100', 'unrelated'] });
    f.record('REQ-2', 'Denetim Yönetimi', { evidenceRef: 'EVD-1000' });
    f.sql.prepare('INSERT INTO enterprise_findings VALUES(?,?,?,?,?,?,?,?,?)').run('F-1', 'CAPA-1', 'Remediate', 'owner', 'open', '', '', 'EVD-1', '2026');
    const result = await readEvidenceUsage(f.db, admin, 'EVD-1');
    assert.deepEqual(result.rows.map(r => r.id).sort(), ['C-ref', 'CMP-1', 'CTRL-1', 'F-1', 'REQ-1']);
    assert.deepEqual(result.unresolvedControls, ['ambiguous', 'missing']);
    assert.ok(result.rows.filter(r => ['controls', 'requirements'].includes(r.source)).every(r => isCoreRecordRequest(r.target)));
    assert.ok(result.sources.every(s => s.state === 'complete'));
    assert.ok(result.rows.every(r => !r.pins.length && !usageNeedsReview(r)));
    assert.deepEqual(usageReferences([' EVD-1, EVD-2 ', 'EVD-3|EVD-4\nEVD-5']), ['evd-1','evd-2','evd-3','evd-4','evd-5']);
  } finally { f.sql.close(); }
});
test('open old pins need review, current pins and preserved approvals do not; reviewer handoff is exact', async () => {
  const f = fixture(); try {
    f.work('WP-old'); f.work('WP-new', 'draft', 'v2', 'audit_workpapers', 'hash2'); f.work('WP-approved', 'approved'); f.work('REQ-review', 'submitted', 'v1', 'audit_requests');
    const result = await readEvidenceUsage(f.db, admin, 'EVD-1');
    assert.deepEqual(result.rows.filter(usageNeedsReview).map(r => r.id).sort(), ['REQ-review', 'WP-old']);
    const request = result.rows.find(r => r.id === 'REQ-review')!;
    assert.equal(request.owner, 'reviewer@test.invalid'); assert.equal(request.dueDate, '2026-10-27');
    assert.deepEqual(request.target, { module: 'Denetim Yönetimi', ref: 'REQ-review', kind: 'audit-request', filter: { auditId: 'AUD-1' }, source: 'evidence-usage' });
    assert.equal(JSON.stringify(result).includes('not-for-usage'), false);
    assert.equal(JSON.stringify(result).includes('content_sha256'), false);
    f.sql.exec("INSERT INTO audit_closure_state VALUES('AUD-1','closed')");
    assert.equal((await readEvidenceUsage(f.db, admin, 'EVD-1')).rows.filter(usageNeedsReview).length, 0);
  } finally { f.sql.close(); }
});
test('missing, forged, wrong-hash and cross-evidence version pins remain unverified', async () => {
  const f = fixture(); try {
    f.work('WP-missing', 'draft', 'no-such-version'); f.work('WP-forged', 'draft', 'v1', 'audit_workpapers', 'wrong');
    f.sql.exec("INSERT INTO evidence_versions VALUES('other','OTHER',1,'hash1')"); f.work('WP-other', 'draft', 'other');
    const pins = (await readEvidenceUsage(f.db, admin, 'EVD-1')).rows.flatMap(r => r.pins);
    assert.equal(pins.length, 3); assert.ok(pins.every(p => p.state === 'unknown'));
  } finally { f.sql.close(); }
});
test('scoped evidence-only viewers read no audit, control or CAPA tables and cannot mutate endpoint', async () => {
  const f = fixture(); try {
    const viewer: AccessSubject = { role: 'Viewer', moduleAccess: { mode: 'scoped', modules: { 'Kanıtlar': 'read' } } };
    const result = await readEvidenceUsage(f.db, viewer, 'EVD-1');
    assert.deepEqual(result.rows, []); assert.ok(result.sources.every(s => s.state === 'restricted'));
    assert.equal(f.queries.length, 2); assert.ok(f.queries.every(q => q.includes("r.module='Kanıtlar'")));
    assert.equal(scopedApiAllowed(viewer, '/api/evidence/usage', 'GET'), true);
    assert.equal(scopedApiAllowed(viewer, '/api/evidence/usage', 'POST'), false);
    await assert.rejects(readEvidenceUsage(f.db, { role: 'Viewer', moduleAccess: { mode: 'scoped', modules: {} } }, 'EVD-1'), (e: unknown) => e instanceof EvidenceUsageError && e.status === 403);
    assert.equal(f.queries.length, 2);
  } finally { f.sql.close(); }
});
test('bounded reads disclose incomplete sources and orphaned audits are excluded', async () => {
  const f = fixture(); try {
    for (let i = 0; i < 201; i++) f.work(`WP-${String(i).padStart(3, '0')}`);
    for (let i = 0; i < 1001; i++) f.record(`REQ-${i}`, 'Denetim Yönetimi', { evidenceRef: 'EVD-1' });
    const result = await readEvidenceUsage(f.db, admin, 'EVD-1');
    assert.equal(result.rows.filter(r => r.source === 'workpapers').length, 200);
    assert.equal(result.rows.filter(r => r.source === 'requirements').length, 1000);
    assert.ok(result.sources.filter(s => ['workpapers','requirements'].includes(s.key)).every(s => s.state === 'limited'));
    f.sql.exec('DELETE FROM simple_audits');
    assert.equal((await readEvidenceUsage(f.db, admin, 'EVD-1')).rows.filter(r => r.source === 'workpapers').length, 0);
  } finally { f.sql.close(); }
});
test('a failed source is unknown, while successful sources remain available', async () => {
  const f = fixture(); try {
    f.work('WP-1'); f.sql.exec('DROP TABLE enterprise_findings');
    const result = await readEvidenceUsage(f.db, admin, 'EVD-1');
    assert.equal(result.sources.find(s => s.key === 'findings')?.state, 'unavailable'); assert.ok(result.rows.some(r => r.id === 'WP-1'));
    await assert.rejects(readEvidenceUsage(f.db, admin, 'missing'), (e: unknown) => e instanceof EvidenceUsageError && e.status === 404);
    await assert.rejects(readEvidenceUsage(f.db, admin, '../bad'), (e: unknown) => e instanceof EvidenceUsageError && e.status === 400);
  } finally { f.sql.close(); }
});
test('evidence changing during reads rejects a stale comparison', async () => {
  const f = fixture(); try {
    const original = f.db.prepare.bind(f.db); let anchors = 0;
    f.db.prepare = ((query: string) => { if (query.includes('v.id AS version_id') && ++anchors === 2) f.sql.exec("UPDATE simple_grc_records SET updated_at='changed' WHERE id='EVD-1'"); return original(query); }) as D1Database['prepare'];
    await assert.rejects(readEvidenceUsage(f.db, admin, 'EVD-1'), (e: unknown) => e instanceof EvidenceUsageError && e.status === 409);
  } finally { f.sql.close(); }
});
