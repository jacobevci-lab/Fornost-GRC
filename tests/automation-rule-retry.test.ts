import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {ensureEvidenceAutomationSchema} from '../app/api/evidence-automation/core';
import {insertAutomationRule,ruleCreationRequestId,RuleCreationConflict,type RuleInput} from '../app/evidence/rule-write';

async function fixture(){
 const sql=new DatabaseSync(':memory:');let beforeWrite:(()=>void)|undefined;let queue=Promise.resolve();
 function prepare(query:string,values:SQLInputValue[]=[]){return {
  bind(...args:SQLInputValue[]){return prepare(query,args)},
  async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}},
 };}
 const db={prepare,batch(statements:ReturnType<typeof prepare>[]){
  const operation=queue.then(async()=>{const hook=beforeWrite;beforeWrite=undefined;hook?.();sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}});
  queue=operation.then(()=>{},()=>{});return operation;
 }} as unknown as D1Database;
 await ensureEvidenceAutomationSchema(db);
 const now='2026-11-16T10:00:00.000Z';
 sql.prepare('INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?)').run('source','Source','QA','QA','rest-json','{}',now,now,'admin@example.test');
 sql.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run('CTL-001','Kontroller','{}',now,now);
 const input=(patch:Partial<RuleInput>={}):RuleInput=>({id:crypto.randomUUID(),name:'QA control',sourceId:'source',controlRefs:'CTL-001',jsonPath:'$.healthy',operator:'exists',expected:'',schedule:'daily',now,actor:'admin@example.test',freshnessHours:24,failureThreshold:2,autoFinding:true,owner:'admin@example.test',remediationDueDays:7,nextRunAt:'2026-11-17T10:00:00.000Z',...patch});
 const save=(key?:string,patch:Partial<RuleInput>={})=>insertAutomationRule(db,input(patch),key);
 const count=(table:string)=>Number(sql.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
 return {sql,db,save,count,race:(fn:()=>void)=>{beforeWrite=fn}};
}
test('lost acknowledgement replay returns the original ID without touching schedule or history',async()=>{
 const f=await fixture();try{const key=crypto.randomUUID(),first=await f.save(key);assert.equal(first.reused,false);
 f.sql.prepare("UPDATE evidence_automation_rules SET enabled=0,last_status='fail',consecutive_failures=3,next_run_at=NULL WHERE id=?").run(first.ruleId);
 const before=f.sql.prepare('SELECT * FROM evidence_automation_rules WHERE id=?').get(first.ruleId);
 const replay=await f.save(key,{now:'2026-11-18T10:00:00.000Z',nextRunAt:'2026-11-19T10:00:00.000Z'});
 assert.deepEqual(replay,{ruleId:first.ruleId,reused:true});assert.deepEqual(f.sql.prepare('SELECT * FROM evidence_automation_rules WHERE id=?').get(first.ruleId),before);
 assert.equal(f.count('evidence_automation_rules'),1);assert.equal(f.count('evidence_rule_creation_requests'),1);
 }finally{f.sql.close()}
});
test('concurrent identical requests commit exactly one rule and one receipt',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),results=await Promise.all(Array.from({length:8},()=>f.save(key)));
 assert.equal(new Set(results.map(r=>r.ruleId)).size,1);assert.equal(results.filter(r=>!r.reused).length,1);assert.equal(f.count('evidence_automation_rules'),1);assert.equal(f.count('evidence_rule_creation_requests'),1);
}finally{f.sql.close()}});
test('changed payload rejects with the owned existing ID; concurrent competing payload cannot overwrite',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),results=await Promise.allSettled([f.save(key),f.save(key,{schedule:'weekly'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.ok(rejected.reason instanceof RuleCreationConflict);
 assert.equal(f.count('evidence_automation_rules'),1);assert.ok(rejected.reason.ruleId);
 for(const patch of [{name:'Changed'},{controlRefs:'A.8.1'},{expected:'different'},{autoFinding:false},{owner:'other@example.test'}])await assert.rejects(f.save(key,patch),RuleCreationConflict);
}finally{f.sql.close()}});
test('actor scopes and intentional new requests are distinct; malformed keys never write',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),a=await f.save(key),b=await f.save(key,{actor:'other@example.test'}),c=await f.save(crypto.randomUUID());assert.equal(new Set([a.ruleId,b.ruleId,c.ruleId]).size,3);
 for(const value of ['',null,12,{},'x'.repeat(36),key+'x'])assert.throws(()=>ruleCreationRequestId(value));assert.equal(f.count('evidence_automation_rules'),3);
}finally{f.sql.close()}});
test('a deleted result stays deleted when the original request is replayed',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),saved=await f.save(key);f.sql.prepare('DELETE FROM evidence_automation_rules WHERE id=?').run(saved.ruleId);
 await assert.rejects(f.save(key),(e:unknown)=>e instanceof RuleCreationConflict&&e.ruleId==='');assert.equal(f.count('evidence_automation_rules'),0);assert.equal(f.count('evidence_rule_creation_requests'),1);
}finally{f.sql.close()}});
test('missing references, source deletion and receipt failures leave neither a rule nor a claim',async()=>{for(const kind of ['reference','source','receipt']){const f=await fixture();try{
 if(kind==='reference')f.race(()=>f.sql.exec('DELETE FROM simple_grc_records'));
 if(kind==='source')f.race(()=>f.sql.exec('DELETE FROM evidence_automation_sources'));
 if(kind==='receipt')f.sql.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON evidence_rule_creation_requests BEGIN SELECT RAISE(ABORT,'receipt-failed'); END");
 await assert.rejects(f.save(crypto.randomUUID()));assert.equal(f.count('evidence_automation_rules'),0);assert.equal(f.count('evidence_rule_creation_requests'),0);
}finally{f.sql.close()}}});
test('legacy unkeyed requests remain compatible and schema initialization is repeatable',async()=>{const f=await fixture();try{
 await ensureEvidenceAutomationSchema(f.db);await f.save();await f.save();assert.equal(f.count('evidence_automation_rules'),2);assert.equal(f.count('evidence_rule_creation_requests'),0);
}finally{f.sql.close()}});
