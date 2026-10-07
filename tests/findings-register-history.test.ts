import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFindingRegister} from '../app/findings/register';
import {readFindingHistory} from '../app/findings/history';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,severity TEXT,status TEXT,due_date TEXT,updated_at TEXT,accept_until TEXT,recurrence_count INTEGER); CREATE TABLE enterprise_finding_events(id TEXT PRIMARY KEY,finding_id TEXT,action TEXT,from_status TEXT,to_status TEXT,detail TEXT,actor TEXT,created_at TEXT,evidence_reference TEXT,evidence_sha256 TEXT)');
 type Value=string|number|null;
 type Statement={bind:(...values:Value[])=>Statement;all:()=>{results:Record<string,unknown>[]};first:()=>Record<string,unknown>|null};
 function prepare(query:string,args:Value[]=[]):Statement{return {bind:(...values)=>prepare(query,values),all:()=>({results:sql.prepare(query).all(...args)}),first:()=>sql.prepare(query).get(...args)||null};}
 const db={prepare,async batch(statements:Statement[]){sql.exec('BEGIN');try{const results=statements.map(s=>s.all());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 return {db,sql};
}
test('register totals include records past 3000 and distinguish expired acceptances from closed findings',async()=>{
 const {db,sql}=fixture();try{
  const insert=sql.prepare('INSERT INTO enterprise_findings VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<3001;i++)insert.run('F'+i,'high','open','2026-10-01','2026-10-01',null,0);
  insert.run('accepted','critical','accepted','2026-10-01','2026-10-01','2026-10-06',1);
  insert.run('closed','critical','closed','2026-10-01','2026-10-01',null,0);
  insert.run('today','low','verification','2026-10-07','2026-10-01',null,0);
  const result=await readFindingRegister(db,'2026-10-07');
  assert.equal(result.rows.length,3000);assert.deepEqual(result.coverage,{loaded:3000,total:3004,truncated:true});
  assert.deepEqual({...result.summary},{total:3004,open:3002,critical:1,overdue:3002,verification:1,accepted:1,closed:1,recurring:1});
 }finally{sql.close();}
});
test('empty register has zero counts instead of null values',async()=>{
 const {db,sql}=fixture();try{const result=await readFindingRegister(db);assert.ok(Object.values(result.summary).every(x=>x===0));assert.equal(result.coverage.truncated,false);}finally{sql.close();}
});
test('finding history pages preserve timestamp ties, evidence and isolation across findings',async()=>{
 const {db,sql}=fixture();try{
  sql.exec("INSERT INTO enterprise_findings(id) VALUES('F1'),('F2')");
  const insert=sql.prepare('INSERT INTO enterprise_finding_events VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<121;i++)insert.run(String(i).padStart(4,'0'),'F1','verify','verification','closed','Checked independently','reviewer@test.invalid','2026-10-07T08:00:00Z','EV-1','a'.repeat(64));
  insert.run('other','F2','start',null,'open','Unrelated','other@test.invalid','2026-10-07T09:00:00Z',null,null);
  const first=await readFindingHistory(db,'F1',null,null);assert.equal(first.events.length,50);assert.ok(first.next);
  insert.run('new','F1','reopen','closed','open','New event','reviewer@test.invalid','2026-10-07T09:00:00Z',null,null);
  const second=await readFindingHistory(db,'F1',first.next.after,first.next.stamp);assert.ok(second.next);
  const last=await readFindingHistory(db,'F1',second.next.after,second.next.stamp);
  const events=[...first.events,...second.events,...last.events];assert.equal(events.length,121);assert.equal(new Set(events.map(e=>e.id)).size,121);assert.equal(last.next,null);
  assert.ok(events.every(e=>e.findingId==='F1'&&e.evidenceSha256==='a'.repeat(64)));
  assert.equal((await readFindingHistory(db,'F1',null,null)).events[0].id,'new');
  await assert.rejects(readFindingHistory(db,'missing',null,null),{status:404});
  await assert.rejects(readFindingHistory(db,'F1','x',null),{status:400});
  await assert.rejects(readFindingHistory(db,'F1','x','invalid'),{status:400});
 }finally{sql.close();}
});
