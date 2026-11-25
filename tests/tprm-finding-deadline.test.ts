import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { ensureWorkflowEvidenceSchema } from '../app/workflow-selection-store';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';
import { type FindingHistory } from '../app/third-party-risk/finding-history';
import type { Actor } from '../app/api/auth/security';

import { FINDING_DEADLINE_PHRASE, parseFindingDeadline, type FindingDeadlineContext } from '../app/third-party-risk/finding-deadline';
import { projectEnterpriseWork } from '../app/enterprise-work';
const actor = (id: string, role: 'Admin' | 'Editor' | 'Viewer' = 'Admin'): Actor => ({ id, name: id, email: id + '@example.com', role, source: 'local' });
const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
async function setup() {
  const f = fixture('third-party-risk'); await f.post({}); await ensureCoreGrcSchemaCompatibility(f.db); await ensureWorkflowEvidenceSchema(f.db);
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  for (const [id, role] of [['maker','Admin'], ['next','Admin'], ['other','Admin'], ['reviewer','Admin'], ['owner','Editor'], ['lead','Editor']]) f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
  const bytes = new TextEncoder().encode('Owned supplier review evidence'), hash = await sha256HexBytes(bytes), stamp = new Date().toISOString(), evidenceId = 'EVD-review', key = 'evidence/EVD-review/review.txt';
  const version = await appendEvidenceVersion(f.db, { evidenceId, fileKey:key, fileName:'review.txt', fileType:'text/plain', fileSize:bytes.length, contentSha256:hash, evidenceTitle:'Supplier review', owner:'owner@example.com', period:'2026-Q4', frameworks:'ISO 27001', controlRefs:'A.5.19', changeNote:'Review evidence', createdBy:'maker@example.com', createdAt:stamp }, { additionalStatements:c => [f.db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(evidenceId,'Kanıtlar',JSON.stringify({evidenceTitle:'Supplier review',versionNo:c.versionNo,versionChainSha256:c.chainSha256}),stamp,stamp)] });
  f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'review.txt','text/plain',bytes,stamp);
  const scoring = { impact:3, likelihood:2, controlMaturity:4, treatmentPlan:'Review supplier controls and independently verify evidence.', ...Object.fromEntries(TPRM_CONTROLS.map(k => [k,true])) };
  f.setActor(actor('maker'));
  const created = await f.post({ action:'save-vendor', assignmentMode:'directory', name:'Scheduled supplier', service:'Hosting assurance', legalEntity:'Supplier Ltd', category:'Technology', criticality:'high', dataClassification:'internal', dataAccess:'Synthetic metadata', hostingLocation:'Isolated QA', businessOwner:'lead@example.com', riskOwner:'owner@example.com', reviewer:'reviewer@example.com', contact:'external@example.test', contractEnd:date(365), nextReview:date(30), exitPlan:'Return records, revoke access and verify supplier deletion.', ...scoring });
  assert.equal(created.status,201,JSON.stringify(created.body)); const vendorId = String(created.body.vendorId), assessmentId = String(created.body.assessmentId), choice = { evidenceMode:'library', evidenceSelection:{ evidenceId, versionId:version.id } };


  const row = (table: string, id = vendorId, identity = table === 'third_party_profiles' ? 'vendor_id' : 'id') => f.sqlite.prepare(`SELECT * FROM ${table} WHERE ${identity}=?`).get(id)!;
  const count = (table: string) => Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);

  const createdFinding=await f.post({action:'add-finding',assessmentId,title:'Remediation history',severity:'low',description:'Retain each independent finding decision and its proof.',owner:'owner@example.com',dueDate:date(15),assignmentMode:'directory'});
  assert.equal(createdFinding.status,201,JSON.stringify(createdFinding.body));const findingId=String(createdFinding.body.id);
  const history=async(before?:string)=>{const r=await f.get(`view=finding-history&findingId=${findingId}${before?'&before='+encodeURIComponent(before):''}`);assert.equal(r.status,200,JSON.stringify(r.body));return r.body as unknown as FindingHistory;};
  const act=async(operation:string,note:string,extra:Record<string,unknown>={})=>{const r=await f.post({action:'finding-action',findingId,operation,note,expectedRevision:row('third_party_findings',findingId).updated_at,confirmation:({start:'BULGUYU BAŞLAT','submit-finding':'BULGUYU DOĞRULAMAYA GÖNDER','verify-finding':'BULGUYU KAPAT','reopen-finding':'BULGUYU YENİDEN AÇ'} as Record<string,string>)[operation],...(['submit-finding','verify-finding'].includes(operation)?choice:{}),...extra});assert.equal(r.status,200,JSON.stringify(r.body));};
  const context=async()=>{const r=await f.get(`view=finding-deadline-context&findingId=${findingId}`);assert.equal(r.status,200,JSON.stringify(r.body));return r.body as unknown as FindingDeadlineContext;};
  const input=async(patch:Record<string,unknown>={})=>({action:'reschedule-finding',findingId,contextToken:(await context()).token,nextDate:date(25),note:'Agree a revised deadline after independent review of the remaining work.',confirmation:FINDING_DEADLINE_PHRASE,...patch});
  f.setActor(actor('reviewer'));
  return {...f,row,count,vendorId,assessmentId,findingId,evidenceId,version,choice,history,act,context,input};
}

