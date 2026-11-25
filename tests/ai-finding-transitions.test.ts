import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createAiFinding,writeAiFindingTransition } from '../app/ai/finding-transitions';
const stamp='2090-01-01T00:00:00.000Z';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('drizzle/0063_fornost_ai_findings.sql','utf8'));
 sqlite.prepare("INSERT INTO ai_findings(id,model_id,domain,source_ref,title,description,root_cause,corrective_action,preventive_action,owner,severity,due_date,created_by,created_at,updated_by,updated_at,status,submitted_by) VALUES('AIF-1','AIM-1','model','source','Title','Description','Cause','Corrective','Preventive','owner','High','2027-01-01','maker',?,'maker',?,'verification','maker')").run(stamp,stamp);
 function prepare(sql:string,values:unknown[]=[]){return{bind(...args:unknown[]){return prepare(sql,args);},exec(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values as (string|number|null)[]).changes)}};}};}
 sqlite.exec('CREATE TABLE ai_activity_logs(id TEXT PRIMARY KEY,actor TEXT,action TEXT,provider TEXT,model TEXT,prompt_hash TEXT,context_refs_json TEXT,status TEXT,latency_ms INTEGER,detail TEXT,created_at TEXT)');
 let beforeBatch:(()=>void)|undefined;
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database,row=()=>({...sqlite.prepare('SELECT * FROM ai_findings').get()!});
 return{sqlite,row,db,beforeBatch:(fn:()=>void)=>{beforeBatch=fn;},write:(snapshot:Record<string,unknown>,version=stamp)=>writeAiFindingTransition(db,snapshot,{action:'resolve',note:'Independent verification',evidenceReference:'EVD-verify',evidenceSha256:'a'.repeat(64)},'resolved','reviewer',version)};
}
test('finding verification advances the version and stores independent verification evidence',async()=>{const f=fixture();try{const result=await f.write(f.row());assert.equal(result.status,200);assert.ok(result.updatedAt!>stamp);assert.equal(f.row().verified_by,'reviewer');assert.equal(f.row().submitted_by,'maker');assert.equal(f.row().verification_evidence_sha256,'a'.repeat(64));assert.equal(f.row().status,'resolved');}finally{f.sqlite.close();}});
test('stale invalid missing and replayed finding revisions leave current evidence untouched',async()=>{const f=fixture();try{const snapshot=f.row();for(const version of ['', 'invalid','2026-01-01T00:00:00.000Z'])assert.equal((await f.write(snapshot,version)).status,409);assert.equal((await f.write(snapshot)).status,200);const latest=f.row();assert.equal((await f.write(snapshot)).status,409);assert.deepEqual(f.row(),latest);}finally{f.sqlite.close();}});
test('concurrent status version or submitter changes defeat an already authorized finding write',async()=>{for(const change of ["status='in-progress'","updated_at='2091-01-01T00:00:00.000Z'","submitted_by='reviewer'"]){const f=fixture();try{const snapshot=f.row();f.sqlite.exec(`UPDATE ai_findings SET ${change}`);const changed=f.row();assert.equal((await f.write(snapshot)).status,409);assert.deepEqual(f.row(),changed);}finally{f.sqlite.close();}}});

