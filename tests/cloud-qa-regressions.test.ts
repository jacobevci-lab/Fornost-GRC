import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/enterprise-route-fixture';
import {deleteAudit,AuditLinked} from '../app/audit-delete';
import {LifecycleConflict} from '../app/enterprise-lifecycle-write';
import {extractKnowledgeDocument} from '../app/ai/document-extraction';
import {policyImportForm} from '../app/policy-lifecycle/import-store';
import {projectEnterpriseWork} from '../app/enterprise-work';
import {buildConnectedGrcEnterpriseRows} from '../app/connected-grc-sources';
import {buildConnectedGrcGraph,assessConnectedGrcCoverage} from '../app/connected-grc-model';
import {connectedGrcNavigation} from '../app/connected-grc-navigation';

async function auditFixture(){
 const f=fixture('findings');await f.post({});
 f.sqlite.exec(`CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT);CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 INSERT INTO simple_audits VALUES('AUDIT-1','ISO Audit','ISO','Internal','Auditor','Owner','open','2026-01-01','2026-01-01');
 INSERT INTO simple_grc_records VALUES('requirement-1','Denetim Yönetimi','{"auditName":"ISO Audit"}','2026-01-01','2026-01-01');
 INSERT INTO simple_grc_record_codes VALUES('requirement-1','AUD-001');`);
 const row=f.sqlite.prepare('SELECT * FROM simple_audits').get() as Record<string,string>;
 return {...f,row,remove:()=>deleteAudit(f.db,row,'admin@example.com')};
}
test('audit removal archives an exact unlinked snapshot and its requirements atomically',async()=>{
 const f=await auditFixture();try{assert.equal(await f.remove(),1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_audits').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_records').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_record_codes').get()!.n,0);const a=JSON.parse(String(f.sqlite.prepare("SELECT value FROM simple_grc_metadata WHERE key='audit_archive_AUDIT-1'").get()!.value));assert.deepEqual(a.audit,{...f.row});assert.equal(a.requirementCount,1);}finally{f.sqlite.close()}
});
test('audit CAPA references protect parent IDs and child IDs/codes, including a concurrent historical reference',async()=>{
 for(const ref of ['AUDIT-1','requirement-1','AUD-001','other; AUD-001']){
  const f=await auditFixture();try{
   f.sqlite.exec('CREATE TABLE regulatory_change_impacts(target_ref TEXT,target_type TEXT)');
   f.before(()=>f.sqlite.prepare("INSERT INTO regulatory_change_impacts VALUES(?,'audit')").run(ref));
   await assert.rejects(f.remove(),AuditLinked);assert.ok(f.sqlite.prepare('SELECT * FROM simple_audits').get());assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_metadata').get()!.n,0);
  }finally{f.sqlite.close()}
 }
 const f=await auditFixture();try{f.sqlite.exec('CREATE TABLE audit_requests(id TEXT,audit_id TEXT);INSERT INTO audit_requests VALUES(\'req\',\'AUDIT-1\')');await assert.rejects(f.remove(),AuditLinked);}finally{f.sqlite.close()}
});
test('audit races and write failure preserve requirements, codes and archive consistency',async()=>{
 for(const race of ['parent','requirement','new-table','failure']){
  const f=await auditFixture();try{
   f.before(()=>{if(race==='parent')f.sqlite.exec("UPDATE simple_audits SET name='Changed'");if(race==='requirement')f.sqlite.exec("UPDATE simple_grc_records SET data_json='{}'");if(race==='new-table')f.sqlite.exec('CREATE TABLE audit_requests(id TEXT,audit_id TEXT)');if(race==='failure')f.sqlite.exec("CREATE TRIGGER fail BEFORE DELETE ON simple_audits BEGIN SELECT RAISE(ABORT,'injected'); END");});
   if(race==='failure')await assert.rejects(f.remove());else await assert.rejects(f.remove(),LifecycleConflict);assert.ok(f.sqlite.prepare('SELECT * FROM simple_audits').get());assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_metadata').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_record_codes').get()!.n,1);
  }finally{f.sqlite.close()}
 }
});
test('the exact cloud QA python-docx file passes bounded validation and browser ArrayBuffer text extraction',async()=>{
 const bytes=readFileSync('tests/fixtures/policy-import-python-docx.docx');
 const file=new File([bytes],'qa-policy.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
 const form=new FormData();form.set('file',file);form.set('operation','preview');
 const validated=await policyImportForm(new Request('http://fixture.invalid',{method:'POST',body:form}));assert.equal(validated.bytes.length,bytes.length);
 const result=await extractKnowledgeDocument(file,false);assert.equal(result.sourceType,'docx');assert.match(result.content,/Yalnızca sentetik test belgesidir/);assert.match(result.content,/Dosya içe aktarma/);
});

const plan={action:'create-plan',name:'Recovery draft',process:'Payments process',biaRef:'BIA-001',criticality:'high',owner:'owner@example.com',reviewer:'reviewer@example.com',crisisLead:'lead@example.com',rtoHours:4,rpoHours:1,mtpdHours:8,dependencies:'Identity and database',recoveryStrategy:'Restore the secondary site and verify service recovery.',communicationPlan:'Contact the crisis team and notify the owners.',alternateSite:'DR site',supplierDependencies:'Network provider',minimumStaff:3,reviewDate:'2027-11-12'};
async function continuityFixture(){
 const f=fixture('continuity');await f.post({});
 f.sqlite.exec(`CREATE TABLE local_users(id TEXT,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT,policy_json TEXT);
 INSERT INTO local_users VALUES('owner','Owner','owner@example.com','Admin','Active'),('reviewer','Reviewer','reviewer@example.com','Admin','Active'),('lead','Lead','lead@example.com','Editor','Active');
 CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT);CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT);
 INSERT INTO simple_grc_records VALUES('bia','BIA','{}','2026-01-01');INSERT INTO simple_grc_record_codes VALUES('bia','BIA-001');`);
 f.setActor({id:'owner',name:'Owner',role:'Admin',email:plan.owner,source:'local'});
 const r=await f.post(plan);assert.equal(r.status,201);const id=String(r.body.id);
 const current=()=>f.sqlite.prepare('SELECT * FROM enterprise_continuity_plans WHERE id=?').get(id)!;
 const post=(action:string,extra:Record<string,unknown>={})=>f.post({action,planId:id,expectedUpdatedAt:current().updated_at,note:'Reviewed the recovery plan and dependencies.',...extra});
 return {...f,id,current,postPlan:post};
}
test('continuity draft edit → explicit submission → independent approval → activation → exercise',async()=>{
 const f=await continuityFixture();try{
  let work=projectEnterpriseWork('continuity',(await f.get('view=work')).body);assert.equal(work.rows[0].data.workWaitingForReview,false);assert.equal(work.rows[0].data.reviewer,'');
  const edit=await f.postPlan('edit-plan',{...plan,action:'edit-plan',name:'Corrected recovery plan'});assert.equal(edit.status,200,JSON.stringify(edit));assert.equal(f.current().alternate_site,'DR site');
  assert.equal((await f.postPlan('approve-plan',{confirmation:'PLANI ONAYLA'})).status,409);
  assert.equal((await f.postPlan('submit-plan',{confirmation:'PLANI İNCELEMEYE GÖNDER'})).status,200);
  work=projectEnterpriseWork('continuity',(await f.get('view=work')).body);assert.equal(work.rows[0].data.workWaitingForReview,true);
  assert.equal((await f.postPlan('approve-plan',{confirmation:'PLANI ONAYLA'})).status,403);
  f.setActor({id:'reviewer',name:'Reviewer',role:'Admin',email:plan.reviewer,source:'local'});
  assert.equal((await f.postPlan('return-plan',{confirmation:'PLANI TASLAĞA İADE ET'})).status,200);
  assert.equal((await f.postPlan('edit-plan',{...plan,action:'edit-plan'})).status,403);
  f.setActor({id:'owner',name:'Owner',role:'Admin',email:plan.owner,source:'local'});
  assert.equal((await f.postPlan('submit-plan',{confirmation:'PLANI İNCELEMEYE GÖNDER'})).status,200);
  f.setActor({id:'reviewer',name:'Reviewer',role:'Admin',email:plan.reviewer,source:'local'});
  assert.equal((await f.postPlan('approve-plan',{confirmation:'PLANI ONAYLA'})).status,200);
  assert.equal((await f.postPlan('activate-plan',{confirmation:'PLANI ETKİNLEŞTİR'})).status,200);
  assert.equal((await f.post({action:'schedule-exercise',planId:f.id,type:'tabletop',scheduledDate:'2027-01-01',scenario:'Exercise the full documented recovery strategy.',facilitator:plan.owner})).status,201);
 }finally{f.sqlite.close()}
});
test('continuity cancellation is version-bound and auditable, and cannot approve or edit cancelled drafts',async()=>{
 const f=await continuityFixture();try{
  assert.equal((await f.postPlan('cancel-plan',{expectedUpdatedAt:'stale',confirmation:'PLANI İPTAL ET'})).status,409);
  assert.equal((await f.postPlan('cancel-plan',{confirmation:'PLANI İPTAL ET'})).status,200);assert.equal(f.current().status,'cancelled');
  assert.equal((await f.postPlan('submit-plan',{confirmation:'PLANI İNCELEMEYE GÖNDER'})).status,409);
  const work=projectEnterpriseWork('continuity',(await f.get('view=work')).body);assert.equal(work.complete,true);assert.equal(work.rows[0].data.workClosed,true);
  assert.ok(f.sqlite.prepare("SELECT * FROM enterprise_continuity_events WHERE action='cancel'").get());
 }finally{f.sqlite.close()}
});
test('canonical audit parents resolve CAPA without claiming requirement coverage; framework labels do not fan out to compliance rows',()=>{
 const rows=buildConnectedGrcEnterpriseRows({audits:{audits:[{id:'AUDIT-1',name:'Audit parent',audit_owner:'Owner',status:'open'}]},findings:{findings:[{id:'FND-1',sourceType:'audit',sourceRef:'AUDIT-1',title:'Finding'}]}});
 rows.push(...[1,2,3,4].map(n=>({id:`cmp-${n}`,code:`CMP-00${n}`,module:'Uyum',data:{framework:'ISO 27001',title:`Requirement ${n}`}})),{id:'ctl',module:'Kontroller',data:{frameworks:['ISO 27001','CMP-001']}});
 const graph=buildConnectedGrcGraph(rows);assert.equal(graph.unresolved.length,0);assert.equal(graph.links.filter(e=>e.relation==='finding-audit').length,1);assert.equal(graph.links.filter(e=>e.relation==='control-framework').length,1);
 const parent=rows.find(r=>r.data.kind==='audit')!;assert.equal(connectedGrcNavigation(parent)?.ref,'AUDIT-1');assert.equal(connectedGrcNavigation(parent)?.kind,'audit');assert.ok(!assessConnectedGrcCoverage(rows,graph.links).gaps.some(g=>g.row===parent));
});
