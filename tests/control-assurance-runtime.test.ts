import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureEvidenceAutomationSchema } from '../app/api/evidence-automation/core';
import { ensureAssuranceWorkSchema } from '../app/continuous-assurance-runtime';
import { loadControlAssuranceSnapshot } from '../app/control-assurance-runtime';
import { buildControlAssurance, buildControlAssuranceDetail } from '../app/control-assurance';
import { buildAuditEvidenceAssurance } from '../app/audit-evidence-assurance';
import { controlAssuranceRecordTarget } from '../app/control-assurance-state';
import { scopedApiAllowed } from '../app/module-access';

const now = new Date('2026-10-02T12:00:00.000Z');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, values: (string | number | null)[] = []) { return {
    bind(...args: (string | number | null)[]) { return prepare(sql, args); },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
  }; }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { return Promise.all(statements.map(statement => statement.run())); } } as unknown as D1Database;
  await ensureEvidenceAutomationSchema(db); await ensureAssuranceWorkSchema(db);
  sqlite.exec(readFileSync('drizzle/0072_enterprise_findings_capa.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0079_evidence_lineage_storage.sql', 'utf8'));
  sqlite.exec('CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT,code TEXT,created_at TEXT)');
  const record = (id: string, module: string, data: Record<string, unknown>) => sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id, module, JSON.stringify(data), now.toISOString(), now.toISOString());
  const evidence = (data: Record<string, unknown> = {}) => ({ evidenceTitle: 'Proof', controlRef: 'CTL-1', status: 'Approved', ...data });
  record('C1', 'Kontroller', { controlRef: 'CTL-1', controlTitle: 'Access', owner: 'Security', testOwner: 'Audit', nextTestDate: '2027-01-01' });
  record('A1', 'Denetim Yönetimi', { controlRef: 'CTL-1' }); record('E1', 'Kanıtlar', evidence());
  const setEvidence = (data: Record<string, unknown>) => sqlite.prepare("UPDATE simple_grc_records SET data_json=? WHERE id='E1'").run(JSON.stringify(evidence(data)));
  const read = () => loadControlAssuranceSnapshot(db, now);
  return { sqlite, db, record, setEvidence, read, async item() { const snapshot = await read(); return buildControlAssurance(snapshot.rows, snapshot.generatedAt).items[0]; } };
}

test('empty automation is distinct from missing sources and the control view has one complete timestamped projection', async () => {
  const f = await fixture(); try {
    const result = await f.read(); assert.equal(result.verified, true); assert.deepEqual(result.issues, []); assert.equal(result.generatedAt, now.toISOString());
    assert.equal((await f.item()).currentEvidenceCount, 1);
    f.sqlite.exec('DROP TABLE enterprise_findings');
    assert.ok((await f.read()).issues.includes('capa-unavailable')); assert.equal((await f.read()).verified, false);
    f.sqlite.exec('DROP TABLE evidence_automation_rules'); assert.ok((await f.read()).issues.includes('rules-unavailable'));
  } finally { f.sqlite.close(); }
});

test('draft, rejected, invalid and expired evidence have the same eligibility in audit and control views', async () => {
  const f = await fixture(); try {
    for (const data of [{ status: 'Draft' }, { reviewStatus: 'Rejected' }, { reviewStatus: 'pending-review' }, { validationStatus: 'fail' }, { freshUntil: now.toISOString() }, { expiresAt: 'bad' }, { expiresAt: '2026-02-30' }, { freshUntil: '2026-10-02T11:59:59Z', expiresAt: '2099-01-01' }]) {
      f.setEvidence(data); const snapshot = await f.read();
      const item = buildControlAssurance(snapshot.rows, snapshot.generatedAt).items[0]; assert.equal(item.currentEvidenceCount, 0, JSON.stringify(data));
      const audit = buildAuditEvidenceAssurance(snapshot.rows.filter(row => row.module === 'Denetim Yönetimi'), snapshot.rows.filter(row => row.module === 'Kanıtlar'), now);
      assert.equal(audit.current, 0, JSON.stringify(data));
    }
    f.setEvidence({ expiresAt: '2026-10-02' }); assert.equal((await f.item()).currentEvidenceCount, 1);
    f.setEvidence({ freshUntil: '2026-10-02T15:00:01+03:00' }); assert.equal((await f.item()).currentEvidenceCount, 1);
  } finally { f.sqlite.close(); }
});

test('missing tracked evidence versions are broken rather than relabeled as legacy', async () => {
  const f = await fixture(); try {
    f.setEvidence({ versionNo: 2, versionChainSha256: 'a'.repeat(64) });
    const item = await f.item(); assert.equal(item.currentEvidenceCount, 0); assert.equal(item.brokenEvidenceCount, 1); assert.equal(item.state, 'critical');
    f.sqlite.exec('DROP TABLE evidence_versions'); const snapshot = await f.read();
    assert.equal(snapshot.verified, false); assert.ok(snapshot.issues.includes('integrity-unavailable')); assert.equal((await f.item()).state, 'unverified');
  } finally { f.sqlite.close(); }
});