test('audit failure rolls back decision, evidence, actor and version for every transition',async()=>{
 for(const [action,status,next] of [['start','open','in-progress'],['submit','in-progress','verification'],['resolve','verification','resolved'],['reopen','resolved','in-progress']]){
  const f=fixture();try{f.sqlite.prepare('UPDATE ai_findings SET status=?').run(status);const snapshot=f.row();f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ai_activity_logs BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");
   await assert.rejects(writeAiFindingTransition(f.db,snapshot,{action,note:'Reviewed decision',evidenceReference:'EVD-review',evidenceSha256:'b'.repeat(64)},next,'reviewer',stamp),/injected audit failure/);
   assert.deepEqual(f.row(),snapshot);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);
  }finally{f.sqlite.close();}
 }
});
test('successful decision records the evidence hash and authoritative source once; stale replay emits no audit',async()=>{
 const f=fixture();try{const snapshot=f.row();await f.write(snapshot);await f.write(snapshot);const logs=f.sqlite.prepare('SELECT * FROM ai_activity_logs').all();assert.equal(logs.length,1);assert.equal(logs[0].action,'ai-finding-resolve');assert.equal(logs[0].prompt_hash,'a'.repeat(64));assert.deepEqual(JSON.parse(String(logs[0].context_refs_json)),['AIM-1','source','AIF-1']);}finally{f.sqlite.close();}
});
test('concurrent source identity or evidence changes prevent unaudited overwrites',async()=>{
 for(const change of ["model_id='different'","source_ref='different'","evidence_sha256='different'","verification_evidence_reference='different'"]){const f=fixture();try{const snapshot=f.row();f.beforeBatch(()=>f.sqlite.exec(`UPDATE ai_findings SET ${change}`));assert.equal((await f.write(snapshot)).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}}
});
const value={modelId:'AIM-1',domain:'model',sourceRef:'source',title:'Finding title',description:'Reviewed production measurement',rootCause:'Reviewed model change root cause',correctiveAction:'Correct the model measurement',preventiveAction:'Maintain the monitoring control',owner:'owner',severity:'High',dueDate:'2091-01-01'};
function enableModel(f:ReturnType<typeof fixture>){f.sqlite.exec(readFileSync('drizzle/0043_fornost_ai_model_inventory.sql','utf8'));const cols=f.sqlite.prepare('PRAGMA table_info(ai_model_inventory)').all().filter(c=>c.notnull||c.pk);const values:Record<string,string>={id:'AIM-1',status:'approved'};f.sqlite.prepare(`INSERT INTO ai_model_inventory(${cols.map(c=>c.name).join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>values[String(c.name)]??(String(c.type).includes('INTEGER')?1:'fixture')));}
test('creation and its audit commit once; duplicate and inactive or missing models have no side effects',async()=>{
 const f=fixture();try{enableModel(f);f.sqlite.exec('DELETE FROM ai_findings');assert.equal((await createAiFinding(f.db,value,'maker')).status,201);assert.equal((await createAiFinding(f.db,value,'maker')).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_findings').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,1);
  f.sqlite.exec("UPDATE ai_model_inventory SET status='retired'");assert.equal((await createAiFinding(f.db,{...value,sourceRef:'different'},'maker')).status,409);assert.equal((await createAiFinding(f.db,{...value,modelId:'missing'},'maker')).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,1);
 }finally{f.sqlite.close();}
});
test('creation audit failure leaves neither finding nor audit; retirement before commit also blocks creation',async()=>{
 const f=fixture();try{enableModel(f);f.sqlite.exec("DELETE FROM ai_findings; CREATE TRIGGER fail_audit BEFORE INSERT ON ai_activity_logs BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");await assert.rejects(createAiFinding(f.db,value,'maker'),/injected audit failure/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_findings').get()!.n,0);f.sqlite.exec('DROP TRIGGER fail_audit');f.beforeBatch(()=>f.sqlite.exec("UPDATE ai_model_inventory SET status='retired'"));assert.equal((await createAiFinding(f.db,value,'maker')).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}
});
test('a competing source finding committed before reopen returns conflict rather than a constraint error',async()=>{
 const f=fixture();try{enableModel(f);f.sqlite.exec("UPDATE ai_findings SET status='resolved'");const snapshot=f.row();assert.equal((await createAiFinding(f.db,value,'maker')).status,201);const result=await writeAiFindingTransition(f.db,snapshot,{action:'reopen',note:'Reviewed reopening',evidenceReference:'',evidenceSha256:''},'in-progress','reviewer',stamp);assert.equal(result.status,409);assert.equal(f.sqlite.prepare("SELECT status FROM ai_findings WHERE id='AIF-1'").get()!.status,'resolved');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,1);}finally{f.sqlite.close();}
});
