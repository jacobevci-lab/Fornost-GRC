import {ensureAssuranceExceptionSchema} from '../app/assurance-exception-schema';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureEvidenceAutomationSchema, executeRule } from '../app/api/evidence-automation/core';
import { ensureAssuranceWorkSchema, reconcileApprovedRetests, buildResidualRiskReassessment } from '../app/continuous-assurance-runtime';
import { assessRetestRun } from '../app/assurance-retest';
import { canQueueAssuranceRetest, evaluateAssuranceRecovery } from '../app/assurance-recovery';

const at = (minute: number) => new Date(`2026-10-01T12:${String(minute).padStart(2, '0')}:00Z`);
function database() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, values: (string | number | null)[] = []) { return {
    bind(...args: (string | number | null)[]) { return prepare(sql, args); },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    exec() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
    async run() { return this.exec(); },
  }; }
  let beforeBatch: (() => void) | null = null;
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    const hook = beforeBatch; beforeBatch = null; hook?.();
    sqlite.exec('BEGIN'); try { const result = statements.map(statement => statement.exec()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { sqlite, db, beforeBatch: (hook: () => void) => { beforeBatch = hook; } };
}
async function fixture() {
  const f = database(); await ensureEvidenceAutomationSchema(f.db); await ensureAssuranceWorkSchema(f.db);
  f.sqlite.exec(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('SRC','Fixture','Custom','Custom','rest-json','{"baseUrl":"https://fixture.example/data"}','now','now','qa');
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('RULE','Coverage','SRC','A.8.1','percent','gte','90','daily','now','now','qa');`);
  const execute = (percent: number, minute = 3, error = false) => executeRule({ DB: f.db }, 'RULE', 'owner@fornost.test', 'manual', { now: at(minute), fetcher: async () => new Response(JSON.stringify({ percent }), { status: error ? 503 : 200, headers: { 'content-type': 'application/json' } }) });
  await execute(50, 0);
  const findingId = String(f.sqlite.prepare('SELECT id FROM evidence_automation_findings').get()!.id);
  f.sqlite.prepare("UPDATE evidence_automation_findings SET status='closed',closed_at=?,updated_at=?,closure_evidence_ref='CLOSURE',closure_evidence_sha256=? WHERE id=?").run(at(1).toISOString(), at(1).toISOString(), 'a'.repeat(64), findingId);
  const risk = () => JSON.parse(String(f.sqlite.prepare('SELECT data_json FROM simple_grc_records WHERE id=?').get(findingId)!.data_json));
  const setRisk = (data: Record<string, unknown>) => f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify(data), findingId);
  setRisk({ ...risk(), status: 'Kapalı', residualLikelihood: '2', residualImpact: '3', residualRiskReviewRequired: true, riskReviewRequestedAt: '2026-09-25T12:00:00Z' });
  f.sqlite.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor,reviewed_by,reviewed_at) VALUES('WORK',?,'RULE','control-retest','approved-awaiting-retest',?,?,?,'maker@fornost.test','checker@fornost.test',?)").run(findingId, JSON.stringify({ riskRef: findingId, targetControlRef: 'A.8.1' }), at(1).toISOString(), at(2).toISOString(), at(2).toISOString());
  const work = () => f.sqlite.prepare("SELECT * FROM continuous_assurance_work_items WHERE id='WORK'").get()!;
  const outcome = () => JSON.parse(String(work().decision_json)).retestOutcome;
  return { ...f, findingId, execute, risk, setRisk, work, outcome };
}

test('fresh passing re-test reconciles once and preserves pending independent risk review and its age', async () => {
  const f = await fixture(); try {
    const result = await f.execute(95);
    assert.equal(await reconcileApprovedRetests(f.db, at(4)), 1);
    assert.equal(f.work().status, 'completed'); assert.equal(f.work().result_ref, result.runId);
    assert.equal(f.risk().residualRiskReviewRequired, true); assert.equal(f.risk().riskReviewRequestedAt, '2026-09-25T12:00:00Z');
    assert.equal(f.risk().residualLikelihood, '2'); assert.equal(f.risk().residualScore, '6');
    assert.equal(f.outcome().riskUpdate, 'applied'); assert.equal(f.outcome().evidenceId, result.evidenceId);
    assert.equal(await reconcileApprovedRetests(f.db, at(5)), 0);
    assert.equal(f.sqlite.prepare('SELECT status FROM evidence_automation_findings WHERE id=?').get(f.findingId)!.status, 'closed');
  } finally { f.sqlite.close(); }
});
test('failed real execution links the new open cycle instead of violating the one-open-finding constraint', async () => {
  const f = await fixture(); try {
    const result = await f.execute(40);
    const next = f.sqlite.prepare("SELECT id FROM evidence_automation_findings WHERE status!='closed'").get()!;
    assert.notEqual(next.id, f.findingId);
    assert.equal(await reconcileApprovedRetests(f.db, at(4)), 1);
    assert.equal(f.work().status, 'failed-retest'); assert.equal(f.outcome().followUpFindingId, next.id);
    assert.equal(f.outcome().findingAction, 'linked-open-finding'); assert.equal(f.risk().assuranceState, 'ineffective');
    assert.equal(f.risk().lastAssuranceRunRef, result.runId); assert.equal(f.risk().residualScore, '16');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM evidence_automation_findings WHERE status!='closed'").get()!.n, 1);
  } finally { f.sqlite.close(); }
});
test('a failed re-test below the automatic finding threshold reopens the original exactly once under concurrent reconciliation', async () => {
  const f = await fixture(); try {
    f.sqlite.exec('UPDATE evidence_automation_rules SET auto_finding=0'); await f.execute(40);
    const counts = await Promise.all([reconcileApprovedRetests(f.db, at(4)), reconcileApprovedRetests(f.db, at(4))]);
    assert.equal(counts.reduce((a, b) => a + b, 0), 1);
    const row = f.sqlite.prepare('SELECT status,occurrence_count FROM evidence_automation_findings WHERE id=?').get(f.findingId)!;
    assert.equal(row.status, 'acknowledged'); assert.equal(row.occurrence_count, 2);
    assert.equal(f.outcome().findingAction, 'reopened'); assert.equal(f.outcome().followUpFindingId, f.findingId);
  } finally { f.sqlite.close(); }
});
test('risk write failure rolls back work completion and finding reopen, and the next attempt can recover', async () => {
  const f = await fixture(); try {
    f.sqlite.exec('UPDATE evidence_automation_rules SET auto_finding=0'); await f.execute(40);
    f.sqlite.exec("CREATE TRIGGER fail_risk BEFORE UPDATE ON simple_grc_records WHEN OLD.module='Risk Assessment' BEGIN SELECT RAISE(ABORT,'QA risk write failure'); END");
    await assert.rejects(reconcileApprovedRetests(f.db, at(4)), /QA risk write failure/);
    assert.equal(f.work().status, 'approved-awaiting-retest'); assert.equal(f.work().result_ref, null);
    assert.equal(f.sqlite.prepare('SELECT status FROM evidence_automation_findings WHERE id=?').get(f.findingId)!.status, 'closed');
    f.sqlite.exec('DROP TRIGGER fail_risk'); assert.equal(await reconcileApprovedRetests(f.db, at(5)), 1);
    assert.equal(f.work().status, 'failed-retest');
  } finally { f.sqlite.close(); }
});
test('a concurrent human risk edit defers the batch without losing the edit, then reconciles from the new snapshot', async () => {
  const f = await fixture(); try {
    await f.execute(95);
    f.beforeBatch(() => f.setRisk({ ...f.risk(), owner: 'human@fornost.test', treatment: 'Preserve human treatment', residualLikelihood: '1' }));
    assert.equal(await reconcileApprovedRetests(f.db, at(4)), 0); assert.equal(f.work().status, 'approved-awaiting-retest');
    assert.equal(await reconcileApprovedRetests(f.db, at(5)), 1);
    assert.equal(f.risk().owner, 'human@fornost.test'); assert.equal(f.risk().treatment, 'Preserve human treatment'); assert.equal(f.risk().residualLikelihood, '1');
  } finally { f.sqlite.close(); }
});
test('older results do not overwrite a newer human assessment or reopen a later verified closure', async () => {
  const f = await fixture(); try {
    f.sqlite.exec('UPDATE evidence_automation_rules SET auto_finding=0'); await f.execute(40);
    f.setRisk({ ...f.risk(), lastReassessedAt: at(4).toISOString(), residualScore: '6', residualRiskApprovedBy: 'reviewer@fornost.test' });
    const before = f.risk();
    f.sqlite.prepare('UPDATE evidence_automation_findings SET closed_at=?,updated_at=?').run(at(4).toISOString(), at(4).toISOString());
    await reconcileApprovedRetests(f.db, at(5));
    assert.deepEqual(f.risk(), before); assert.equal(f.outcome().riskUpdate, 'newer-review-preserved'); assert.equal(f.outcome().findingAction, 'newer-closure-preserved');
    assert.equal(f.sqlite.prepare('SELECT status FROM evidence_automation_findings WHERE id=?').get(f.findingId)!.status, 'closed');
  } finally { f.sqlite.close(); }
});
test('missing, mismatched or stale evidence cannot complete a passing re-test', async () => {
  for (const variant of ['missing', 'mismatched', 'stale']) {
    const f = await fixture(); try {
      const result = await f.execute(95);
      if (variant === 'missing') f.sqlite.prepare('DELETE FROM simple_grc_records WHERE id=?').run(result.evidenceId!);
      if (variant === 'mismatched') f.sqlite.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.responseHash',?) WHERE id=?").run('b'.repeat(64), result.evidenceId!);
      await reconcileApprovedRetests(f.db, variant === 'stale' ? new Date('2026-10-03T12:00:00Z') : at(4));
      assert.equal(f.work().status, 'retest-error'); assert.equal(f.risk().assuranceState, 'degraded');
      assert.equal(f.outcome().reason, variant === 'mismatched' ? 'evidence-mismatch' : `evidence-${variant}`);
    } finally { f.sqlite.close(); }
  }
});
test('first run after approval wins deterministically; errors are not replaced by a later passing run', async () => {
  const f = await fixture(); try {
    const failed = await f.execute(95, 3, true); await f.execute(95, 3);
    await reconcileApprovedRetests(f.db, at(4));
    assert.equal(f.work().status, 'retest-error'); assert.equal(f.work().result_ref, failed.runId); assert.equal(f.outcome().reason, 'collection-error');
  } finally { f.sqlite.close(); }
});
test('missing or malformed risk data is explicit and a changed source cannot update an unrelated risk', async () => {
  for (const variant of ['missing', 'invalid', 'source']) {
    const f = await fixture(); try {
      await f.execute(95); const before = f.risk();
      if (variant === 'missing') f.sqlite.prepare('DELETE FROM simple_grc_records WHERE id=?').run(f.findingId);
      if (variant === 'invalid') f.sqlite.prepare("UPDATE simple_grc_records SET data_json='not-json' WHERE id=?").run(f.findingId);
      if (variant === 'source') f.sqlite.prepare("UPDATE evidence_automation_findings SET rule_id='OTHER' WHERE id=?").run(f.findingId);
      await reconcileApprovedRetests(f.db, at(4)); assert.equal(f.work().status, 'retest-error');
      assert.equal(f.outcome().reason, variant === 'source' ? 'source-unavailable' : variant === 'missing' ? 'risk-missing' : 'risk-data-invalid');
      if (variant === 'source') assert.deepEqual(f.risk(), before);
    } finally { f.sqlite.close(); }
  }
});
test('retry readiness allows errors and stale proof but never bypasses verified remediation or a failed control', () => {
  const base = { assuranceState: 'degraded' as const, remediationStatus: 'closed', closureEvidenceRef: 'CLOSURE', closureEvidenceSha256: 'a'.repeat(64), riskLinked: true };
  for (const retestResult of ['not-run', 'error', 'pass'] as const) assert.ok(canQueueAssuranceRetest(evaluateAssuranceRecovery({ ...base, retestResult, retestEvidenceFreshness: 'stale' })));
  assert.equal(canQueueAssuranceRetest(evaluateAssuranceRecovery({ ...base, retestResult: 'fail' })), false);
  for (const delta of [{ remediationStatus: 'open' }, { closureEvidenceSha256: '' }]) assert.equal(canQueueAssuranceRetest(evaluateAssuranceRecovery({ ...base, ...delta, retestResult: 'error' })), false);
  assert.equal(canQueueAssuranceRetest(evaluateAssuranceRecovery({ ...base, retestResult: 'pass', retestEvidenceFreshness: 'fresh' })), false);
});
test('invalid ratings cannot multiply an aggregate score into an impact or clear pending review', () => {
  const risk = buildResidualRiskReassessment({ inherentLikelihood: '4', calculatedImpact: '20', residualLikelihood: '6', residualImpact: '3.5' }, 'pass', 'RUN', at(4).toISOString());
  assert.equal(risk.residualImpact, '4'); assert.equal(risk.residualScore, '16'); assert.equal(risk.residualRiskReviewRequired, true);
  const run = { id: 'R', status: 'pass', evidence_id: 'E', created_at: at(3).toISOString(), response_hash: 'a'.repeat(64), detail: '', error_code: null };
  const raw = JSON.stringify({ validationStatus: 'pass', responseHash: run.response_hash, collectedAt: run.created_at, freshUntil: '2026-10-02T12:00:00Z' });
  assert.equal(assessRetestRun(run, raw, 24, at(2)).status, 'error');
});

test('a pass cannot certify reopened remediation, except an explicitly governed exception re-test', async () => {
  for (const mandatory of [false, true]) {
    const f = await fixture(); try {
      await f.execute(95); f.sqlite.prepare("UPDATE evidence_automation_findings SET status='acknowledged' WHERE id=?").run(f.findingId);
      if (mandatory) f.sqlite.prepare("UPDATE continuous_assurance_work_items SET decision_json=? WHERE id='WORK'").run(JSON.stringify({ source: 'assurance-exception', mandatory: true, riskRef: f.findingId }));
      await reconcileApprovedRetests(f.db, at(4));
      assert.equal(f.work().status, mandatory ? 'completed' : 'retest-error');
      assert.equal(f.outcome().reason, mandatory ? 'passed' : 'remediation-unverified');
    } finally { f.sqlite.close(); }
  }
});
test('evidence deleted during reconciliation prevents a stale success claim', async () => {
  const f = await fixture(); try {
    const result = await f.execute(95);
    f.beforeBatch(() => { f.sqlite.prepare('DELETE FROM simple_grc_records WHERE id=?').run(result.evidenceId!); });
    assert.equal(await reconcileApprovedRetests(f.db, at(4)), 0); assert.equal(f.work().status, 'approved-awaiting-retest');
    assert.equal(await reconcileApprovedRetests(f.db, at(5)), 1); assert.equal(f.work().status, 'retest-error'); assert.equal(f.outcome().reason, 'evidence-missing');
  } finally { f.sqlite.close(); }
});

async function linkedException(f:Awaited<ReturnType<typeof fixture>>,id='EX',workId='WORK',endedAt=at(1).toISOString()){
 await ensureAssuranceExceptionSchema(f.db);
 f.sqlite.prepare("INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at,retest_required,retest_work_item_id,lifecycle_updated_at) VALUES(?,?,'RULE','A.8.1',?,'Documented exception','2026-09-30','EVD',?,'expired','maker',?,1,?,?)").run(id,f.findingId,f.findingId,'a'.repeat(64),at(0).toISOString(),workId,endedAt);
 return()=>f.sqlite.prepare('SELECT * FROM continuous_assurance_exceptions WHERE id=?').get(id)!;
}
test('verified re-test discharges linked exception requirements atomically without approving residual risk',async()=>{
 const f=await fixture();try{const ex=await linkedException(f),other=await linkedException(f,'SHARED');const run=await f.execute(95);assert.equal(await reconcileApprovedRetests(f.db,at(4)),1);assert.equal(ex().retest_required,0);assert.equal(ex().retest_result_ref,run.runId);assert.equal(ex().retest_completed_at,at(4).toISOString());assert.equal(ex().status,'expired');assert.equal(other().retest_required,0);assert.equal(f.risk().residualRiskReviewRequired,true);assert.equal(await reconcileApprovedRetests(f.db,at(5)),0);}finally{f.sqlite.close()}
});
test('failed, errored, unmatched and differently scoped re-tests cannot discharge an exception',async()=>{
 for(const variant of ['fail','error','unmatched','control']){const f=await fixture();try{const ex=await linkedException(f,'EX',variant==='unmatched'?'UNRELATED':'WORK');if(variant==='control')f.sqlite.exec("UPDATE continuous_assurance_exceptions SET control_ref='OTHER'");await f.execute(variant==='fail'?40:95,3,variant==='error');await reconcileApprovedRetests(f.db,at(4));assert.equal(ex().retest_required,1);assert.equal(ex().retest_completed_at,null);assert.equal(ex().retest_result_ref,null);}finally{f.sqlite.close()}}
});
test('a successful retry resolves the original linked error lineage and records the completing work',async()=>{
 const f=await fixture();try{
  f.sqlite.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor,reviewed_by,reviewed_at) VALUES('ORIGINAL',?,'RULE','control-retest','retest-error','{}',?,?,'maker','checker',?)").run(f.findingId,at(0).toISOString(),at(1).toISOString(),at(0).toISOString());
  f.sqlite.exec("UPDATE continuous_assurance_work_items SET decision_json=json_set(decision_json,'$.retryOf','ORIGINAL') WHERE id='WORK'");
  const ex=await linkedException(f,'EX','ORIGINAL');await f.execute(95);await reconcileApprovedRetests(f.db,at(4));assert.equal(ex().retest_required,0);assert.equal(ex().retest_work_item_id,'WORK');assert.equal(f.risk().residualRiskReviewRequired,true);
 }finally{f.sqlite.close()}
});
test('exception completion write failure rolls back work and risk changes and permits a clean retry',async()=>{
 const f=await fixture();try{const ex=await linkedException(f);await f.execute(95);f.sqlite.exec("CREATE TRIGGER fail_exception BEFORE UPDATE ON continuous_assurance_exceptions BEGIN SELECT RAISE(ABORT,'exception completion failure'); END");await assert.rejects(reconcileApprovedRetests(f.db,at(4)),/exception completion failure/);assert.equal(f.work().status,'approved-awaiting-retest');assert.equal(ex().retest_required,1);assert.notEqual(f.risk().assuranceState,'effective');f.sqlite.exec('DROP TRIGGER fail_exception');await reconcileApprovedRetests(f.db,at(5));assert.equal(ex().retest_required,0);}finally{f.sqlite.close()}
});
test('a reused approved task must consume a run after the exception ended, not a previously collected pass',async()=>{
 const f=await fixture();try{const ex=await linkedException(f,'EX','WORK',at(4).toISOString());await f.execute(95,3);assert.equal(await reconcileApprovedRetests(f.db,at(4)),0);assert.equal(ex().retest_required,1);const latest=await f.execute(95,5);await reconcileApprovedRetests(f.db,at(6));assert.equal(ex().retest_result_ref,latest.runId);assert.equal(ex().retest_required,0);}finally{f.sqlite.close()}
});

test('an exception linked or extended during reconciliation invalidates the selected older run',async()=>{
 const f=await fixture();try{const ex=await linkedException(f);await f.execute(95,3);f.beforeBatch(()=>f.sqlite.prepare("UPDATE continuous_assurance_exceptions SET lifecycle_updated_at=? WHERE id='EX'").run(at(4).toISOString()));assert.equal(await reconcileApprovedRetests(f.db,at(4)),0);assert.equal(f.work().status,'approved-awaiting-retest');assert.equal(ex().retest_required,1);await f.execute(95,5);assert.equal(await reconcileApprovedRetests(f.db,at(6)),1);assert.equal(ex().retest_required,0);}finally{f.sqlite.close()}
});