test('real malformed records and record truncation cannot certify an empty healthy portfolio', async () => {
  const f = await fixture(); try {
    f.sqlite.exec("UPDATE simple_grc_records SET data_json='[]' WHERE id='E1'"); assert.ok((await f.read()).issues.includes('records-invalid'));
    f.setEvidence({});
    f.sqlite.exec('BEGIN'); for (let i = 0; i < 10000; i++) f.record(`NOISE-${i}`, 'Varlık Envanteri', { title: 'Other' }); f.sqlite.exec('COMMIT');
    const result = await f.read(); assert.ok(result.issues.includes('records-incomplete')); assert.equal(result.verified, false);
  } finally { f.sqlite.close(); }
});

test('source history truncation is explicitly incomplete even when sampled findings are closed', async () => {
  const f = await fixture(); try {
    const insert = f.sqlite.prepare("INSERT INTO evidence_automation_findings(id,rule_id,title,severity,owner,due_date,status,detail,created_at,updated_at) VALUES(?,'RULE','Old','low','QA','2026-10-01','closed','QA','now','now')");
    for (let i = 0; i < 1001; i++) insert.run(`F-${i}`);
    assert.ok((await f.read()).issues.includes('findings-incomplete'));
  } finally { f.sqlite.close(); }
});

test('control projection resolves the second rule mapping and a verified retry clears its historical error', async () => {
  const f = await fixture(); try {
    f.sqlite.prepare("INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,last_status,last_evidence_at,created_at,updated_at,updated_by) VALUES('RULE','Coverage','SOURCE','OTHER;CTL-1','value','eq','1','daily','pass',?,?,?,'qa')").run(now.toISOString(), now.toISOString(), now.toISOString());
    const insert = f.sqlite.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,actor,created_at,updated_at,result_ref) VALUES(?,'FINDING','RULE','control-retest',?,?,'qa',?,?,'RUN')");
    insert.run('ERROR', 'retest-error', JSON.stringify({ targetControlRef: 'CTL-1' }), '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z');
    assert.ok((await f.item()).reasons.includes('retest-unresolved')); assert.notEqual((await f.item()).state, 'healthy');
    insert.run('PASS', 'completed', JSON.stringify({ targetControlRef: 'CTL-1', retestOutcome: { status: 'pass', runId: 'RUN' } }), '2026-10-02T11:00:00Z', '2026-10-02T11:00:00Z');
    assert.equal((await f.item()).state, 'healthy'); assert.equal((await f.item()).automationRuleCount, 1); assert.equal((await f.item()).automationHealthyCount, 1);
    f.sqlite.exec("UPDATE evidence_automation_rules SET last_status=NULL WHERE id='RULE'"); assert.equal((await f.item()).automationHealthyCount, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM continuous_assurance_work_items').get()!.n, 2);
  } finally { f.sqlite.close(); }
});

test('all evidence records remain in detail and navigation resolves the exact record or original CAPA', async () => {
  const f = await fixture(); try {
    for (let i = 2; i < 12; i++) f.record(`E${i}`, 'Kanıtlar', { controlRef: 'CTL-1', evidenceTitle: `Evidence ${i}`, status: 'Approved' });
    const snapshot = await f.read(), detail = buildControlAssuranceDetail(snapshot.rows, 'C1', snapshot.generatedAt)!;
    assert.equal(detail.evidence.length, 11);
    assert.deepEqual(controlAssuranceRecordTarget(detail.evidence.find(row => row.id === 'E11')!), { module: 'Kanıtlar', ref: 'E11', kind: 'record', filter: { recordRef: 'E11' }, source: 'control-assurance' });
    assert.equal(controlAssuranceRecordTarget({ id: 'enterprise:remediation:R', module: 'Bulgular ve CAPA', data: { kind: 'remediation', remediationFindingRef: ['REAL-FINDING', 'FND-001'] } })?.filter?.findingRef, 'REAL-FINDING');
    assert.equal(controlAssuranceRecordTarget({ id: 'enterprise:automation-work:W', module: 'Kanıt Otomasyonu', data: { kind: 'automation-work', automationRuleRef: ['RULE'] } })?.filter?.ruleRef, 'RULE');
  } finally { f.sqlite.close(); }
});

test('shared control assurance remains read-only and inaccessible to a scoped actor', () => {
  assert.equal(scopedApiAllowed({ role: 'Viewer', moduleAccess: { mode: 'full' } }, '/api/controls/assurance', 'GET'), true);
  assert.equal(scopedApiAllowed({ role: 'Editor', moduleAccess: { mode: 'scoped', modules: { Kontroller: 'write' } } }, '/api/controls/assurance', 'GET'), false);
});
