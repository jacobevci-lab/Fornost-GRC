import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readAssuranceQueue,readAssuranceSourceState} from '../app/assurance-queue-register';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE continuous_assurance_work_items(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,finding_id TEXT,rule_id TEXT,result_ref TEXT);
 CREATE TABLE evidence_automation_findings(id TEXT PRIMARY KEY,title TEXT,severity TEXT,owner TEXT,due_date TEXT,rule_id TEXT);
 CREATE TABLE evidence_automation_rules(id TEXT PRIMARY KEY,name TEXT,control_refs TEXT);
 CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT);`);
 const db={prepare(query:string){let values:SQLInputValue[]=[];return {bind(...args:SQLInputValue[]){values=args;return this;},async first(){return sql.prepare(query).get(...values)??null;},async all(){return {results:sql.prepare(query).all(...values)};}};}} as unknown as D1Database;
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
  sql.exec("INSERT INTO continuous_assurance_work_items VALUES('W','completed','2026-10-08','F','R','C'); INSERT INTO evidence_automation_findings VALUES('F','Observed issue','high','owner@test.invalid','2026-11-01','R'); INSERT INTO evidence_automation_rules VALUES('R','Rule one','CTRL-1'); INSERT INTO enterprise_findings VALUES('C','CAPA-1');");
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

test('server search reaches records beyond 500 with Turkish case and literal wildcard characters',async()=>{
 const {sql,db}=fixture();try{
  sql.exec('ALTER TABLE continuous_assurance_work_items ADD COLUMN decision_json TEXT;');
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items(id,status,updated_at,finding_id,rule_id,result_ref,decision_json) VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<550;i++)insert.run(String(i).padStart(4,'0'),'completed','2026-10-08T00:00:00Z',null,null,null,'invalid-json');
  sql.exec("INSERT INTO evidence_automation_findings VALUES('F','IŞIK kontrolü','high','Çağrı','','R'); INSERT INTO evidence_automation_rules VALUES('R','Rule','CTRL-5'); INSERT INTO enterprise_findings VALUES('C','CAPA-501');");
  insert.run('ZZ-LAST','completed','2026-10-08T00:00:00Z','F','R','C',JSON.stringify({targetControlRef:'CTRL-100%_literal'}));
  for(const query of ['ışık','çağrı','CTRL-5','CAPA-501','100%_literal','ZZ-LAST']){
   const result=await readAssuranceQueue<{id:string}>(db,undefined,{query,lang:'tr'});
   assert.deepEqual(result.rows.map(row=>row.id),['ZZ-LAST']);assert.equal(result.coverage.complete,true);
  }
  const literal=await readAssuranceQueue(db,undefined,{query:"' OR 1=1 --",lang:'en'});assert.equal(literal.rows.length,0);
  sql.exec('DROP TABLE enterprise_findings;');
  await assert.rejects(()=>readAssuranceQueue(db,undefined,{query:'ışık',lang:'tr'}));
 }finally{sql.close();}
});
test('search continuation keeps its predicate on every page',async()=>{
 const {sql,db}=fixture();try{
  sql.exec('ALTER TABLE continuous_assurance_work_items ADD COLUMN decision_json TEXT;');
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items(id,status,updated_at) VALUES(?,?,?)');
  for(let i=0;i<1100;i++)insert.run(`${i%2?'MATCH':'OTHER'}-${String(i).padStart(4,'0')}`,'completed','2026-10-08T00:00:00Z');
  const search={query:'MATCH',lang:'en' as const};
  const first=await readAssuranceQueue<{id:string}>(db,undefined,search);
  const last=await readAssuranceQueue<{id:string}>(db,first.nextCursor!,search);
  assert.equal(first.rows.length,500);assert.equal(last.rows.length,50);assert.equal(last.nextCursor,null);
  assert.equal(new Set([...first.rows,...last.rows].map(row=>row.id)).size,550);
  assert.ok([...first.rows,...last.rows].every(row=>row.id.startsWith('MATCH')));
 }finally{sql.close();}
});

test('register labels available source context and never hides operational failures',async()=>{
 const {sql,db}=fixture();try{
  assert.equal((await readAssuranceQueue(db)).context,'full');
  sql.exec('DROP TABLE enterprise_findings');
  assert.equal((await readAssuranceQueue(db)).context,'without-capa');
  sql.exec('DROP TABLE evidence_automation_rules');
  assert.equal((await readAssuranceQueue(db)).context,'work-only');
 }finally{sql.close();}
 for(const failure of ['D1_ERROR: database is locked','D1_ERROR: timed out','no such column: f.owner','no such table: private_unrelated']){
  let calls=0;
  const broken={prepare(){return {async all(){calls++;throw new Error(failure);}};}} as unknown as D1Database;
  await assert.rejects(()=>readAssuranceQueue(broken),error=>error instanceof Error&&error.message===failure);
  assert.equal(calls,1,'operational failure must not try a reduced query');
 }
 let calls=0;
 const brokenFallback={prepare(){return {async all(){calls++;throw new Error(calls===1?'no such table: enterprise_findings':'database is locked');}};}} as unknown as D1Database;
 await assert.rejects(()=>readAssuranceQueue(brokenFallback),/database is locked/);assert.equal(calls,2);
});


test('source state follows exact finding/rule relationships independently of table availability',async()=>{
 const {sql,db}=fixture();try{
  sql.exec("INSERT INTO continuous_assurance_work_items VALUES('W','pending-review','2026-10-08','F','R',NULL); INSERT INTO evidence_automation_findings VALUES('F','','high','','','R'); INSERT INTO evidence_automation_rules VALUES('R','','CTRL-1');");
  const check=async(expected:string)=>{
   const result=await readAssuranceQueue<{source_state:string}>(db);
   assert.equal(result.context,'full');assert.equal(result.rows[0].source_state,expected);
   assert.equal(await readAssuranceSourceState(db,'W'),expected);
  };
  await check('linked'); // Empty display labels do not make valid ID relationships disappear.
  sql.exec("UPDATE evidence_automation_findings SET rule_id='other'");
  await check('rule-mismatch');
  sql.exec('DELETE FROM evidence_automation_rules');await check('missing-rule');
  sql.exec('DELETE FROM evidence_automation_findings');await check('missing-finding');
  assert.equal(await readAssuranceSourceState(db,"' OR 1=1 --"),'unavailable');
  sql.exec('DROP TABLE evidence_automation_findings');
  assert.equal((await readAssuranceQueue<{source_state:string}>(db)).rows[0].source_state,'unavailable');
  await assert.rejects(()=>readAssuranceSourceState(db,'W'));
 }finally{sql.close();}
});
