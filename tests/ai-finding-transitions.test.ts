import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { writeAiFindingTransition } from '../app/ai/finding-transitions';
const stamp='2090-01-01T00:00:00.000Z';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('drizzle/0063_fornost_ai_findings.sql','utf8'));
 sqlite.prepare("INSERT INTO ai_findings(id,model_id,domain,source_ref,title,description,root_cause,corrective_action,preventive_action,owner,severity,due_date,created_by,created_at,updated_by,updated_at,status,submitted_by) VALUES('AIF-1','AIM-1','model','source','Title','Description','Cause','Corrective','Preventive','owner','High','2027-01-01','maker',?,'maker',?,'verification','maker')").run(stamp,stamp);
 function prepare(sql:string,values:unknown[]=[]){return{bind(...args:unknown[]){return prepare(sql,args);},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values as (string|number|null)[]).changes)}};}};}
 const db={prepare} as unknown as D1Database,row=()=>({...sqlite.prepare('SELECT * FROM ai_findings').get()!});
 return{sqlite,row,write:(snapshot:Record<string,unknown>,version=stamp)=>writeAiFindingTransition(db,snapshot,{action:'resolve',note:'Independent verification',evidenceReference:'EVD-verify',evidenceSha256:'a'.repeat(64)},'resolved','reviewer',version)};
}
test('finding verification advances the version and stores independent verification evidence',async()=>{const f=fixture();try{const result=await f.write(f.row());assert.equal(result.status,200);assert.ok(result.updatedAt!>stamp);assert.equal(f.row().verified_by,'reviewer');assert.equal(f.row().submitted_by,'maker');assert.equal(f.row().verification_evidence_sha256,'a'.repeat(64));assert.equal(f.row().status,'resolved');}finally{f.sqlite.close();}});
test('stale invalid missing and replayed finding revisions leave current evidence untouched',async()=>{const f=fixture();try{const snapshot=f.row();for(const version of ['', 'invalid','2026-01-01T00:00:00.000Z'])assert.equal((await f.write(snapshot,version)).status,409);assert.equal((await f.write(snapshot)).status,200);const latest=f.row();assert.equal((await f.write(snapshot)).status,409);assert.deepEqual(f.row(),latest);}finally{f.sqlite.close();}});
test('concurrent status version or submitter changes defeat an already authorized finding write',async()=>{for(const change of ["status='in-progress'","updated_at='2091-01-01T00:00:00.000Z'","submitted_by='reviewer'"]){const f=fixture();try{const snapshot=f.row();f.sqlite.exec(`UPDATE ai_findings SET ${change}`);const changed=f.row();assert.equal((await f.write(snapshot)).status,409);assert.deepEqual(f.row(),changed);}finally{f.sqlite.close();}}});
