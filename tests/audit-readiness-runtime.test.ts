import { seedAssessmentReceipt } from './helpers/assessment-fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureEvidenceAutomationSchema } from '../app/api/evidence-automation/core';
import { readFileSync } from 'node:fs';
import { ensureAssuranceWorkSchema } from '../app/continuous-assurance-runtime';
import { loadContinuousAssuranceSnapshots } from '../app/continuous-assurance-store';
import { loadAuditReadiness } from '../app/audit-readiness-runtime';
import { buildAuditEvidenceAssurance } from '../app/audit-evidence-assurance';
import { buildContinuousAssuranceDashboard } from '../app/continuous-assurance-dashboard';
import { scopedApiAllowed } from '../app/module-access';
import { parseAuditReadinessResult, filterAuditRequirements } from '../app/audit-readiness-view';

const now = new Date('2026-10-02T12:00:00.000Z');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, values: (string | number | null)[] = []) { return {
    bind(...args: (string | number | null)[]) { return prepare(sql, args); },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    exec() { return { results: sqlite.prepare(sql).all(...values), meta: { changes: Number(sqlite.prepare('SELECT changes() n').get()!.n) } }; },
    async run() { return this.exec(); },
  }; }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { sqlite.exec('BEGIN'); try { const result=statements.map(statement=>statement.exec()); sqlite.exec('COMMIT'); return result; } catch(error) { sqlite.exec('ROLLBACK'); throw error; } } } as unknown as D1Database;
  await ensureEvidenceAutomationSchema(db); await ensureAssuranceWorkSchema(db); sqlite.exec(readFileSync('drizzle/0079_evidence_lineage_storage.sql', 'utf8'));
  const record = (id: string, module: string, data: Record<string, unknown>) => sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id, module, JSON.stringify(data), now.toISOString(), now.toISOString());
  const rule = async (id: string, refs: string, status = 'fail') => { sqlite.prepare("INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by,last_status,last_evidence_at) VALUES(?,?,'QA-SOURCE',?,'value','eq','1','daily',?,?,'qa',?,?)").run(id, id, refs, now.toISOString(), now.toISOString(), status, now.toISOString()); await seedAssessmentReceipt(sqlite,id,now,id==='RULE'?'RUN':`RUN-${id}`,status); };
  const work = (id: string, status: string, at: string, decision: Record<string, unknown> = {}, target = 'A.8.1') => sqlite.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,actor,created_at,updated_at,result_ref) VALUES(?,'FINDING','RULE','control-retest',?,?,'qa',?,?,'RUN')").run(id, status, JSON.stringify({ targetControlRef: target, ...decision }), at, at);
  record('AUDIT', 'Denetim Yönetimi', { auditName: 'QA Scope', controlRef: 'A.8.1', requirementRef: 'A.8.1' });
  record('EVIDENCE', 'Kanıtlar', { controlRef: 'A.8.1', requirementRef: 'a.8.1', status: 'Onaylandı', freshUntil: '2026-10-03T12:00:00Z' });
  return { sqlite, db, record, rule, work, read: (name = 'QA Scope') => loadAuditReadiness(db, name, now) };
}

