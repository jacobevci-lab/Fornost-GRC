import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Actor } from '../app/api/auth/security';
import { emptyAuditPlan, saveAuditPlan } from '../app/audit-plan';
import { readAuditReportSource, createAuditStatusReport, readAuditStatusReport } from '../app/audit-status-report-store';
import { ensureAuditClosureSchema, auditClosureSchema } from '../app/audit-closure-schema';
import { auditClosureBlockers } from '../app/audit-closure';
import { mutateAuditClosure, readAuditClosureDetail, readAuditClosureHistory, readAuditClosurePreview, readPendingAuditClosures } from '../app/audit-closure-store';
import { insertCoreRecords } from '../app/core-reference-write';
import { writeCoreRecord } from '../app/core-record-write';
import { deleteCoreRecord } from '../app/core-record-delete';
const admin:Actor={id:'admin',email:'admin@example.com',name:'Admin',role:'Admin',source:'local'};
const stamp='2026-10-15T08:00:00.000Z';
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT UNIQUE,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT,created_at TEXT,updated_at TEXT);
    INSERT INTO simple_audits VALUES('audit-a','Audit A','Custom','Internal','Reviewer','Owner','Başlanmadı','',''),('audit-b','Audit B','Custom','Internal','Reviewer','Owner','Başlanmadı','','');
    CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT,code TEXT UNIQUE,created_at TEXT);`);
  let maxBindings=0;
  function prepare(sql:string,args:SQLInputValue[]=[]){return {bind(...values:SQLInputValue[]){maxBindings=Math.max(maxBindings,values.length);return prepare(sql,values);},execute(){const before=Number(sqlite.prepare('SELECT total_changes() n').get()?.n);const results=sqlite.prepare(sql).all(...args);return{results,success:true,meta:{changes:Number(sqlite.prepare('SELECT total_changes() n').get()?.n)-before}};},async all(){return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
  let race:(()=>void)|undefined,skip=0;
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){if(skip)skip--;else{const hook=race;race=undefined;hook?.();}sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}as unknown as D1Database;
  await ensureAuditClosureSchema(db);
  sqlite.exec(`CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,role TEXT,status TEXT); INSERT INTO local_users VALUES('admin','Admin','admin@example.com','Admin','Active'),('reviewer','Reviewer','reviewer@example.com','Admin','Active'),('other','Other','other@example.com','Admin','Active');`);
  const requirement=(id='REQ-a',auditName='Audit A',extra={})=>sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,'Denetim Yönetimi',JSON.stringify({auditName,requirementRef:id,requirementTitle:`Requirement ${id}`,status:'Kapatıldı',owner:'Owner',dueDate:'2026-10-30',...extra}),stamp,stamp);
  const request=(id='ARQ-a',extra={})=>sqlite.prepare('INSERT INTO audit_requests VALUES(?,?,?,?,?,?)').run(id,'audit-a',JSON.stringify({title:`Request ${id}`,status:'accepted',owner:'owner@example.com',reviewer:'reviewer@example.com',instructions:'Review the access list',note:'Independently accepted',dueDate:'2026-10-25',reviewDueDate:'2026-10-26',evidence:[{id:'EVV-a',title:'Kanıt',versionNo:1,fileName:'access.csv',fileKey:'evidence/access.csv',contentSha256:'a'.repeat(64)}],...extra}),'r1',stamp,stamp);
  const finding=(id='F-a',sourceRef='audit-a',extra:Record<string,string>={})=>{
    const data={id,code:`CAPA-${id}`,source_type:'audit',source_ref:sourceRef,source_title:'Audit source',finding_type:'nonconformity',title:`Finding ${id}`,description:'An unresolved finding for the audit',severity:'high',owner:'owner@example.com',reviewer:'reviewer@example.com',root_cause:'Incomplete review process',corrective_action:'Complete the independent review',preventive_action:'Schedule regular independent reviews',due_date:'2026-11-01',status:'open',detected_by:admin.email,detected_at:stamp,updated_by:admin.email,updated_at:stamp,...extra};
    sqlite.prepare(`INSERT INTO enterprise_findings(${Object.keys(data).join(',')}) VALUES(${Object.keys(data).map(()=>'?').join(',')})`).run(...Object.values(data));
  };
  requirement();request();finding();
  sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run('REQ-a','Denetim Yönetimi','AUD-001',stamp);
  sqlite.prepare('INSERT INTO simple_grc_metadata VALUES(?,?,?)').run('audit_plan_audit-a',JSON.stringify({plan:{...emptyAuditPlan,objective:'Review critical controls',scope:'Access and change management',lead:'Lead auditor'},revision:'plan1',updatedAt:stamp,updatedBy:admin.email}),stamp);
  sqlite.prepare('INSERT INTO audit_request_workflows VALUES(?,?,?,?,?)').run('audit-a','closed','AWC-a','Europe/Istanbul','plan1');
  const preview=()=>readAuditReportSource(db,admin,'audit-a');
  const input=async(extra={})=>({auditId:'audit-a',reportId:`ARP-${crypto.randomUUID()}`,expectedSourceRevision:(await preview()).sourceRevision,title:'Quarterly audit status',summary:'Review is ongoing; open findings remain assigned.',limitations:'Only directly linked findings are included.',...extra});
  const save=(body:Record<string,unknown>)=>createAuditStatusReport(db,admin,body,new Date(stamp));
  const detail=(id:string)=>readAuditStatusReport(db,admin,'audit-a',id);
  return{sqlite,db,requirement,request,finding,preview,input,save,detail,maxBindings:()=>maxBindings,race:(hook:()=>void,afterBatches=0)=>{race=hook;skip=afterBatches;}};
}

const reviewer: Actor = { ...admin, id: 'reviewer', email: 'reviewer@example.com' };
const other: Actor = { ...admin, id: 'other', email: 'other@example.com' };
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function submitInput(f: Fixture, patch = {}) {
  return { auditId: 'audit-a', eventId: `ACL-${crypto.randomUUID()}`, action: 'submit', expectedRevision: (await readAuditClosureHistory(f.db,admin,'audit-a')).state.revision,
    expectedSourceRevision: (await f.preview()).sourceRevision, reviewerId: reviewer.id, note: 'Fieldwork completed and all requirements assessed.', followUp: 'The assigned finding owner will complete the recorded action by its due date.', limitations: 'Directly linked findings only.', ...patch };
}
async function decision(f: Fixture, action: string, actor = reviewer, patch = {}) {
  const body = { auditId: 'audit-a', eventId: `ACL-${crypto.randomUUID()}`, action, expectedRevision: (await readAuditClosureHistory(f.db,admin,'audit-a')).state.revision, note: 'Independently reviewed the complete package and follow-up.', ...patch };
  return mutateAuditClosure(f.db, actor, body);
}
async function submit(f: Fixture) { return mutateAuditClosure(f.db, admin, await submitInput(f)); }

test('independent approval freezes audit sources, preserves CAPA follow-up and reopening retains the exact decision', async () => {
 const f=await fixture();try{
  const p=await readAuditClosurePreview(f.db,admin,'audit-a');assert.deepEqual(p.blockers,[]);assert.deepEqual(p.reviewers.map(r=>r.id),['other','reviewer']);
  const sent=await submit(f);assert.equal((await readPendingAuditClosures(f.db,admin)).closures[0].id,sent.id);assert.deepEqual(await readPendingAuditClosures(f.db,{...admin,role:'Editor'}),{closures:[],complete:true});const packageBefore=await readAuditClosureDetail(f.db,admin,'audit-a',sent.id);assert.equal(packageBefore.report.integrity,'verified');
  await assert.rejects(decision(f,'approve',admin),/independent-review/);await assert.rejects(decision(f,'approve',other),/independent-review/);
  const approved=await decision(f,'approve');assert.deepEqual((await readPendingAuditClosures(f.db,admin)).closures,[]);const exact=await readAuditClosureDetail(f.db,admin,'audit-a',approved.id);assert.equal(exact.event.state,'closed');assert.equal(exact.report.sha256,packageBefore.report.sha256);
  for(const sql of [
   `UPDATE simple_audits SET name='Renamed' WHERE id='audit-a'`, `DELETE FROM simple_audits WHERE id='audit-a'`,
   `UPDATE simple_grc_records SET data_json=json_set(data_json,'$.owner','Changed') WHERE id='REQ-a'`,
   `UPDATE simple_grc_records SET module='Risk Assessment' WHERE id='REQ-a'`, `DELETE FROM simple_grc_records WHERE id='REQ-a'`,
   `UPDATE simple_grc_record_codes SET code='AUD-999' WHERE record_id='REQ-a'`, `DELETE FROM simple_grc_record_codes WHERE record_id='REQ-a'`,
   `UPDATE simple_grc_metadata SET value='{}' WHERE key='audit_plan_audit-a'`, `DELETE FROM simple_grc_metadata WHERE key='audit_plan_audit-a'`,
   `INSERT INTO simple_grc_metadata VALUES('audit_catalog_audit-a','{}','')`,
   `UPDATE audit_requests SET revision='changed' WHERE id='ARQ-a'`, `DELETE FROM audit_requests WHERE id='ARQ-a'`,
   `INSERT INTO audit_requests VALUES('ARQ-extra','audit-a','{}','r','','')`,
   `UPDATE audit_request_workflows SET state='active' WHERE audit_id='audit-a'`, `DELETE FROM audit_request_workflows WHERE audit_id='audit-a'`
  ])assert.throws(()=>f.sqlite.exec(sql),/audit-closed/,sql);
  await assert.rejects(insertCoreRecords(f.db,'Denetim Yönetimi',[{id:'new',code:'AUD-999',data:{auditName:'Audit A'}}],stamp),/audit-closed/);
  f.requirement('other-req','Audit B');assert.throws(()=>f.sqlite.exec(`UPDATE simple_grc_records SET data_json=json_set(data_json,'$.auditName','Audit A') WHERE id='other-req'`),/audit-closed/);
  // CAPA progresses independently; the accepted closure package never changes.
  f.sqlite.exec(`UPDATE enterprise_findings SET status='closed' WHERE id='F-a'`);assert.deepEqual(await readAuditClosureDetail(f.db,admin,'audit-a',approved.id),exact);
  await decision(f,'reopen',other,{note:'Additional scope approved; reopen for further testing.'});
  f.sqlite.exec(`UPDATE simple_grc_records SET data_json=json_set(data_json,'$.owner','Changed after reopening') WHERE id='REQ-a'`);
  assert.equal((await readAuditClosureHistory(f.db,admin,'audit-a')).state.state,'open');assert.deepEqual(await readAuditClosureDetail(f.db,admin,'audit-a',approved.id),exact);
  await submit(f);await decision(f,'return');assert.equal((await readAuditClosureHistory(f.db,admin,'audit-a')).state.state,'open');
  await submit(f);await assert.rejects(decision(f,'withdraw',reviewer),/preparer/);await decision(f,'withdraw',admin);
 }finally{f.sqlite.close();}
});

test('incomplete plans, requirements, request plans and untracked findings block complete closure',async()=>{
 const f=await fixture();try{
  const source=await f.preview();assert.deepEqual(auditClosureBlockers(source),[]);
  assert.ok(auditClosureBlockers({...source,plan:{...source.plan,plan:{...source.plan.plan,lead:''}}}).includes('plan'));
  assert.ok(auditClosureBlockers({...source,items:source.items.filter(i=>i.kind!=='requirement')}).includes('empty'));
  for(const [kind,status,blocker]of [['requirement','İncelemede','requirements'],['request','draft','requests']] as const)assert.ok(auditClosureBlockers({...source,items:source.items.map(i=>i.kind===kind?{...i,record:{...i.record,data:{...i.record.data,status}}}:i)}).includes(blocker));
  assert.ok(auditClosureBlockers({...source,workflow:{...source.workflow,state:'active'}}).includes('requests'));
  assert.ok(auditClosureBlockers({...source,items:source.items.map(i=>i.kind==='finding'?{...i,record:{...i.record,data:{...i.record.data,dueDate:'2026-02-31'}}}:i)}).includes('findings'));
  await assert.rejects(mutateAuditClosure(f.db,admin,await submitInput(f,{followUp:''})),/follow-up/);
  f.sqlite.exec(`UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','İncelemede') WHERE id='REQ-a'`);
  await assert.rejects(submit(f),/blockers/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_closure_events').get()?.n,0);
 }finally{f.sqlite.close();}
});