test('deadline planning retains late history, feedback and proof through resubmission and independent closure',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));await f.act('start','Start assigned remediation and collect the requested proof.');await f.act('submit-finding','Submit original remediation evidence for independent verification.');
  f.setActor(actor('reviewer'));await f.act('reopen-finding','Add the missing deletion verification before resubmission.');
  f.sqlite.prepare('UPDATE third_party_findings SET due_date=? WHERE id=?').run(date(-3),f.findingId);
  const before=f.row('third_party_findings',f.findingId),profile=f.row('third_party_profiles'),assessment=f.row('third_party_assessments',f.assessmentId),pins=f.sqlite.prepare('SELECT * FROM workflow_evidence_pins ORDER BY id').all(),input=await f.input();
  const saved=await f.post(input);assert.equal(saved.status,200,JSON.stringify(saved.body));
  const after=f.row('third_party_findings',f.findingId);for(const key of Object.keys(before))if(!['due_date','updated_by','updated_at'].includes(key))assert.equal(after[key],before[key],key);
  assert.equal(after.due_date,date(25));assert.notEqual(after.updated_at,before.updated_at);assert.deepEqual(f.row('third_party_profiles'),profile);assert.deepEqual(f.row('third_party_assessments',f.assessmentId),assessment);assert.deepEqual(f.sqlite.prepare('SELECT * FROM workflow_evidence_pins ORDER BY id').all(),pins);
  const event=(await f.history()).rows.find(r=>r.id===saved.body.eventId)!;assert.equal(event.deadline?.previousDate,date(-3));assert.equal(event.deadline?.wasOverdue,true);assert.equal(event.deadline?.owner,'owner@example.com');assert.equal(event.deadline?.cycleNumber,1);assert.equal(event.pin,null);
  const work=await f.get('view=work'),tasks=projectEnterpriseWork('vendor',work.body).rows,task=tasks.find(t=>t.nativeRef===f.findingId);assert.ok(task);assert.equal(task.data.dueDate,date(25));
  assert.equal((await f.post(input)).status,409);assert.equal((await f.history()).rows.filter(r=>r.action==='finding-deadline-changed').length,1);
  f.setActor(actor('owner','Editor'));await f.act('submit-finding','Resubmit after meeting the requested deletion verification.');f.setActor(actor('reviewer'));await f.act('verify-finding','Independently confirm the complete remediation proof.');
  f.setActor(actor('reader','Viewer'));const history=await f.history();assert.equal(history.finding.status,'closed');assert.equal(history.rows.find(r=>r.id===saved.body.eventId)?.deadline?.wasOverdue,true);assert.equal(history.rows.filter(r=>r.pin).length,3);
 }finally{f.sqlite.close()}
});