test('empty loaded assurance sources differ from unreadable sources, and manual evidence remains eligible', async () => {
  const f = await fixture(); try {
    const result = await f.read(); assert.equal(result.gate, 'ready'); assert.equal(result.verified, true);
    assert.deepEqual(result.unmonitored, ['A.8.1']); assert.equal(result.evidence.requirements[0].linkedEvidence, 1);
    f.sqlite.exec('DROP TABLE evidence_automation_rules');
    const failed = await f.read(); assert.equal(failed.gate, 'unverified'); assert.ok(failed.issues.includes('rules-unavailable'));
  } finally { f.sqlite.close(); }
});
test('an audit catches a second control mapping even when 120 unrelated signals fill the dashboard window', async () => {
  const f = await fixture(); try {
    for (let i = 0; i < 120; i++) await f.rule(`NOISE-${i}`, `OUTSIDE-${i}`);
    await f.rule('RULE', 'OUTSIDE; A.8.1');
    const sources = await loadContinuousAssuranceSnapshots(f.db);
    assert.equal(buildContinuousAssuranceDashboard({ ...sources, now }).priorities.length, 100);
    const result = await f.read(); assert.equal(result.gate, 'not-ready'); assert.equal(result.blockerCount, 1);
    assert.deepEqual(result.signals[0].targetControlRefs, ['A.8.1']); assert.equal(result.signals[0].targetControlRef, 'A.8.1');
    assert.equal(result.evidence.total, 1);
  } finally { f.sqlite.close(); }
});
test('explicit governed work targeting another control does not affect this audit', async () => {
  const f = await fixture(); try {
    await f.rule('RULE', 'A.8.1; A.8.2', 'pass');
    f.work('WORK', 'failed-retest', now.toISOString(), {}, 'A.8.2');
    assert.equal((await f.read()).gate, 'ready');
    f.work('IN-SCOPE', 'retest-error', now.toISOString());
    assert.equal((await f.read()).blockerCount, 1);
  } finally { f.sqlite.close(); }
});
test('a later verified passing re-test resolves the earlier error without deleting history', async () => {
  const f = await fixture(); try {
    await f.rule('RULE', 'A.8.1', 'pass'); f.work('ERROR', 'retest-error', '2026-10-02T10:00:00Z');
    f.work('PASSED', 'completed', '2026-10-02T11:00:00Z', { retestOutcome: { status: 'pass', runId: 'RUN' } });
    assert.equal((await f.read()).gate, 'ready');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM continuous_assurance_work_items').get()!.n, 2);
    f.sqlite.exec("UPDATE continuous_assurance_work_items SET decision_json='{}' WHERE id='PASSED'");
    assert.equal((await f.read()).blockerCount, 1);
  } finally { f.sqlite.close(); }
});
test('unverified passes, earlier passes and passes for other targets cannot clear a re-test error', async () => {
  const f = await fixture(); try {
    await f.rule('RULE', 'A.8.1; A.8.2', 'pass'); f.work('ERROR', 'failed-retest', '2026-10-02T10:00:00Z');
    f.work('WRONG-RUN', 'completed', '2026-10-02T11:00:00Z', { retestOutcome: { status: 'pass', runId: 'OTHER' } });
    f.work('EARLIER', 'completed', '2026-10-02T09:00:00Z', { retestOutcome: { status: 'pass', runId: 'RUN' } });
    f.work('OTHER-TARGET', 'completed', '2026-10-02T11:00:00Z', { retestOutcome: { status: 'pass', runId: 'RUN' } }, 'A.8.2');
    assert.equal((await f.read()).blockerCount, 1);
  } finally { f.sqlite.close(); }
});
test('more than 1000 work rows produces explicit incomplete evaluation, never a truncated ready result', async () => {
  const f = await fixture(); try {
    for (let i = 0; i < 1001; i++) f.work(`HISTORY-${i}`, 'rejected', now.toISOString());
    const result = await f.read(); assert.equal(result.gate, 'unverified'); assert.ok(result.issues.includes('work-incomplete'));
  } finally { f.sqlite.close(); }
});
test('more than 1000 findings produces an incomplete evaluation even when sampled findings are closed', async () => {
  const f = await fixture(); try {
    const insert = f.sqlite.prepare("INSERT INTO evidence_automation_findings(id,rule_id,title,severity,owner,due_date,status,detail,created_at,updated_at) VALUES(?,'RULE','Old','low','QA','2026-10-01','closed','QA','now','now')");
    for (let i = 0; i < 1001; i++) insert.run(`F-${i}`);
    assert.ok((await f.read()).issues.includes('findings-incomplete'));
  } finally { f.sqlite.close(); }
});
test('missing findings source, unreadable records and unmapped audit items cannot yield ready', async () => {
  const f = await fixture(); try {
    f.record('UNMAPPED', 'Denetim Yönetimi', { auditName: 'QA Scope' });
    assert.ok((await f.read()).issues.includes('scope-unmapped'));
    f.sqlite.exec("UPDATE simple_grc_records SET data_json='not-json' WHERE id='UNMAPPED'");
    assert.ok((await f.read()).issues.includes('records-incomplete'));
    f.sqlite.exec('DROP TABLE evidence_automation_findings');
    assert.ok((await f.read()).issues.includes('findings-unavailable'));
    f.sqlite.exec('DROP TABLE simple_grc_records');
    assert.ok((await f.read()).issues.includes('records-unavailable'));
  } finally { f.sqlite.close(); }
});
test('audit names match normalized exact scope and unrelated requirements do not affect a selected audit', async () => {
  const f = await fixture(); try {
    f.record('OTHER', 'Denetim Yönetimi', { auditName: 'Different audit', controlRef: 'A.9.9' });
    assert.equal((await f.read(' qa scope ')).evidence.total, 1);
    assert.equal((await f.read('Different audit')).gate, 'not-ready');
    assert.equal((await f.read('')).evidence.total, 2);
    assert.equal((await f.read('missing audit')).gate, 'empty');
  } finally { f.sqlite.close(); }
});
test('missing evidence-integrity tables block readiness only when scope has a mapped automation rule', async () => {
  const f = await fixture(); try {
    await f.rule('OUTSIDE', 'A.9.9', 'pass'); f.sqlite.exec('DROP TABLE evidence_version_controls');
    assert.equal((await f.read()).gate, 'ready');
    await f.rule('RULE', 'A.8.1', 'pass'); assert.ok((await f.read()).issues.includes('integrity-unavailable'));
  } finally { f.sqlite.close(); }
});
test('expiry is exact, invalid dates fail closed, and both dates and validation outcome apply', () => {
  const requirements = [{ id: 'A', data: { controlRef: 'A.8.1' } }];
  const evaluate = (data: Record<string, unknown>) => buildAuditEvidenceAssurance(requirements, [{ id: 'E', data: { controlRef: 'A.8.1', status: 'Onaylandı', ...data } }], now).current;
  assert.equal(evaluate({ expiresAt: '2026-10-02' }), 1);
  for (const data of [{ freshUntil: now.toISOString() }, { freshUntil: '2026-10-02T11:59:59Z' }, { expiresAt: 'bad' }, { expiresAt: '2026-02-30' }, { freshUntil: '2026-02-30T23:00:00Z' }, { expiresAt: '2099-01-01', freshUntil: '2026-10-02T10:00:00Z' }, { validationStatus: 'fail' }, { validationStatus: 'error' }, { status: 'Taslak' }]) assert.equal(evaluate(data), 0, JSON.stringify(data));
  assert.equal(evaluate({ freshUntil: '2026-10-02T15:00:01+03:00' }), 1);
});
test('audit readiness preserves the closed scoped-API boundary and read-only Viewer access', () => {
  assert.equal(scopedApiAllowed({ role: 'Viewer', moduleAccess: { mode: 'full' } }, '/api/audits/readiness', 'GET'), true);
  assert.equal(scopedApiAllowed({ role: 'Editor', moduleAccess: { mode: 'scoped', modules: { 'Denetim Yönetimi': 'write', Kanıtlar: 'read' } } }, '/api/audits/readiness', 'GET'), false);
});

