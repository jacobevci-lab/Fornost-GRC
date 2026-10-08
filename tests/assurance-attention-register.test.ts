import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readAssuranceAttention} from '../app/assurance-attention-register';
import {needsAssuranceAttention,parseAssuranceAssessment,validAssuranceAssessment} from '../app/assurance-queue-attention';
import {validAssuranceQueue} from '../app/assurance-queue-access';
import {assuranceQueueSummary} from '../app/assurance-queue-summary';
const at=new Date('2026-10-08T12:00:00.000Z');
function fixture(beforeRead?:(count:number,sql:DatabaseSync)=>void){
 const sql=new DatabaseSync(':memory:');let reads=0;
 sql.exec(`CREATE TABLE continuous_assurance_work_items(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,finding_id TEXT,rule_id TEXT,result_ref TEXT,action TEXT,created_at TEXT,decision_json TEXT);
 CREATE TABLE evidence_automation_findings(id TEXT PRIMARY KEY,title TEXT,severity TEXT,owner TEXT,due_date TEXT,rule_id TEXT);
 CREATE TABLE evidence_automation_rules(id TEXT PRIMARY KEY,name TEXT,control_refs TEXT);
 CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT);
 INSERT INTO evidence_automation_findings VALUES('F','Finding','high','','','R');
 INSERT INTO evidence_automation_rules VALUES('R','Rule','CTRL');`);
 const db={prepare(query:string){let values:SQLInputValue[]=[];return {bind(...args:SQLInputValue[]){values=args;return this;},async all(){reads++;beforeRead?.(reads,sql);return {results:sql.prepare(query).all(...values)};}};}} as unknown as D1Database;
 const insert=sql.prepare("INSERT INTO continuous_assurance_work_items VALUES(?,?,?,'F','R',NULL,'control-retest',?,'{}')");
 return {sql,db,reads:()=>reads,add:(id:string,status='pending-review',created=at.toISOString())=>insert.run(id,status,at.toISOString(),created)};
}
test('attention scans beyond healthy pages with a bounded empty continuation and no skipped matches',async()=>{
 const f=fixture();try{
  for(let i=0;i<2105;i++)f.add(`H-${String(i).padStart(4,'0')}`);
  f.add('Z-BREACH','pending-review','2026-10-08T04:00:00.000Z');f.add('Z-UNKNOWN','pending-review','2026-02-30T00:00:00Z');
  f.add('Z-FAIL','failed-retest');f.add('Z-ERROR','retest-error');f.add('Z-CLOSED','completed','invalid');
  const first=await readAssuranceAttention(f.db,at);
  assert.equal(first.scanned,2000);assert.equal(f.reads(),4);assert.equal(first.rows.length,0);assert.equal(first.coverage.complete,false);assert.ok(first.nextCursor);
  const last=await readAssuranceAttention<{id:string;status:string;updated_at:string;action:string;created_at:string;source_state:'linked'}>(f.db,at,first.nextCursor!);
  assert.equal(last.scanned,109);assert.deepEqual(last.rows.map(r=>r.id),['Z-BREACH','Z-UNKNOWN','Z-FAIL','Z-ERROR']);assert.equal(last.coverage.complete,true);assert.equal(last.nextCursor,null);
  const searched=await readAssuranceAttention(f.db,at,undefined,{query:'Z-BREACH',lang:'en'});
  assert.equal(searched.scanned,1);assert.equal(searched.rows.length,1);
 }finally{f.sql.close();}
});
test('attention pages cap matches at 500 and missing source context remains visible',async()=>{
 const f=fixture();try{
  for(let i=0;i<503;i++)f.add(`W-${String(i).padStart(4,'0')}`);
  f.sql.exec('DROP TABLE evidence_automation_rules');
  const first=await readAssuranceAttention(f.db,at);
  assert.equal(first.context,'work-only');assert.equal(first.rows.length,500);assert.equal(first.scanned,500);
  const last=await readAssuranceAttention(f.db,at,first.nextCursor!);
  assert.equal(last.rows.length,3);assert.equal(last.coverage.complete,true);
  assert.equal(new Set([...first.rows,...last.rows].map(r=>r.id)).size,503);
 }finally{f.sql.close();}
});
test('attention uses the same strict timestamps, source integrity and SLA thresholds as the client',async()=>{
 const f=fixture();try{
  const dates=['2026-10-08T04:00:00.000Z','2026-10-08T04:00:00.001Z','2026-10-08T07:00:00+03:00','2026-02-30T00:00:00Z','2026-10-08T12:00:00','2026-10-09T00:00:00Z','',at.toISOString()];
  dates.forEach((date,i)=>f.add(`W-${i}`,'pending-review',date));
  f.add('BROKEN');f.sql.exec("UPDATE continuous_assurance_work_items SET finding_id='missing' WHERE id='BROKEN'");
  const result=await readAssuranceAttention(f.db,at);
  const expected=['BROKEN',...dates.flatMap((createdAt,i)=>needsAssuranceAttention({action:'control-retest',status:'pending-review',severity:'high',createdAt,sourceState:'linked'},at)?[`W-${i}`]:[])];
  assert.deepEqual(result.rows.map(r=>r.id),expected);
  f.sql.exec("UPDATE evidence_automation_findings SET severity='critical'");
  f.add('CRITICAL','pending-review','2026-10-08T08:00:00.000Z');
  assert.ok((await readAssuranceAttention(f.db,at)).rows.some(r=>r.id==='CRITICAL'));
 }finally{f.sql.close();}
});
test('attention propagates storage failures instead of reporting an empty healthy queue',async()=>{
 const db={prepare(){return {bind(){return this;},async all(){throw new Error('database is locked');}};}} as unknown as D1Database;
 await assert.rejects(()=>readAssuranceAttention(db,at),/database is locked/);
});
test('assessment instants are canonical, stable on continuation and expire after one day',()=>{
 assert.equal(parseAssuranceAssessment(null,false,at),at);
 assert.equal(parseAssuranceAssessment(at.toISOString(),true,at).toISOString(),at.toISOString());
 for(const value of ['invalid','2026-02-30T00:00:00.000Z','2026-10-08T12:00:00Z',null,1])assert.equal(validAssuranceAssessment(value),false);
 assert.throws(()=>parseAssuranceAssessment(null,true,at));
 for(const value of ['2026-10-08T12:00:00.001Z','2026-10-07T11:59:59.999Z','bad'])assert.throws(()=>parseAssuranceAssessment(value,true,at));
});
test('empty partial attention pages require valid scan metadata while normal pages stay strict',()=>{
 const body={filter:'attention',items:[],summary:assuranceQueueSummary([]),coverage:{loaded:0,complete:false},assessmentAt:at.toISOString(),scanned:2000,nextCursor:JSON.stringify([0,at.toISOString(),'H-1999'])};
 assert.equal(validAssuranceQueue(body),true);
 for(const scanned of [-1,0,0.5,2001,'2000',null])assert.equal(validAssuranceQueue({...body,scanned}),false);
 for(const assessmentAt of ['',null,'2026-02-30T00:00:00.000Z'])assert.equal(validAssuranceQueue({...body,assessmentAt}),false);
 assert.equal(validAssuranceQueue({...body,filter:'review'}),false);
 assert.equal(validAssuranceQueue({...body,nextCursor:null}),false);
 assert.equal(validAssuranceQueue({...body,scanned:0,nextCursor:null,coverage:{loaded:0,complete:true}}),true);
});

test('attention rejects a context change between bounded scan batches',async()=>{
 const f=fixture((count,sql)=>{if(count===2)sql.exec('DROP TABLE enterprise_findings');});
 try{
  for(let i=0;i<501;i++)f.add(`H-${i}`);
  await assert.rejects(()=>readAssuranceAttention(f.db,at),/context changed/);
 }finally{f.sql.close();}
});
