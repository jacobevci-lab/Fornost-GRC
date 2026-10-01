import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureEvidenceAutomationSchema, executeRule } from '../app/api/evidence-automation/core';
import { ensureAssuranceWorkSchema } from '../app/continuous-assurance-runtime';
import { buildContinuousAssuranceCapaCandidate } from '../app/continuous-assurance-capa';
import { promoteContinuousAssuranceFinding } from '../app/findings/promotion';
import { loadFindingControlContext, readControlAssessment } from '../app/findings/control-context';
import { assessControl } from '../app/connectors/control-templates';

const now = new Date('2026-10-01T12:00:00Z'), owner = 'owner@fornost.test';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, args: (string | number | null)[] = []) { return {
    bind(...values: (string | number | null)[]) { return prepare(sql, values); },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
  }; }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { sqlite.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as unknown as D1Database;
  return { sqlite, db };
}
async function fixture() {
  const { sqlite, db } = database();
  await ensureEvidenceAutomationSchema(db); await ensureAssuranceWorkSchema(db);
  sqlite.exec(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('s','Custom','Custom','Custom','rest-json','{"baseUrl":"https://fixture.example/data"}','now','now','qa');
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('RULE-1','Coverage','s','A.8.1','percent','gte','90','daily','now','now','qa');`);
  const execute = (percent = 70, at = now) => executeRule({ DB: db }, 'RULE-1', owner, 'manual', { now: at, fetcher: async () => new Response(JSON.stringify({ percent }), { headers: { 'content-type': 'application/json' } }) });
  const row = () => sqlite.prepare('SELECT * FROM evidence_automation_findings ORDER BY rowid DESC LIMIT 1').get()!;
  const risk = () => JSON.parse(String(sqlite.prepare("SELECT data_json FROM simple_grc_records WHERE id=?").get(String(row().id))!.data_json));
  const first = await execute();
  const approved = buildContinuousAssuranceCapaCandidate({ findingId: String(row().id), ruleId: 'RULE-1', ruleName: 'Coverage', title: 'Coverage below threshold', detail: 'Coverage remains below the approved control threshold.', severity: 'high', owner, reviewer: 'reviewer@fornost.test', dueDate: '2026-10-08', controlRef: 'A.8.1', riskRef: String(row().id), rootCause: 'Policy assignments are incomplete.', correctiveAction: 'Complete policy assignments and verify coverage.', preventiveAction: 'Review policy assignments monthly with the owner.', originEvidenceReference: first.evidenceId!, originEvidenceSha256: String(sqlite.prepare('SELECT response_hash FROM evidence_automation_runs WHERE id=?').get(first.runId!)!.response_hash) }, '2026-10-01');
  const promoted = await promoteContinuousAssuranceFinding(db, approved, 'reviewer@fornost.test', owner, 'work-1', now);
  sqlite.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor,result_ref,completed_at) VALUES('work-1',?,'RULE-1','capa-promotion','completed',?,'now','now',?,?,'now')").run(String(row().id), JSON.stringify({ candidate: approved }), owner, promoted.id);
  const run = (percent = 70, at = now) => executeRule({ DB: db }, 'RULE-1', owner, 'manual', { now: at, fetcher: async () => new Response(JSON.stringify({ percent }), { headers: { 'content-type': 'application/json' } }) });
  return { sqlite, db, first, row, risk, run, promoted, approved };
}

test('promotion test stays immutable after submission; latest equal-timestamp run is deterministic and cannot close CAPA', async () => {
  const f = await fixture(); try {
    const latest = await f.run(95);
    f.sqlite.prepare("UPDATE enterprise_findings SET evidence_reference='manually-submitted-evidence',status='verification' WHERE id=?").run(f.promoted.id);
    const context = await loadFindingControlContext(f.db, f.promoted.id, now);
    assert.ok(context?.state === 'available');
    assert.equal(context.baseline?.id, f.first.runId); assert.equal(context.latest?.id, latest.runId);
    assert.equal(context.baseline?.status, 'fail'); assert.equal(context.latest?.status, 'pass');
    assert.equal(context.latest?.diagnostics, 'legacy'); assert.equal(context.freshness, 'fresh');
    assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_findings').get()!.status, 'verification');
    assert.equal(f.row().status, 'open');
    const stale = await loadFindingControlContext(f.db, f.promoted.id, new Date('2026-10-03T12:00:00Z'));
    assert.ok(stale?.state === 'available'); assert.equal(stale.freshness, 'stale');
  } finally { f.sqlite.close(); }
});
test('a later finding cycle on the same rule never substitutes the original automation finding', async () => {
  const f = await fixture(); try {
    const original = f.row().id;
    f.sqlite.exec("UPDATE evidence_automation_findings SET status='closed'"); await f.run();
    const context = await loadFindingControlContext(f.db, f.promoted.id, now);
    assert.ok(context?.state === 'available'); assert.equal(context.automationFinding.id, original); assert.equal(context.automationFinding.status, 'closed');
    assert.notEqual(f.row().id, original); assert.equal(context.baseline?.id, f.first.runId);
    f.sqlite.prepare('DELETE FROM evidence_automation_findings WHERE id=?').run(String(original));
    assert.deepEqual(await loadFindingControlContext(f.db, f.promoted.id, now), { state: 'source-unavailable' });
  } finally { f.sqlite.close(); }
});
test('missing, conflicting or tampered lineage does not guess a source; mismatched evidence hash withholds the baseline', async () => {
  const f = await fixture(); try {
    assert.equal(await loadFindingControlContext(f.db, 'missing'), null);
    f.sqlite.exec("UPDATE evidence_automation_runs SET response_hash='tampered'");
    const context = await loadFindingControlContext(f.db, f.promoted.id, now);
    assert.ok(context?.state === 'available'); assert.equal(context.baseline, null);
    f.sqlite.exec("UPDATE continuous_assurance_work_items SET finding_id='another-cycle'");
    assert.deepEqual(await loadFindingControlContext(f.db, f.promoted.id), { state: 'lineage-unavailable' });
    f.sqlite.exec("UPDATE enterprise_findings SET source_type='manual'");
    assert.deepEqual(await loadFindingControlContext(f.db, f.promoted.id), { state: 'not-applicable' });
  } finally { f.sqlite.close(); }
});
test('repeat failures refresh risk evidence and monitoring without overwriting human risk decisions; missing projection repairs itself', async () => {
  const f = await fixture(); try {
    const human = { ...f.risk(), owner: 'human@fornost.test', title: 'Human title', description: 'Human description', treatment: 'Human treatment', status: 'Kabul Edildi', residualImpact: '2' };
    f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify(human), String(f.row().id));
    const repeat = await f.run(60), projected = f.risk();
    assert.equal(projected.evidenceRef, repeat.evidenceId); assert.equal(projected.monitoring.runId, repeat.runId); assert.equal(projected.monitoring.occurrenceCount, 2);
    for (const key of ['owner', 'title', 'description', 'treatment', 'status', 'residualImpact']) assert.equal(projected[key], human[key]);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM evidence_automation_findings').get()!.n, 1);
    f.sqlite.prepare('DELETE FROM simple_grc_records WHERE id=?').run(String(f.row().id));
    await f.run(50); assert.equal(f.risk().monitoring.occurrenceCount, 3);
    const error = await executeRule({ DB: f.db }, 'RULE-1', owner, 'manual', { now, fetcher: async () => new Response('', { status: 503 }) });
    assert.equal(error.status, 'error'); assert.equal(f.risk().evidenceRef, ''); assert.equal(f.risk().monitoring.status, 'error');
    const context = await loadFindingControlContext(f.db, f.promoted.id, now);
    assert.ok(context?.state === 'available'); assert.equal(context.latest?.status, 'error'); assert.equal(context.latest?.evidenceId, null); assert.equal(context.freshness, 'missing');
  } finally { f.sqlite.close(); }
});
test('projection failure rolls back the entire run, evidence, rule counters and repeat finding update', async () => {
  const f = await fixture(); try {
    f.sqlite.exec("CREATE TRIGGER reject_projection BEFORE UPDATE ON simple_grc_records WHEN OLD.module='Risk Assessment' BEGIN SELECT RAISE(ABORT,'QA transaction rollback'); END");
    await assert.rejects(f.run(50), /QA transaction rollback/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM evidence_automation_runs').get()!.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM simple_grc_records WHERE module='Kanıtlar'").get()!.n, 1);
    assert.equal(f.row().occurrence_count, 1); assert.equal(f.risk().monitoring.occurrenceCount, 1);
    assert.equal(f.sqlite.prepare('SELECT consecutive_failures n FROM evidence_automation_rules').get()!.n, 1);
  } finally { f.sqlite.close(); }
});
test('diagnostic projection rejects corrupt shapes and excludes arbitrary sensitive fields', () => {
  const result = assessControl('intune-compliance', 1, { providerId: 'intune', dataset: 'managed-devices' }, { value: [{ id: 'device-1', deviceName: 'Workstation', complianceState: 'noncompliant', lastSyncDateTime: now.toISOString() }], fornostCollection: { providerId: 'intune', dataset: 'managed-devices', complete: true, scope: 'credential-visible', recordCount: 1 } }, now);
  assert.deepEqual(readControlAssessment(JSON.stringify(result)), result);
  assert.equal(readControlAssessment('{broken'), null);
  for (const delta of [{ total: -1 }, { total: 99 }, { scope: 'full-tenant' }, { issues: [{}] }, { score: 101 }]) assert.equal(readControlAssessment(JSON.stringify({ ...result, ...delta })), null);
  const safe = readControlAssessment(JSON.stringify({ ...result, token: 'SECRET_NEVER_RETURN', issues: result.issues.map(issue => ({ ...issue, secret: 'SECRET_NEVER_RETURN' })) }));
  assert.ok(safe); assert.ok(!JSON.stringify(safe).includes('SECRET_NEVER_RETURN'));
});