test('client contract accepts real SQLite decisions across ready, blocked, unverified and empty scopes', async () => {
  const f = await fixture(); try {
    for (const name of ['QA Scope', '', 'No such audit']) assert.ok(parseAuditReadinessResult(JSON.parse(JSON.stringify(await f.read(name))), name));
    await f.rule('RULE', 'A.8.1');
    assert.ok(parseAuditReadinessResult(await f.read(), 'QA Scope'));
    f.sqlite.exec('DROP TABLE evidence_automation_rules');
    assert.ok(parseAuditReadinessResult(await f.read(), 'QA Scope'));
  } finally { f.sqlite.close(); }
});

test('client rejects wrong scopes, inconsistent counters, partial decisions and out-of-scope signals', async () => {
  const f = await fixture(); try {
    await f.rule('RULE', 'A.8.1'); const result = await f.read();
    assert.equal(parseAuditReadinessResult(result, 'Different audit'), null);
    const mutations = [
      (v: typeof result) => { v.evidence.current = 99; },
      (v: typeof result) => { v.evidence.requirements[0].requirementIds = []; },
      (v: typeof result) => { v.evidence.requirements[0].currentEvidence = -1; },
      (v: typeof result) => { v.blockerCount = 0; },
      (v: typeof result) => { v.issues = ['records-incomplete']; },
      (v: typeof result) => { v.gate = 'ready'; },
      (v: typeof result) => { v.signals[0].targetControlRef = 'OUTSIDE'; v.signals[0].targetControlRefs = ['OUTSIDE']; },
      (v: typeof result) => { v.unmonitored = ['OUTSIDE']; },
      (v: typeof result) => { v.signals.push(v.signals[0]); },
    ];
    for (const mutate of mutations) { const changed = structuredClone(result); mutate(changed); assert.equal(parseAuditReadinessResult(changed,'QA Scope'),null); }
  } finally { f.sqlite.close(); }
});

test('requirement views retain exact source identity and distinguish eligibility causes without changing readiness', () => {
  const req = (id: string, ref: string, title = ref) => ({ id, data: { controlRef: ref, requirementTitle: title, owner: 'İpek' } });
  const ev = (id: string, ref: string, data: Record<string,unknown>) => ({ id, data: { controlRef: ref, ...data } });
  const result = buildAuditEvidenceAssurance([req('A','C-1'),req('A2','c-1'),req('B','C-2','İzin incelemesi'),req('C','C-3'),req('D','C-4')], [
    ev('E1','C-1',{status:'Onaylandı'}),ev('OLD','C-1',{status:'Onaylandı',expiresAt:'2020-01-01'}),
    ev('E2','C-2',{status:'Taslak',reviewStatus:'pending'}),
    ev('E4','C-4',{status:'Onaylandı',validationStatus:'fail',evidenceIntegrity:'broken'}),
  ],now);
  assert.equal(result.current,1); assert.equal(result.stale,2);
  const current = filterAuditRequirements(result.requirements,'current',''); assert.deepEqual(current[0].requirementIds,['A','A2']); assert.deepEqual(current[0].eligibilityIssues,['expired']);
  assert.equal(filterAuditRequirements(result.requirements,'gaps','').length,3);
  assert.equal(filterAuditRequirements(result.requirements,'missing','')[0].reference,'C-3');
  const pending=filterAuditRequirements(result.requirements,'stale','izin')[0]; assert.equal(pending.reference,'C-2'); assert.deepEqual(pending.eligibilityIssues,['approval-required','review-required']);
  assert.equal(filterAuditRequirements(result.requirements,'all','ipek').length,4);
  assert.deepEqual(result.requirements.find(r=>r.reference==='C-4')?.eligibilityIssues,['validation-failed','integrity-broken']);
  assert.equal(filterAuditRequirements(result.requirements,'all','unknown').length,0);
});