test('only assigned independent active Admin may schedule; canonical state and case-insensitive identities apply',async()=>{
 const f=await setup();try{
  const original=await f.input();
  for(const [id,role] of [['other','Admin'],['maker','Admin'],['owner','Editor'],['reader','Viewer'],['reviewer','Editor']] as const){f.setActor(actor(id,role));assert.equal((await f.context()).canSchedule,false);assert.equal((await f.post(original)).status,403);}
  f.setActor(actor('reviewer'));
  for(const [table,column,id] of [['third_party_findings','owner',f.findingId],['third_party_findings','created_by',f.findingId],['third_party_findings','submitted_by',f.findingId],['third_party_profiles','created_by',f.vendorId],['third_party_profiles','business_owner',f.vendorId],['third_party_profiles','risk_owner',f.vendorId]]){
   const identity=table==='third_party_profiles'?'vendor_id':'id',before=f.row(table,id)[column];f.sqlite.prepare(`UPDATE ${table} SET ${column}=? WHERE ${identity}=?`).run('REVIEWER@example.com',id);assert.equal((await f.context()).canSchedule,false);assert.equal((await f.post(await f.input())).status,403);f.sqlite.prepare(`UPDATE ${table} SET ${column}=? WHERE ${identity}=?`).run(before,id);
  }
  for(const status of ['verification','closed','unknown']){f.sqlite.prepare('UPDATE third_party_findings SET status=?').run(status);assert.equal((await f.context()).canSchedule,false);assert.equal((await f.post(await f.input())).status,403);}f.sqlite.prepare("UPDATE third_party_findings SET status='open'").run();
  for(const status of ['rejected','offboarded','unknown']){f.sqlite.prepare('UPDATE third_party_profiles SET status=?').run(status);assert.equal((await f.post(await f.input())).status,403);}f.sqlite.prepare("UPDATE third_party_profiles SET status='approved',reviewer='REVIEWER@example.com'").run();
  f.sqlite.prepare("UPDATE third_party_assessments SET status='superseded'").run();assert.equal((await f.context()).canSchedule,true);assert.equal((await f.post(await f.input({nextDate:date(400)}))).status,200,'An older-cycle finding may outlast its contract.');
 }finally{f.sqlite.close()}
});

test('invalid input and unavailable live identities fail without writing a date or event',async()=>{
 const f=await setup();try{
  const input=await f.input(),before=f.row('third_party_findings',f.findingId),events=f.count('third_party_events');
  for(const patch of [{nextDate:date(-1)},{nextDate:date(15)},{nextDate:'2027-02-29'},{nextDate:'2026-2-01'},{nextDate:'2099-01-01T00:00:00Z'},{nextDate:22},{nextDate:null},{note:'short'},{note:'x'.repeat(1201)},{note:'Control\u0000 character reason is forbidden'},{confirmation:'wrong'},{findingId:''},{contextToken:'wrong'},{owner:'other@example.com'},{evidenceMode:'library'}]){assert.ok([400,409].includes((await f.post({...input,...patch})).status),JSON.stringify(patch));}
  assert.deepEqual(f.row('third_party_findings',f.findingId),before);assert.equal(f.count('third_party_events'),events);
  for(const [column,value] of [['status','Disabled'],['role','Editor']]){f.sqlite.prepare(`UPDATE local_users SET ${column}=? WHERE id='reviewer'`).run(value);assert.equal((await f.post(input)).status,403);f.sqlite.prepare("UPDATE local_users SET status='Active',role='Admin' WHERE id='reviewer'").run();}
  assert.equal((await f.post({...input,nextDate:date(0)})).status,200,'Today is a valid revised date');
 }finally{f.sqlite.close()}
});

test('full source tokens reject unversioned finding, profile and assessment changes',async()=>{
 const f=await setup();try{
  for(const [table,column,id,value] of [['third_party_findings','description',f.findingId,'Changed remediation scope'],['third_party_profiles','exit_plan',f.vendorId,'Changed exit obligation'],['third_party_assessments','treatment_plan',f.assessmentId,'Changed underlying assessment']]){
   const input=await f.input(),identity=table==='third_party_profiles'?'vendor_id':'id',events=f.count('third_party_events');f.sqlite.prepare(`UPDATE ${table} SET ${column}=? WHERE ${identity}=?`).run(value,id);assert.equal((await f.post(input)).status,409);assert.equal(f.count('third_party_events'),events);assert.equal(f.row('third_party_findings',f.findingId).due_date,date(15));
  }
  f.sqlite.prepare("UPDATE third_party_assessments SET vendor_id='foreign'").run();assert.equal((await f.get(`view=finding-deadline-context&findingId=${f.findingId}`)).status,404);
 }finally{f.sqlite.close()}
});

