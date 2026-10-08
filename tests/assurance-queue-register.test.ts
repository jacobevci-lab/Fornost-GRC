import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readAssuranceQueue} from '../app/assurance-queue-register';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE continuous_assurance_work_items(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,finding_id TEXT,rule_id TEXT,result_ref TEXT);
 CREATE TABLE evidence_automation_findings(id TEXT PRIMARY KEY,title TEXT,severity TEXT,owner TEXT,due_date TEXT);
 CREATE TABLE evidence_automation_rules(id TEXT PRIMARY KEY,name TEXT,control_refs TEXT);
 CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT);`);
 const db={prepare(query:string){let values:any[]=[];return {bind(...args:any[]){values=args;return this;},async all(){return {results:sql.prepare(query).all(...values)};}};}} as unknown as D1Database;
 return {sql,db};
}
test('queue distinguishes empty, exactly 500 and truncated 501 without returning the sentinel',async()=>{
 const {sql,db}=fixture();try{
  assert.deepEqual((await readAssuranceQueue(db)).coverage,{loaded:0,complete:true});
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items(id,status,updated_at) VALUES(?,?,?)');
  for(let i=0;i<500;i++)insert.run(String(i).padStart(4,'0'),'pending-review','2026-10-08T00:00:00Z');
  assert.deepEqual((await readAssuranceQueue(db)).coverage,{loaded:500,complete:true});
  insert.run('0500','pending-review','2026-10-08T00:00:00Z');
  const result=await readAssuranceQueue<{id:string}>(db);
  assert.deepEqual(result.coverage,{loaded:500,complete:false});assert.equal(result.rows.length,500);
  assert.equal(result.rows[0].id,'0000');assert.equal(result.rows.at(-1)!.id,'0499');
 }finally{sql.close();}
});
test('legacy fallback preserves active-work priority and detects truncation',async()=>{
 const {sql,db}=fixture();try{
  sql.exec('DROP TABLE enterprise_findings; DROP TABLE evidence_automation_findings;');
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items(id,status,updated_at) VALUES(?,?,?)');
  for(let i=0;i<501;i++)insert.run(String(i).padStart(4,'0'),'completed','2026-10-08T00:00:00Z');
  insert.run('active','pending-review','2020-01-01T00:00:00Z');
  const result=await readAssuranceQueue<{id:string}>(db);
  assert.equal(result.rows[0].id,'active');assert.equal(result.coverage.complete,false);
 }finally{sql.close();}
});
test('register preserves joined finding, control and canonical CAPA result context',async()=>{
 const {sql,db}=fixture();try{
  sql.exec("INSERT INTO continuous_assurance_work_items VALUES('W','completed','2026-10-08','F','R','C'); INSERT INTO evidence_automation_findings VALUES('F','Observed issue','high','owner@test.invalid','2026-11-01'); INSERT INTO evidence_automation_rules VALUES('R','Rule one','CTRL-1'); INSERT INTO enterprise_findings VALUES('C','CAPA-1');");
  const {rows}=await readAssuranceQueue<Record<string,string>>(db);
  assert.equal(rows[0].finding_title,'Observed issue');assert.equal(rows[0].finding_owner,'owner@test.invalid');assert.equal(rows[0].control_refs,'CTRL-1');assert.equal(rows[0].result_code,'CAPA-1');
 }finally{sql.close();}
});

test('cursor traversal reaches all 1203 records across priority and timestamp ties',async()=>{
 const {sql,db}=fixture();try{
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items(id,status,updated_at) VALUES(?,?,?)');
  const statuses=['pending-review','approved-awaiting-retest','failed-retest','retest-error','completed'];
  for(let i=0;i<1203;i++)insert.run(String(i).padStart(4,'0'),statuses[i%5],i%3?'2026-10-08T00:00:00Z':'2026-10-07T00:00:00Z');
  const ids:string[]=[];let cursor:string|undefined;
  do{
   const page=await readAssuranceQueue<{id:string}>(db,cursor);
   ids.push(...page.rows.map(row=>row.id));cursor=page.nextCursor??undefined;
  }while(cursor);
  assert.equal(ids.length,1203);assert.equal(new Set(ids).size,1203);
  const expected=sql.prepare("SELECT id FROM continuous_assurance_work_items ORDER BY CASE status WHEN 'pending-review' THEN 0 WHEN 'approved-awaiting-retest' THEN 1 WHEN 'failed-retest' THEN 2 WHEN 'retest-error' THEN 3 ELSE 4 END,updated_at DESC,id ASC").all().map(row=>row.id);
  assert.deepEqual(ids,expected);
 }finally{sql.close();}
});
test('cursor binds literal IDs and preserves fallback pagination',async()=>{
 const {sql,db}=fixture();try{
  sql.exec('DROP TABLE enterprise_findings; DROP TABLE evidence_automation_findings;');
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items(id,status,updated_at) VALUES(?,?,?)');
  for(let i=0;i<501;i++)insert.run(String(i).padStart(4,'0'),'completed','2026-10-08T00:00:00Z');
  const first=await readAssuranceQueue<{id:string}>(db);
  const last=await readAssuranceQueue<{id:string}>(db,first.nextCursor!);
  assert.deepEqual(last.rows.map(row=>row.id),['0500']);assert.equal(last.nextCursor,null);
  const literal=await readAssuranceQueue(db,JSON.stringify([4,'2026-10-08T00:00:00Z',"' OR 1=1 --"]));
  assert.equal(literal.rows.length,500);
  for(const cursor of ['{}','[]','null','[5,"x","id"]','[0,"x",""]','x'.repeat(1025)])await assert.rejects(()=>readAssuranceQueue(db,cursor),/Invalid assurance cursor/);
 }finally{sql.close();}
});
