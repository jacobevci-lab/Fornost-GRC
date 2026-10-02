import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {transitionAssuranceException, reconcileExpiredExceptions, type ExceptionRow} from '../app/assurance-exception-runtime';
const now=new Date('2026-10-02T10:00:00.000Z'),maker='maker@fornost.test',checker='checker@fornost.test';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 const route=readFileSync('app/api/continuous-assurance/governance/route.ts','utf8');
 sqlite.exec(route.match(/`(CREATE TABLE IF NOT EXISTS continuous_assurance_exceptions[^`]+)`/)![1]);
 sqlite.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT);
 CREATE TABLE continuous_assurance_work_items(id TEXT PRIMARY KEY,finding_id TEXT,rule_id TEXT,action TEXT,status TEXT,decision_json TEXT,created_at TEXT,updated_at TEXT,actor TEXT);`);
 sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?)').run('RISK','Risk Assessment',JSON.stringify({title:'Payment risk',owner:'Owner',residualLikelihood:'4',residualImpact:'4',assuranceState:'ineffective'}),now.toISOString());
 sqlite.exec("INSERT INTO simple_grc_record_codes VALUES('RISK','RSK-001')");
 let hook:(()=>void)|undefined;
 function prepare(sql:string,values:(string|number|null)[]=[]){return{bind(...v:(string|number|null)[]){return prepare(sql,v)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},exec(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}},async run(){return this.exec()}}}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const h=hook;hook=undefined;h?.();sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 const create=(id='EX',status='pending-review',expires='2026-10-03')=>sqlite.prepare(`INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at) VALUES(?,'FIND','RULE','CTRL','RSK-001','Documented temporary risk acceptance',?,'EVD',?,?,?,?)`).run(id,expires,'a'.repeat(64),status,maker,now.toISOString());
 const row=(id='EX')=>sqlite.prepare('SELECT * FROM continuous_assurance_exceptions WHERE id=?').get(id) as ExceptionRow;
 const risk=()=>JSON.parse(sqlite.prepare("SELECT data_json FROM simple_grc_records WHERE id='RISK'").get()!.data_json as string);
 const write=(delta:Record<string,unknown>)=>sqlite.prepare("UPDATE simple_grc_records SET data_json=? WHERE id='RISK'").run(JSON.stringify({...risk(),...delta}));
 const work=()=>sqlite.prepare('SELECT * FROM continuous_assurance_work_items').all();
 const act=(action:'approve'|'reject'|'revoke'|'expire',id='EX',actor=checker)=>transitionAssuranceException(db,id,action,actor,'Documented independent decision',now);
 return{sqlite,db,create,row,risk,write,work,act,interleave:(h:()=>void)=>{hook=h}};
}
test('approval and rejection are independent, guarded decisions; approval preserves assurance and ratings',async()=>{
 const f=fixture();try{f.create();await assert.rejects(f.act('approve','EX',` ${maker.toUpperCase()} `),/Maker-checker/);assert.equal((await f.act('approve')).status,'active');assert.equal(f.risk().assuranceExceptionStatus,'active');assert.equal(f.risk().residualLikelihood,'4');assert.equal(f.risk().assuranceState,'ineffective');await assert.rejects(f.act('reject'),/başka bir işlemde/);f.create('SECOND');await f.act('reject','SECOND');assert.equal(f.row('SECOND').status,'rejected');assert.equal(f.risk().assuranceExceptionRef,'EX');}finally{f.sqlite.close()}
});
test('concurrent approve/reject yields one winner even for the same actor and timestamp',async()=>{
 const f=fixture();try{f.create();const result=await Promise.allSettled([f.act('approve'),f.act('reject')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.risk().assuranceExceptionStatus,f.row().status==='active'?'active':undefined);}finally{f.sqlite.close()}
});
test('a concurrent risk or proposal edit cannot be lost or approved from a stale snapshot',async()=>{
 for(const kind of ['risk','proposal']){const f=fixture();try{f.create();f.interleave(()=>kind==='risk'?f.write({owner:'Concurrent owner'}):f.sqlite.exec("UPDATE continuous_assurance_exceptions SET reason='Changed scope'"));await assert.rejects(f.act('approve'),/başka bir işlemde/);assert.equal(f.row().status,'pending-review');assert.equal(f.risk().assuranceExceptionRef,undefined);if(kind==='risk')assert.equal(f.risk().owner,'Concurrent owner');}finally{f.sqlite.close()}}
});
test('revocation creates one mandatory re-test and marks canonical risk for review; duplicate actions do nothing',async()=>{
 const f=fixture();try{f.create();await f.act('approve');await assert.rejects(f.act('revoke','EX',maker),/Maker-checker/);const result=await f.act('revoke');assert.equal(f.row().status,'revoked');assert.equal(f.row().retest_required,1);assert.equal(f.row().retest_work_item_id,result.retestWorkItemId);assert.equal(f.work().length,1);const decision=JSON.parse(f.work()[0].decision_json as string);assert.equal(decision.mandatory,true);assert.equal(decision.riskRef,'RISK');assert.equal(f.risk().residualRiskReviewRequired,true);assert.equal(f.risk().assuranceState,'ineffective');await assert.rejects(f.act('revoke'));assert.equal(f.work().length,1);}finally{f.sqlite.close()}
});
test('expiration competes safely with revocation and repeat reconciliation is idempotent',async()=>{
 const f=fixture();try{f.create('EX','active','2026-10-01');const result=await Promise.allSettled([f.act('expire'),f.act('revoke')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.work().length,1);assert.equal(await reconcileExpiredExceptions(f.db,now),0);assert.equal(f.risk().residualRiskReviewRequired,true);}finally{f.sqlite.close()}
});
test('work insertion and risk write failures roll back the complete lifecycle and allow retry',async()=>{
 for(const table of ['continuous_assurance_work_items','simple_grc_records']){const f=fixture();try{f.create('EX','active');f.sqlite.exec(`CREATE TRIGGER fail_write BEFORE ${table==='simple_grc_records'?'UPDATE':'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'injected failure'); END`);await assert.rejects(f.act('revoke'),/injected failure/);assert.equal(f.row().status,'active');assert.equal(f.row().lifecycle_token,'');assert.equal(f.row().retest_required,0);assert.equal(f.work().length,0);assert.equal(f.risk().residualRiskReviewRequired,undefined);f.sqlite.exec('DROP TRIGGER fail_write');await f.act('revoke');assert.equal(f.row().status,'revoked');assert.equal(f.work().length,1);}finally{f.sqlite.close()}}
});
test('approval failure rolls back the decision and risk snapshot together',async()=>{
 const f=fixture();try{f.create();f.sqlite.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON simple_grc_records BEGIN SELECT RAISE(ABORT,'injected failure'); END");await assert.rejects(f.act('approve'),/injected failure/);assert.equal(f.row().status,'pending-review');f.sqlite.exec('DROP TRIGGER fail_write');await f.act('approve');assert.equal(f.row().status,'active');}finally{f.sqlite.close()}
});
test('same finding/rule reuses an outstanding re-test, but a different rule cannot capture the task',async()=>{
 const f=fixture();try{f.create('FIRST','active');f.create('SECOND','active');await f.act('revoke','FIRST');await f.act('revoke','SECOND');assert.equal(f.work().length,1);assert.equal(f.row('FIRST').retest_work_item_id,f.row('SECOND').retest_work_item_id);f.create('THIRD','active');f.sqlite.exec("UPDATE continuous_assurance_exceptions SET rule_id='OTHER' WHERE id='THIRD'");await f.act('revoke','THIRD');assert.equal(f.work().length,2);assert.notEqual(f.row('THIRD').retest_work_item_id,f.row('FIRST').retest_work_item_id);}finally{f.sqlite.close()}
});
test('ending an older exception preserves a newer active summary and the original review age',async()=>{
 const f=fixture();try{f.create('OLD','active');f.create('NEW');await f.act('approve','NEW');f.write({riskReviewRequestedAt:'2026-09-01T00:00:00Z'});await f.act('revoke','OLD');assert.equal(f.risk().assuranceExceptionRef,'NEW');assert.equal(f.risk().assuranceExceptionStatus,'active');assert.equal(f.risk().residualRiskReviewRequired,true);assert.equal(f.risk().riskReviewRequestedAt,'2026-09-01T00:00:00Z');}finally{f.sqlite.close()}
});
test('expiry is inclusive of its final UTC day and never extends an expired pending request',async()=>{
 const f=fixture();try{f.create('TODAY','active','2026-10-02');f.create('PAST','active','2026-10-01');assert.equal(await reconcileExpiredExceptions(f.db,now),1);assert.equal(f.row('TODAY').status,'active');assert.equal(f.row('PAST').status,'expired');f.create('LATE','pending-review','2026-10-01');await assert.rejects(f.act('approve','LATE'),/Süresi geçmiş/);await f.act('reject','LATE');assert.equal(f.row('LATE').status,'rejected');}finally{f.sqlite.close()}
});
test('missing or invalid linked risks fail approval safely; manual lifecycle still works without risk or automation',async()=>{
 const f=fixture();try{f.create();f.sqlite.exec("DELETE FROM simple_grc_records");await assert.rejects(f.act('approve'),/Bağlı risk bulunamadı/);await f.act('reject');f.create('MANUAL');f.sqlite.exec("UPDATE continuous_assurance_exceptions SET risk_ref='',finding_id='',rule_id='' WHERE id='MANUAL'");await f.act('approve','MANUAL');const result=await f.act('revoke','MANUAL');assert.equal(result.retestWorkItemId,'');assert.equal(f.row('MANUAL').retest_required,1);assert.equal(f.work().length,0);}finally{f.sqlite.close()}
});
test('reconciliation leaves a conflict for retry without orphan tasks',async()=>{
 const f=fixture();try{f.create('EX','active','2026-10-01');f.interleave(()=>f.write({owner:'Concurrent editor'}));assert.equal(await reconcileExpiredExceptions(f.db,now),0);assert.equal(f.row().status,'active');assert.equal(f.work().length,0);assert.equal(await reconcileExpiredExceptions(f.db,now),1);assert.equal(f.risk().owner,'Concurrent editor');}finally{f.sqlite.close()}
});
