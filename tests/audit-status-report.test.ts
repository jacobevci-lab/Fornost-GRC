import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Actor } from '../app/api/auth/security';
import { emptyAuditPlan } from '../app/audit-plan';
import { auditReportSummary, reportCanonical } from '../app/audit-status-report';
import { ensureAuditStatusReportSchema } from '../app/audit-status-report-schema';
import { createAuditStatusReport, listAuditStatusReports, readAuditReportSource, readAuditStatusReport } from '../app/audit-status-report-store';
import { auditStatusReportCsv, auditStatusReportHtml, auditStatusReportPdf } from '../app/audit-status-report-export';

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
  function prepare(sql:string,args:SQLInputValue[]=[]){return {bind(...values:SQLInputValue[]){maxBindings=Math.max(maxBindings,values.length);return prepare(sql,values);},execute(){const results=sqlite.prepare(sql).all(...args);return{results,success:true,meta:{changes:Number(sqlite.prepare('SELECT changes() n').get()?.n)}};},async all(){return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
  let race:(()=>void)|undefined,skip=0;
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){if(skip)skip--;else{const hook=race;race=undefined;hook?.();}sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}as unknown as D1Database;
  await ensureAuditStatusReportSchema(db);
  const requirement=(id='REQ-a',auditName='Audit A',extra={})=>sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,'Denetim Yönetimi',JSON.stringify({auditName,requirementRef:id,requirementTitle:`Requirement ${id}`,status:'İncelemede',owner:'Owner',dueDate:'2026-10-30',...extra}),stamp,stamp);
  const request=(id='ARQ-a',extra={})=>sqlite.prepare('INSERT INTO audit_requests VALUES(?,?,?,?,?,?)').run(id,'audit-a',JSON.stringify({title:`Request ${id}`,status:'accepted',owner:'owner@example.com',reviewer:'reviewer@example.com',instructions:'Review the access list',note:'Independently accepted',dueDate:'2026-10-25',reviewDueDate:'2026-10-26',evidence:[{id:'EVV-a',title:'Kanıt',versionNo:1,fileName:'access.csv',fileKey:'evidence/access.csv',contentSha256:'a'.repeat(64)}],...extra}),'r1',stamp,stamp);
  const finding=(id='F-a',sourceRef='audit-a',extra:Record<string,string>={})=>{
    const data={id,code:`CAPA-${id}`,source_type:'audit',source_ref:sourceRef,source_title:'Audit source',finding_type:'nonconformity',title:`Finding ${id}`,description:'An unresolved finding for the audit',severity:'high',owner:'owner@example.com',reviewer:'reviewer@example.com',root_cause:'Incomplete review process',corrective_action:'Complete the independent review',preventive_action:'Schedule regular independent reviews',due_date:'2026-11-01',status:'open',detected_by:admin.email,detected_at:stamp,updated_by:admin.email,updated_at:stamp,...extra};
    sqlite.prepare(`INSERT INTO enterprise_findings(${Object.keys(data).join(',')}) VALUES(${Object.keys(data).map(()=>'?').join(',')})`).run(...Object.values(data));
  };
  requirement();request();finding();
  sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run('REQ-a','Denetim Yönetimi','AUD-001',stamp);
  sqlite.prepare('INSERT INTO simple_grc_metadata VALUES(?,?,?)').run('audit_plan_audit-a',JSON.stringify({plan:{...emptyAuditPlan,objective:'Review critical controls',scope:'Access and change management'},revision:'plan1',updatedAt:stamp,updatedBy:admin.email}),stamp);
  sqlite.prepare('INSERT INTO audit_request_workflows VALUES(?,?,?,?,?)').run('audit-a','closed','AWC-a','Europe/Istanbul','plan1');
  const preview=()=>readAuditReportSource(db,admin,'audit-a');
  const input=async(extra={})=>({auditId:'audit-a',reportId:`ARP-${crypto.randomUUID()}`,expectedSourceRevision:(await preview()).sourceRevision,title:'Quarterly audit status',summary:'Review is ongoing; open findings remain assigned.',limitations:'Only directly linked findings are included.',...extra});
  const save=(body:Record<string,unknown>)=>createAuditStatusReport(db,admin,body,new Date(stamp));
  const detail=(id:string)=>readAuditStatusReport(db,admin,'audit-a',id);
  return{sqlite,db,requirement,request,finding,preview,input,save,detail,maxBindings:()=>maxBindings,race:(hook:()=>void,afterBatches=0)=>{race=hook;skip=afterBatches;}};
}
test('audit reports include exact audit and requirement identities, never name fragments or shared controls',async()=>{
  const f=await fixture();try{
    f.requirement('REQ-b','Audit B');f.finding('by-row','REQ-a');f.finding('by-code','AUD-001');f.finding('other','REQ-b');f.finding('name-only','Audit A');f.finding('fragment','prefix-audit-a');f.finding('shared-control','unrelated',{control_ref:'REQ-a'});f.finding('wrong-type','audit-a',{source_type:'manual'});
    const source=await f.preview();assert.deepEqual(source.items.filter(i=>i.kind==='finding').map(i=>i.id),['F-a','by-code','by-row']);assert.deepEqual(source.items.filter(i=>i.kind==='requirement').map(i=>i.id),['REQ-a']);
    assert.equal(source.plan.plan.scope,'Access and change management');assert.equal(source.workflow.state,'closed');
    const n=auditReportSummary(source.items);assert.equal(n.unfinishedRequirements,1);assert.equal(n.outstandingRequests,0);assert.equal(n.unresolvedFindings,3);
    const empty=await readAuditReportSource(f.db,admin,'audit-b');assert.equal(auditReportSummary(empty.items).requests,0);assert.equal(empty.workflow.state,'draft');
  }finally{f.sqlite.close();}
});
test('saved reports preserve every source and narrative after edits, new versions, reopening and finding closure',async()=>{
  const f=await fixture();try{
    const body=await f.input(),result=await f.save(body),original=await f.detail(result.id);
    assert.equal(original.integrity,'verified');assert.equal(original.sha256,createHash('sha256').update(reportCanonical(original.snapshot)).digest('hex'));
    f.sqlite.exec(`UPDATE simple_grc_records SET data_json=json_set(data_json,'$.requirementTitle','Changed') WHERE id='REQ-a'; UPDATE audit_requests SET data_json=json_set(data_json,'$.evidence[0].versionNo',2); UPDATE audit_request_workflows SET state='active'; UPDATE enterprise_findings SET status='closed'; UPDATE simple_grc_metadata SET value=json_set(value,'$.plan.scope','Changed scope') WHERE key='audit_plan_audit-a';`);
    assert.deepEqual(await f.detail(result.id),original);assert.equal((await f.preview()).workflow.state,'active');
    assert.deepEqual(await f.save(body),result);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_status_reports').get()?.n,1);
    await assert.rejects(f.save({...body,summary:'Another summary with same identifier'}),/id-conflict/);
    const list=await listAuditStatusReports(f.db,admin,'audit-a');assert.equal(list.reports[0].id,result.id);assert.equal(list.reports[0].itemCount,3);
  }finally{f.sqlite.close();}
});
test('ambiguous historical ID/code aliases block reporting instead of attaching one finding to two audits',async()=>{
  const f=await fixture();try{f.requirement('AUD-001','Audit B');f.finding('alias','AUD-001');await assert.rejects(f.preview(),/scope-ambiguous/);f.sqlite.exec(`UPDATE enterprise_findings SET source_ref='REQ-a' WHERE id='alias'`);assert.equal((await f.preview()).items.filter(i=>i.kind==='finding').length,2);}finally{f.sqlite.close();}
});
test('every source writer invalidates stale previews including codes, plan, catalog, requests and findings',async()=>{
  for(const sql of [
    `UPDATE simple_audits SET name='Renamed' WHERE id='audit-a'`,
    `UPDATE simple_grc_records SET data_json=json_set(data_json,'$.owner','Changed') WHERE id='REQ-a'`,
    `UPDATE simple_grc_record_codes SET code='AUD-999' WHERE record_id='REQ-a'`,
    `UPDATE simple_grc_metadata SET value=json_set(value,'$.revision','p2') WHERE key='audit_plan_audit-a'`,
    `INSERT INTO simple_grc_metadata VALUES('audit_catalog_audit-a','{}','')`,
    `UPDATE audit_requests SET revision='r2' WHERE id='ARQ-a'`,
    `UPDATE audit_request_workflows SET state='active' WHERE audit_id='audit-a'`,
    `INSERT INTO audit_requests SELECT 'ARQ-new',audit_id,data_json,'r2',created_at,updated_at FROM audit_requests WHERE id='ARQ-a'`,
    `DELETE FROM enterprise_findings WHERE id='F-a'`,
    `DELETE FROM simple_audits WHERE id='audit-a'`,
  ]){
    const f=await fixture();try{const body=await f.input();f.race(()=>f.sqlite.exec(sql),1);await assert.rejects(f.save(body),/changed/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_status_reports').get()?.n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_status_report_items').get()?.n,0);}finally{f.sqlite.close();}
  }
});
test('snapshot transaction rolls back on item failure and the same operation can safely retry',async()=>{
  const f=await fixture();try{
    const body=await f.input();f.sqlite.exec(`CREATE TRIGGER reject_report BEFORE INSERT ON audit_status_report_items BEGIN SELECT RAISE(ABORT,'injected snapshot failure'); END;`);
    await assert.rejects(f.save(body),/injected snapshot failure/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_status_reports').get()?.n,0);
    f.sqlite.exec('DROP TRIGGER reject_report');const saved=await f.save(body);assert.equal((await f.detail(saved.id)).integrity,'verified');
    // A concurrent identical request commits before this request claims the report ID.
    const next=await f.input();const captured=await f.save(next);assert.deepEqual(await f.save(next),captured);
  }finally{f.sqlite.close();}
});
test('non-admin roles and cross-audit identities cannot read, preview or create enterprise report snapshots',async()=>{
  const f=await fixture();try{
    const body=await f.input(),saved=await f.save(body);
    for(const role of ['Editor','Viewer']as const){const actor={...admin,role};await assert.rejects(readAuditReportSource(f.db,actor,'audit-a'),/forbidden/);await assert.rejects(listAuditStatusReports(f.db,actor,'audit-a'),/forbidden/);await assert.rejects(readAuditStatusReport(f.db,actor,'audit-a',saved.id),/forbidden/);await assert.rejects(createAuditStatusReport(f.db,actor,body),/forbidden/);}
    await assert.rejects(readAuditStatusReport(f.db,admin,'audit-b',saved.id),/report-missing/);
    f.sqlite.exec(`DELETE FROM simple_audits WHERE id='audit-a'`);await assert.rejects(f.detail(saved.id),/report-missing/);await assert.rejects(listAuditStatusReports(f.db,admin,'audit-a'),/audit-missing/);
  }finally{f.sqlite.close();}
});
test('missing or tampered snapshot rows fail integrity and cannot produce exports',async()=>{
  const f=await fixture();try{
    const saved=await f.save(await f.input());f.sqlite.prepare(`UPDATE audit_status_report_items SET record_json=json_set(record_json,'$.data.title','Tampered') WHERE report_id=? AND kind='finding'`).run(saved.id);
    const broken=await f.detail(saved.id);assert.equal(broken.integrity,'broken');assert.throws(()=>auditStatusReportHtml(broken,true),/integrity/);assert.throws(()=>auditStatusReportCsv(broken,false),/integrity/);assert.throws(()=>auditStatusReportPdf(broken,true),/integrity/);
    f.sqlite.prepare(`DELETE FROM audit_status_report_items WHERE report_id=? AND kind='request'`).run(saved.id);assert.equal((await f.detail(saved.id)).integrity,'unavailable');
  }finally{f.sqlite.close();}
});
test('full record limits use bounded SQL parameters; excess and oversized sources produce no partial report',async()=>{
  const f=await fixture();try{
    f.sqlite.exec('BEGIN');for(let i=1;i<2000;i++)f.requirement(`REQ-${i}`);for(let i=1;i<500;i++)f.request(`ARQ-${i}`);for(let i=1;i<1000;i++)f.finding(`F-${i}`);f.sqlite.exec('COMMIT');
    const body=await f.input(),saved=await f.save(body),detail=await f.detail(saved.id);assert.equal(detail.snapshot.items.length,3500);assert.equal(detail.integrity,'verified');assert.ok(f.maxBindings()<=10);
    f.requirement('one-too-many');await assert.rejects(f.preview(),/limit/);
  }finally{f.sqlite.close();}
  const large=await fixture();try{for(let i=0;i<90;i++)large.requirement(`big-${i}`,'Audit A',{requirementStatement:'z'.repeat(95000)});await assert.rejects(large.preview(),/limit/);assert.equal(large.sqlite.prepare('SELECT count(*) n FROM audit_status_reports').get()?.n,0);}finally{large.sqlite.close();}
});
test('invalid narratives and malformed stored sources do not create reports',async()=>{
  const f=await fixture();try{const body=await f.input();for(const patch of [{title:'a'},{summary:'short'},{limitations:'x'.repeat(4001)},{expectedSourceRevision:'x'}])await assert.rejects(f.save({...body,...patch}),/fields/);
    f.sqlite.exec(`UPDATE simple_grc_records SET data_json='[]' WHERE id='REQ-a'`);await assert.rejects(f.preview(),/source-invalid/);
  }finally{f.sqlite.close();}
});
test('history truncation is explicit and empty, cancelled and risk-accepted work never imply a clean opinion',async()=>{
  const f=await fixture();try{
    f.request('ARQ-cancelled',{status:'cancelled'});f.finding('accepted-risk','audit-a',{status:'accepted'});
    const n=auditReportSummary((await f.preview()).items);assert.equal(n.acceptedRequests,1);assert.equal(n.cancelledRequests,1);assert.equal(n.unresolvedFindings,2);
    for(let i=0;i<21;i++)await f.save(await f.input({title:`Status report ${i}`}));const list=await listAuditStatusReports(f.db,admin,'audit-a');assert.equal(list.reports.length,20);assert.equal(list.complete,false);assert.equal(list.reports[0].title,'Status report 20');
  }finally{f.sqlite.close();}
});
test('HTML, CSV and PDF preserve snapshot identity, all records, Turkish text and safe untrusted narratives',async()=>{
  const f=await fixture();try{
    for(let i=0;i<25;i++)f.requirement(`export-${i}`,'Audit A',{requirementTitle:`Ödeme süreci ${i}`,owner:'Çağrı',requirementStatement:'Uzun açıklama '.repeat(20)});
    const saved=await f.save(await f.input({title:'İstanbul Denetimi',summary:'<script>alert(1)</script> İnceleme sürüyor.',limitations:'\n=HYPERLINK("https://bad.test")'})),detail=await f.detail(saved.id);
    const html=auditStatusReportHtml(detail,true),csv=auditStatusReportCsv(detail,true);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Ödeme süreci 24/);assert.match(html,/Uzun açıklama/);assert.ok(html.includes(detail.sha256));assert.ok(csv.includes(saved.id));assert.match(csv,/"'=HYPERLINK/);assert.match(csv,/export-24/);assert.match(html,/denetim görüşü veya kapatma kararı değildir/);
    const blob=await auditStatusReportPdf(detail,true,new Uint8Array(readFileSync('public/fonts/FornostReportSans.ttf'))),pdf=await PDFDocument.load(await blob.arrayBuffer());assert.ok(pdf.getPageCount()>5);assert.match(pdf.getTitle()||'',/İstanbul Denetimi/);assert.equal(pdf.getAuthor(),admin.email);
  }finally{f.sqlite.close();}
});
