import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { findingReportSchema, readFindingReportPage } from '../app/findings/report-page';
import { loadCapaReport } from '../app/findings/reporting';
function fixture(count=3501) {
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,title TEXT)');
 sql.exec(readFileSync('drizzle/0082_finding_report_revision.sql','utf8'));
 const insert=sql.prepare('INSERT INTO enterprise_findings VALUES(?,?)');
 for(let i=0;i<count;i++)insert.run(`F-${String(i).padStart(6,'0')}`,`Finding ${i}`);
 type Statement={bind:(...values:(string|number|null)[])=>Statement;all:()=>{results:Record<string,unknown>[]}};
 function prepare(query:string,args:(string|number|null)[]=[]):Statement {return {bind:(...values:(string|number|null)[])=>prepare(query,values),all:()=>({results:sql.prepare(query).all(...args)})};}
 const db={prepare,async batch(statements:Statement[]){sql.exec('BEGIN');try{const out=statements.map(s=>s.all());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 return {db,sql};
}
test('report pages include all 3501 records beyond the old cutoff with one revision',async()=>{
 const {db,sql}=fixture();let calls=0;
 try {
  const fetcher:typeof fetch=async address=>{
   calls++;const url=new URL(String(address),'https://local.test');
   return Response.json(await readFindingReportPage(db,url.searchParams.get('after'),url.searchParams.get('revision')));
  };
  const records=await loadCapaReport('/api/findings?format=report',new AbortController().signal,fetcher);
  assert.equal(records.length,3501);assert.equal(calls,8);assert.equal(records.at(-1)!.data.title,'Finding 3500');
  assert.equal(new Set(records.map(r=>r.id)).size,3501);
 }finally{sql.close();}
});
test('insert, update and delete invalidate in-flight snapshots; rollback preserves revision',async()=>{
 const {db,sql}=fixture(501);
 try {
  for(const mutation of ["UPDATE enterprise_findings SET title='changed' WHERE id='F-000000'","INSERT INTO enterprise_findings VALUES('new','new')","DELETE FROM enterprise_findings WHERE id='new'"]){
   const first=await readFindingReportPage(db,null,null);sql.exec(mutation);
   await assert.rejects(readFindingReportPage(db,first.nextCursor,first.revision),{status:409});
  }
  const first=await readFindingReportPage(db,null,null);sql.exec("BEGIN; UPDATE enterprise_findings SET title='rollback'; ROLLBACK;");
  assert.equal((await readFindingReportPage(db,first.nextCursor,first.revision)).revision,first.revision);
  await assert.rejects(readFindingReportPage(db,'cursor',null),{status:400});
 }finally{sql.close();}
});
test('client discards partial pages on conflict or a falsely complete response',async()=>{
 const {db,sql}=fixture(501);let calls=0;
 try {
  await assert.rejects(loadCapaReport('/api/findings?format=report',new AbortController().signal,async()=>{
   if(calls++)return Response.json({error:'changed'},{status:409});
   return Response.json(await readFindingReportPage(db,null,null));
  }),/changed/);
  await assert.rejects(loadCapaReport('/api/findings?format=report',new AbortController().signal,async()=>Response.json({rows:[],complete:true,total:1,revision:'a'.repeat(32),nextCursor:null})),/Incomplete/);
  assert.equal(findingReportSchema.join(';\n')+';\n',readFileSync('drizzle/0082_finding_report_revision.sql','utf8'));
 }finally{sql.close();}
});
