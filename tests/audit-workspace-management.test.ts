import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { updateAudit, auditRemovalPreview } from '../app/audit-management';
import { deleteAudit, AuditLinked } from '../app/audit-delete';
import { auditRequirementLinkGuards, requirementLink } from '../app/audit-requirement-link';
import { auditRequirementMatches, auditBoardLane, auditPreferredArea } from '../app/audit-workspace-state';
import { LifecycleConflict } from '../app/enterprise-lifecycle-write';
import { validateAuditRequestFields, emptyAuditRequest } from '../app/audit-requests';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`
 CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT UNIQUE,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT);
 CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 INSERT INTO simple_audits VALUES('audit-a','Audit A','Custom','Internal','Team','Owner','open','2026-01-01','2026-01-01'),('audit-b','Audit B','Custom','Internal','Team','Owner','open','2026-01-01','2026-01-01');
 INSERT INTO simple_grc_records VALUES('req-a','Denetim Yönetimi','{"auditName":"Audit A","owner":"Item owner","evidenceStatus":"Kanıt Bekleniyor"}','2026-01-01','2026-01-01');
 INSERT INTO simple_grc_record_codes VALUES('req-a','AUD-001');`);
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...a:SQLInputValue[]){return prepare(sql,a)},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},exec(){const results=sqlite.prepare(sql).all(...args);return{results,meta:{changes:Number(sqlite.prepare('SELECT changes() n').get()!.n)}}}};}
 let hook:(()=>void)|undefined;
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const h=hook;hook=undefined;h?.();sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const audit=()=>sqlite.prepare("SELECT * FROM simple_audits WHERE id='audit-a'").get() as Record<string,string>;
 const change=(patch:Record<string,unknown>={})=>updateAudit(db,audit(),'admin@example.com',{...audit(),action:'edit',expectedUpdatedAt:audit().updated_at,...patch});
 return{db,sqlite,audit,change,race:(h:()=>void)=>{hook=h}};
}
test('rename keeps canonical requirements and assignments; stale edits and event failures roll back',async()=>{
 const f=fixture();try{
  const old=f.audit();await f.change({name:'Renamed audit',audit_owner:'New audit owner'});
  const data=JSON.parse(String(f.sqlite.prepare("SELECT data_json FROM simple_grc_records WHERE id='req-a'").get()!.data_json));assert.equal(data.auditName,'Renamed audit');assert.equal(data.owner,'Item owner');
  await assert.rejects(f.change({expectedUpdatedAt:old.updated_at}),LifecycleConflict);
  f.race(()=>f.sqlite.exec("UPDATE simple_audits SET updated_at='2027-01-01' WHERE id='audit-a'"));await assert.rejects(f.change({name:'Lost update'}),LifecycleConflict);assert.equal(f.audit().name,'Renamed audit');
  f.sqlite.exec("CREATE TRIGGER event_failure BEFORE INSERT ON simple_grc_metadata BEGIN SELECT RAISE(ABORT,'event-failure'); END");await assert.rejects(f.change({name:'Must roll back'}),/event-failure/);assert.equal(f.audit().name,'Renamed audit');
 }finally{f.sqlite.close()}
});
test('archive and restore retain records and closure locks with visibility concurrency protection',async()=>{
 const f=fixture();try{
  f.sqlite.exec("CREATE TRIGGER audit_closed BEFORE UPDATE ON simple_audits BEGIN SELECT RAISE(ABORT,'audit-closed'); END");
  await assert.rejects(f.change({name:'No edit'}),/audit-closed/);
  await f.change({action:'archive',expectedVisibilityRevision:''});
  const v=f.sqlite.prepare("SELECT * FROM simple_grc_metadata WHERE key='audit_visibility_audit-a'").get()!;assert.equal(JSON.parse(String(v.value)).archived,true);
  await assert.rejects(f.change({action:'restore',expectedVisibilityRevision:''}),LifecycleConflict);
  await f.change({action:'restore',expectedVisibilityRevision:v.updated_at});
  assert.equal(JSON.parse(String(f.sqlite.prepare("SELECT value FROM simple_grc_metadata WHERE key='audit_visibility_audit-a'").get()!.value)).archived,false);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_records').get()!.n,1);
 }finally{f.sqlite.close()}
});
test('removal preview agrees with guarded deletion, including delimited historical references',async()=>{
 const f=fixture();try{
  assert.deepEqual(await auditRemovalPreview(f.db,f.audit()),{requirements:1,dependencies:[],blocked:false});
  f.sqlite.exec("CREATE TABLE enterprise_findings(id TEXT,source_type TEXT,source_ref TEXT);INSERT INTO enterprise_findings VALUES('f','audit','elsewhere; AUD-001')");
  const preview=await auditRemovalPreview(f.db,f.audit());assert.equal(preview.blocked,true);assert.equal(preview.dependencies.find(d=>d.key==='enterprise_findings')?.count,1);
  await assert.rejects(deleteAudit(f.db,f.audit(),'admin@example.com'),AuditLinked);
  f.sqlite.exec('DELETE FROM enterprise_findings');assert.equal((await auditRemovalPreview(f.db,f.audit())).blocked,false);assert.equal(await deleteAudit(f.db,f.audit(),'admin@example.com'),1);
 }finally{f.sqlite.close()}
});
test('request and workpaper links reject wrong audits, missing requirements and later cross-audit moves',()=>{
 for(const table of ['audit_requests','audit_workpapers'] as const){const f=fixture();try{
  f.sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,audit_id TEXT,data_json TEXT);${auditRequirementLinkGuards(table).join(';')};`);
  const insert=f.sqlite.prepare(`INSERT INTO ${table} VALUES(?,?,?)`);
  insert.run('legacy','audit-a','{}');insert.run('linked','audit-a',JSON.stringify({requirementId:'req-a'}));
  assert.throws(()=>insert.run('bad','audit-b',JSON.stringify({requirementId:'req-a'})),/requirement-link/);
  assert.throws(()=>insert.run('bad','audit-a',JSON.stringify({requirementId:'missing'})),/requirement-link/);
  assert.throws(()=>f.sqlite.exec(`UPDATE simple_grc_records SET data_json='{"auditName":"Audit B"}' WHERE id='req-a'`),/requirement-link/);
  assert.throws(()=>f.sqlite.exec("UPDATE simple_grc_records SET module='Kontroller' WHERE id='req-a'"),/requirement-link/);
 }finally{f.sqlite.close()}}
});
test('optional links remain backward compatible; status queues never infer approval from uploaded evidence',()=>{
 assert.deepEqual(requirementLink(undefined),{});assert.throws(()=>requirementLink('../req'));assert.deepEqual(requirementLink('req-a'),{requirementId:'req-a'});
 const fields={...emptyAuditRequest,title:'Request',instructions:'Evidence required',owner:'a@b.test',reviewer:'r@b.test',dueDate:'2026-12-01',reviewDueDate:'2026-12-02',requirementId:'req-a'};
 assert.equal(validateAuditRequestFields(fields).requirementId,'req-a');
 assert.equal(auditBoardLane({status:'Devam Ediyor',evidenceStatus:'Kabul Edildi'}),'doing');
 assert.equal(auditRequirementMatches({status:'Kapatıldı',evidenceStatus:'Kanıt Bekleniyor'},'evidence'),false);
 assert.equal(auditRequirementMatches({status:'Open',owner:'Atanmadı'},'unassigned'),true);
 assert.equal(auditPreferredArea({closure:'decision'}),'report');assert.equal(auditPreferredArea({request:'request'}),'requests');assert.equal(auditPreferredArea({workpaper:'paper'}),'work');
});