test('source and actor races inside submit/approve commit leave no partial package or decision',async()=>{
 for(const phase of ['submit','approve'])for(const mutation of ['source','reviewer','parent',...(phase==='approve'?['integrity']:[])]){
  const f=await fixture();try{
   const body=phase==='submit'?await submitInput(f):null;if(phase==='approve')await submit(f);
   const before=f.sqlite.prepare('SELECT count(*) n FROM audit_closure_events').get()?.n;
   const sql=mutation==='source'?`UPDATE simple_grc_metadata SET value=json_set(value,'$.plan.scope','Changed scope') WHERE key='audit_plan_audit-a'`:mutation==='reviewer'?`UPDATE local_users SET role='Viewer' WHERE id='reviewer'`:mutation==='integrity'?`UPDATE audit_status_report_items SET record_json=json_set(record_json,'$.data.title','Corrupt at commit') WHERE kind='requirement'`:`DELETE FROM simple_audits WHERE id='audit-a'`;
   f.race(()=>f.sqlite.exec(sql),phase==='submit'?1:2);
   if(body)await assert.rejects(mutateAuditClosure(f.db,admin,body),/changed/);else await assert.rejects(decision(f,'approve'),/changed|audit-missing/);
   assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_closure_events').get()?.n,before);
   assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_status_reports').get()?.n,phase==='submit'?0:1);
  }finally{f.sqlite.close();}
 }
});

