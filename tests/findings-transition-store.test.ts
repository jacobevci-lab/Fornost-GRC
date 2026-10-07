import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {findingReportSchema} from '../app/findings/report-page';
import {commitFindingTransition} from '../app/findings/transition-store';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec("CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT); INSERT INTO enterprise_findings VALUES('F-1','open','observed'); CREATE TABLE enterprise_finding_events(id TEXT PRIMARY KEY,finding_id TEXT,action TEXT,from_status TEXT,to_status TEXT,detail TEXT,evidence_reference TEXT,evidence_sha256 TEXT,actor TEXT CHECK(actor!='blocked'),created_at TEXT)");
 sqlite.exec(findingReportSchema.join(';')+';');
 type Statement={sql:string;values:(string|number|null)[]};
 const db={prepare:(sql:string)=>({bind:(...values:Statement['values'])=>({sql,values})}),batch:async(statements:Statement[])=>{
  sqlite.exec('BEGIN');try{const results=statements.map(s=>{const before=Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n);sqlite.prepare(s.sql).run(...s.values);return {success:true,meta:{changes:Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n)-before}};});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}
 }} as unknown as D1Database;
 const update=()=>db.prepare('UPDATE enterprise_findings SET status=?,updated_at=? WHERE id=? AND status=? AND updated_at=?').bind('in-progress','new','F-1','open','observed');
 return {sqlite,db,update};
}
const event={findingId:'F-1',action:'start',from:'open',to:'in-progress',detail:'Begin CAPA',actor:'owner@test.invalid',stamp:'new'};
test('D1 trigger-inclusive metadata preserves one winner and exactly one audit event',async()=>{
 const {sqlite,db,update}=fixture();try{
  assert.deepEqual(await Promise.all([commitFindingTransition(db,update(),event),commitFindingTransition(db,update(),{...event,actor:'second@test.invalid'})]),[true,false]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enterprise_finding_events').get()?.n,1);
  assert.equal(sqlite.prepare('SELECT actor FROM enterprise_finding_events').get()?.actor,event.actor);
 }finally{sqlite.close();}
});
test('same-status updated records reject stale transitions without an audit event',async()=>{
 const {sqlite,db,update}=fixture();try{
  sqlite.exec("UPDATE enterprise_findings SET updated_at='refreshed'");
  assert.equal(await commitFindingTransition(db,update(),event),false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enterprise_finding_events').get()?.n,0);
 }finally{sqlite.close();}
});
test('audit insertion failure rolls back the state transition',async()=>{
 const {sqlite,db,update}=fixture();try{
  const revision=sqlite.prepare('SELECT revision FROM finding_report_revision').get()!.revision;
  await assert.rejects(commitFindingTransition(db,update(),{...event,actor:'blocked'}));
  assert.equal(sqlite.prepare('SELECT revision FROM finding_report_revision').get()!.revision,revision);
  assert.equal(sqlite.prepare('SELECT status FROM enterprise_findings').get()?.status,'open');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enterprise_finding_events').get()?.n,0);
 }finally{sqlite.close();}
});