test('commit-time source and active identity races leave no partial deadline event',async()=>{
 for(const sql of ["UPDATE third_party_findings SET description='Changed concurrently'","UPDATE third_party_profiles SET exit_plan='Changed concurrently'","UPDATE third_party_assessments SET treatment_plan='Changed concurrently'","UPDATE local_users SET status='Disabled' WHERE id='reviewer'","UPDATE local_users SET role='Editor' WHERE id='reviewer'","INSERT INTO user_module_access VALUES('reviewer','{\"mode\":\"scoped\"}')"]){
  const f=await setup();try{const input=await f.input(),events=f.count('third_party_events');f.before(()=>f.sqlite.exec(sql));assert.equal((await f.post(input)).status,409,sql);assert.equal(f.row('third_party_findings',f.findingId).due_date,date(15));assert.equal(f.count('third_party_events'),events);}finally{f.sqlite.close()}
 }
 const f=await setup();try{const input=await f.input(),before=f.row('third_party_findings',f.findingId),events=f.count('third_party_events');f.sqlite.exec("CREATE TRIGGER reject_deadline BEFORE INSERT ON third_party_events WHEN NEW.action='finding-deadline-changed' BEGIN SELECT RAISE(ABORT,'event-store-failed');END");assert.equal((await f.post(input)).status,400);assert.deepEqual(f.row('third_party_findings',f.findingId),before);assert.equal(f.count('third_party_events'),events);}finally{f.sqlite.close()}
});

test('repeated explicit replanning appends facts and malformed historical details are not reconstructed',async()=>{
 const f=await setup();try{
  assert.equal((await f.post(await f.input())).status,200);assert.equal((await f.post(await f.input({nextDate:date(40)}))).status,200);
  const h=await f.history(),events=h.rows.filter(r=>r.deadline);assert.equal(events.length,2);assert.equal(events[0].deadline?.previousDate,date(25));assert.equal(events[1].deadline?.previousDate,date(15));assert.ok(events.every(r=>r.deadline?.wasOverdue===false));
  const raw=f.sqlite.prepare("SELECT detail FROM third_party_events WHERE id=?").get(events[0].id)!.detail,parsed=JSON.parse(String(raw));
  for(const value of ['{}','null','{bad',JSON.stringify({...parsed,wasOverdue:'false'}),JSON.stringify({...parsed,nextDate:parsed.previousDate}),JSON.stringify({...parsed,cycleNumber:0})]){assert.equal(parseFindingDeadline(value),null);f.sqlite.prepare('UPDATE third_party_events SET detail=? WHERE id=?').run(value,events[0].id);assert.equal((await f.history()).rows.find(r=>r.id===events[0].id)?.deadline,null);}
 }finally{f.sqlite.close()}
});

test('deadline context rejects ambiguous selectors and distinguishes failed reads from missing records',async()=>{
 const f=await setup();try{
  for(const q of ['view=finding-deadline-context','view=finding-deadline-context&findingId=','view=finding-deadline-context&findingId=x&findingId=y','view=finding-deadline-context&findingId=x&view=work','view=finding-deadline-context&findingId=x&page=1','view=finding-deadline-context&findingId='+ 'a'.repeat(101)])assert.equal((await f.get(q)).status,400);
  assert.equal((await f.get('view=finding-deadline-context&findingId=missing')).status,404);
  f.sqlite.exec('ALTER TABLE third_party_assessments RENAME COLUMN vendor_id TO broken_vendor');assert.equal((await f.get(`view=finding-deadline-context&findingId=${f.findingId}`)).status,503);
 }finally{f.sqlite.close()}
});

test('rapid finding decisions retain their causal order even when the prior record stamp is ahead of the wall clock',async()=>{
 const f=await setup();try{
  f.sqlite.prepare('UPDATE third_party_findings SET updated_at=? WHERE id=?').run(new Date(Date.now()+10000).toISOString(),f.findingId);
  f.setActor(actor('owner','Editor'));await f.act('start','Start remediation using the current finding revision.');
  const started=f.row('third_party_findings',f.findingId);assert.equal((await f.history()).rows[0].createdAt,started.updated_at);
  f.setActor(actor('reviewer'));assert.equal((await f.post(await f.input())).status,200);
  const h=await f.history();assert.deepEqual(h.rows.map(r=>r.action),['finding-deadline-changed','finding-start','finding-create']);assert.ok(h.rows[0].createdAt>h.rows[1].createdAt);
 }finally{f.sqlite.close()}
});