test('retry IDs bind complete intent, snapshot failures roll back and simultaneous stale decisions cannot overwrite',async()=>{
 const f=await fixture();try{
  const body=await submitInput(f);f.sqlite.exec(`CREATE TRIGGER fail_item BEFORE INSERT ON audit_status_report_items BEGIN SELECT RAISE(ABORT,'injected failure');END`);
  await assert.rejects(mutateAuditClosure(f.db,admin,body),/injected failure/);
  for(const table of ['audit_closure_events','audit_closure_state','audit_status_reports','audit_status_report_items'])assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()?.n,0);
  f.sqlite.exec('DROP TRIGGER fail_item');const sent=await mutateAuditClosure(f.db,admin,body);assert.deepEqual(await mutateAuditClosure(f.db,admin,body),sent);
  await assert.rejects(mutateAuditClosure(f.db,admin,{...body,note:'Different submission with the same intent ID'}),/id-conflict/);
  const old=(await readAuditClosureHistory(f.db,admin,'audit-a')).state.revision;const approved=await decision(f,'approve');
  await assert.rejects(decision(f,'return',reviewer,{expectedRevision:old}),/changed/);
  assert.equal((await readAuditClosureHistory(f.db,admin,'audit-a')).state.revision,approved.id);
 }finally{f.sqlite.close();}
});

test('stale review can be returned or withdrawn; inactive reviewers can be replaced through withdrawal',async()=>{
 const f=await fixture();try{
  await submit(f);f.sqlite.exec(`UPDATE simple_audits SET auditor='New auditor' WHERE id='audit-a'`);
  await assert.rejects(decision(f,'approve'),/changed/);await decision(f,'return');
  await submit(f);f.sqlite.exec(`UPDATE local_users SET status='Disabled' WHERE id='reviewer'`);
  await assert.rejects(decision(f,'approve'),/forbidden/);await decision(f,'withdraw',admin);
  await assert.rejects(submit(f),/reviewer/);await mutateAuditClosure(f.db,admin,await submitInput(f,{reviewerId:other.id}));await decision(f,'approve',other);
 }finally{f.sqlite.close();}
});

test('role, parent and package integrity boundaries apply to preview, history, detail and mutation',async()=>{
 const f=await fixture();try{
  const input=await submitInput(f),sent=await mutateAuditClosure(f.db,admin,input);
  for(const role of ['Editor','Viewer']as const){const actor={...admin,role};for(const operation of [()=>readAuditClosurePreview(f.db,actor,'audit-a'),()=>readAuditClosureHistory(f.db,actor,'audit-a'),()=>readAuditClosureDetail(f.db,actor,'audit-a',sent.id),()=>mutateAuditClosure(f.db,actor,input)])await assert.rejects(operation(),/forbidden/);}
  await assert.rejects(readAuditClosureDetail(f.db,admin,'audit-b',sent.id),/closure-missing/);
  f.sqlite.exec(`UPDATE audit_status_report_items SET record_json=json_set(record_json,'$.data.owner','Tampered') WHERE kind='requirement'`);
  await assert.rejects(readAuditClosureDetail(f.db,admin,'audit-a',sent.id),/integrity/);await assert.rejects(decision(f,'approve'),/integrity/);
  await decision(f,'withdraw',admin);f.sqlite.exec(`UPDATE audit_closure_events SET payload_json=json_set(payload_json,'$.note','Tampered')`);await assert.rejects(readAuditClosureHistory(f.db,admin,'audit-a'),/integrity/);
 }finally{f.sqlite.close();}
});

test('closed audit rejects existing plan/core writers and migration matches runtime SQL',async()=>{
 const f=await fixture();try{
  assert.equal(readFileSync('drizzle/0091_audit_closure.sql','utf8'),auditClosureSchema.join(';\n\n')+';\n');
  await submit(f);await decision(f,'approve');
  const existing=f.sqlite.prepare(`SELECT module,data_json,updated_at FROM simple_grc_records WHERE id='REQ-a'`).get()as{module:string;data_json:string;updated_at:string};
  await assert.rejects(writeCoreRecord(f.db,'REQ-a',existing,{...JSON.parse(existing.data_json),owner:'changed'},existing.updated_at),/audit-closed/);
  await assert.rejects(deleteCoreRecord(f.db,'REQ-a',existing,existing.updated_at),/audit-closed/);
  await assert.rejects(saveAuditPlan(f.db,'audit-a','plan1',{...emptyAuditPlan,scope:'Changed'},admin.email),/audit-closed/);
 }finally{f.sqlite.close();}
});
