import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { ensureWorkflowEvidenceSchema } from '../app/workflow-selection-store';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';
import { HANDOFF_CONFIRMATION, parseReviewerHandoffRecord } from '../app/third-party-risk/reviewer-handoff';
import { projectEnterpriseWork } from '../app/enterprise-work';
import type { Actor } from '../app/api/auth/security';

const actor = (id: string, role: 'Admin' | 'Editor' | 'Viewer' = 'Admin'): Actor => ({ id, name: id, email: id + '@example.com', role, source: 'local' });
const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
async function setup(previous = date(-1)) {
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
  f.sqlite.prepare('UPDATE third_party_profiles SET next_review=? WHERE vendor_id=?').run(previous,vendorId);
  f.sqlite.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.nextAssessment',?) WHERE id=?").run(previous,vendorId);
  const row = (table: string, id = vendorId, identity = table === 'third_party_profiles' ? 'vendor_id' : 'id') => f.sqlite.prepare(`SELECT * FROM ${table} WHERE ${identity}=?`).get(id)!;
  const count = (table: string) => Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
  f.setActor(actor('owner','Editor'));
  assert.equal((await f.post({ action:'assessment-action', assessmentId, operation:'submit', note:'Submit the supplier review evidence.', confirmation:'İNCELEMEYE GÖNDER', expectedRevision:row('third_party_assessments',assessmentId).updated_at, ...choice })).status,200);
  f.setActor(actor('reviewer'));
  const decision = (patch: Record<string,unknown> = {}) => ({ action:'assessment-action', assessmentId, operation:'approve', note:'Independent reviewer checked the assessment and selected the next review date.', confirmation:'TEDARİKÇİYİ ONAYLA', expectedRevision:row('third_party_assessments',assessmentId).updated_at, ...choice, reviewSchedule:{ profileRevision:row('third_party_profiles').updated_at, previousDate:row('third_party_profiles').next_review, contractEnd:row('third_party_profiles').contract_end, nextDate:date(90) }, ...patch });
  const extension = (patch: Record<string,unknown> = {}) => ({action:'extend-contract',vendorId,expectedRevision:row('third_party_profiles').updated_at,contractExtension:{previousDate:String(row('third_party_profiles').contract_end),nextDate:date(730)},note:'The independently verified executed contract amendment extends the supplier term.',confirmation:'SÖZLEŞME UZATIMINI KAYDET',...choice,...patch});
  f.setActor(actor('maker'));
  const context=async()=>{const r=await f.get(`view=reviewer-context&vendorId=${vendorId}`);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const handoff=async(patch:Record<string,unknown>={})=>{const c=await context();return{action:'reassign-reviewer',vendorId,assignmentMode:'directory',reviewer:'next@example.com',expectedRevision:c.revision,previousReviewer:c.reviewer,contextToken:c.token,note:'Transfer review responsibility to an independent active administrator.',confirmation:HANDOFF_CONFIRMATION,...patch};};
  const history=()=>f.get(`view=reviewer-history&vendorId=${vendorId}`);
  const finding=async()=>{const r=await f.post({action:'add-finding',assessmentId,title:'Owned handoff finding',severity:'low',description:'Synthetic finding to verify reviewer handoff.',owner:'owner@example.com',dueDate:date(15),assignmentMode:'directory'});assert.equal(r.status,201,JSON.stringify(r.body));return String(r.body.id);};
  return { ...f, row, count, vendorId, assessmentId, decision, scoring, extension, evidenceId, version,context,handoff,history,finding,choice };
}

test('handoff changes pending responsibility once, retains evidence/dates and lets only the new reviewer decide',async()=>{
  const f=await setup();try{
    const findingId=await f.finding();f.sqlite.prepare("UPDATE third_party_findings SET status='verification',submitted_by='owner@example.com' WHERE id=?").run(findingId);
    const profile=f.row('third_party_profiles'),assessment=f.row('third_party_assessments',f.assessmentId),finding=f.row('third_party_findings',findingId),core=f.row('simple_grc_records');
    const pins=f.sqlite.prepare('SELECT * FROM workflow_evidence_pins').all(),body=await f.handoff(),result=await f.post(body);assert.equal(result.status,200,JSON.stringify(result.body));
    const changed=f.row('third_party_profiles');assert.deepEqual({...changed},{...profile,reviewer:'next@example.com',updated_by:'maker@example.com',updated_at:changed.updated_at});assert.notEqual(changed.updated_at,profile.updated_at);
    assert.deepEqual(f.row('third_party_assessments',f.assessmentId),assessment);assert.deepEqual(f.row('third_party_findings',findingId),finding);assert.deepEqual(f.row('simple_grc_records'),core);assert.deepEqual(f.sqlite.prepare('SELECT * FROM workflow_evidence_pins').all(),pins);
    const work=projectEnterpriseWork('vendor',(await f.get('view=work')).body);for(const kind of ['vendor-assessment','vendor-finding'])assert.equal(work.rows.find(row=>row.workKind===kind)?.data.reviewer,'next@example.com');
    assert.equal((await f.post(body)).status,409);const history=(await f.history()).body.rows as {actor:string;detail:unknown}[];assert.equal(history.length,1);assert.equal(history[0].actor,'maker@example.com');assert.deepEqual(history[0].detail,{previousReviewer:'reviewer@example.com',reviewer:'next@example.com',note:body.note,counts:{activeAssessments:1,submittedAssessments:1,openFindings:1,verificationFindings:1}});
    f.setActor(actor('reviewer'));assert.equal((await f.post(f.decision())).status,409);
    f.setActor(actor('next'));assert.equal((await f.post(f.decision())).status,200);assert.equal(f.row('third_party_assessments',f.assessmentId).decided_by,'next@example.com');
    assert.equal((await f.post({action:'finding-action',findingId,operation:'verify-finding',expectedRevision:f.row('third_party_findings',findingId).updated_at,note:'Independent reviewer verified retained remediation evidence.',confirmation:'BULGUYU KAPAT',...f.choice})).status,200);
    f.setActor(actor('maker'));assert.equal((await f.post(await f.handoff({reviewer:'other@example.com'}))).status,200);
    const completed=projectEnterpriseWork('vendor',(await f.get('view=work')).body);for(const kind of ['vendor-assessment','vendor-finding'])assert.equal(completed.rows.find(row=>row.workKind===kind)?.data.reviewer,'next@example.com');
    assert.equal(f.row('third_party_findings',findingId).verified_by,'next@example.com');assert.equal(f.count('workflow_evidence_pins'),pins.length+2);
  }finally{f.sqlite.close()}
});
test('disabled previous reviewer does not block an administrative transfer',async()=>{
  const f=await setup();try{f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='reviewer'");assert.equal((await f.post(await f.handoff())).status,200);}finally{f.sqlite.close()}
});
test('handoff is Admin-only; full-access Viewer can read retained history but not assignment context',async()=>{
  for(const role of ['Editor','Viewer'] as const){const f=await setup();try{const body=await f.handoff();f.setActor(actor('owner',role));assert.equal((await f.post(body)).status,403);assert.equal((await f.get(`view=reviewer-context&vendorId=${f.vendorId}`)).status,403);assert.equal((await f.history()).status,200);}finally{f.sqlite.close()}}
  for(const status of ['offboarded','rejected','unmanaged']){const f=await setup();try{f.sqlite.prepare('UPDATE third_party_profiles SET status=?').run(status);assert.equal((await f.post(await f.handoff())).status,403);}finally{f.sqlite.close()}}
});
test('candidate must be active independent Admin, distinct from actor/current reviewer/owners/contributors',async()=>{
  for(const candidate of ['maker','reviewer','owner','lead','absent']){const f=await setup();try{assert.equal((await f.post(await f.handoff({reviewer:candidate+'@example.com'}))).status,422);}finally{f.sqlite.close()}}
  for(const sql of ["UPDATE local_users SET status='Disabled' WHERE id='next'","UPDATE local_users SET role='Editor' WHERE id='next'","UPDATE third_party_profiles SET created_by='NEXT@example.com'","UPDATE third_party_profiles SET business_owner='next@example.com'","UPDATE third_party_profiles SET risk_owner='next@example.com'","UPDATE third_party_assessments SET created_by='next@example.com'","UPDATE third_party_assessments SET submitted_by='next@example.com'","UPDATE third_party_findings SET owner='next@example.com'","UPDATE third_party_findings SET created_by='next@example.com'","UPDATE third_party_findings SET submitted_by='next@example.com'"]){const f=await setup();try{await f.finding();f.sqlite.exec(sql);assert.equal((await f.post(await f.handoff())).status,422,sql);}finally{f.sqlite.close()}}
});
test('strict input, stale profile, reviewer and work snapshot cannot create partial or duplicate transfers',async()=>{
  const f=await setup();try{
    const body=await f.handoff(),before=f.row('third_party_profiles'),events=f.count('third_party_events');
    for(const patch of [{vendorId:''},{vendorId:['id']},{expectedRevision:undefined},{previousReviewer:undefined},{contextToken:'bad'},{assignmentMode:undefined},{confirmation:'yes'},{reviewer:''},{note:'short'},{note:'x'.repeat(1201)},{note:'valid explanation with\u0000null'},{evidenceMode:'library'},{unexpected:true}])assert.equal((await f.post({...body,...patch})).status,400,JSON.stringify(patch));
    for(const patch of [{expectedRevision:'stale'},{previousReviewer:'wrong@example.com'},{contextToken:'a'.repeat(64)}])assert.equal((await f.post({...body,...patch})).status,409);
    assert.deepEqual(f.row('third_party_profiles'),before);assert.equal(f.count('third_party_events'),events);
    f.sqlite.exec("UPDATE third_party_assessments SET submitted_by='other@example.com'");assert.equal((await f.post(body)).status,409);assert.equal((await f.post(await f.handoff())).status,200);
  }finally{f.sqlite.close()}
});
test('commit-time profile, active work membership/content and live identity changes reject handoff atomically',async()=>{
  const changes=["UPDATE third_party_profiles SET next_review='2099-01-01'","UPDATE third_party_profiles SET reviewer='other@example.com'","UPDATE third_party_profiles SET status='offboarded'","UPDATE third_party_assessments SET created_by='next@example.com'","UPDATE third_party_assessments SET status='approved'","DELETE FROM third_party_assessments","UPDATE third_party_findings SET owner='next@example.com'","UPDATE third_party_findings SET submitted_by='next@example.com'","UPDATE third_party_findings SET due_date='2099-01-01'","UPDATE third_party_findings SET status='closed'","DELETE FROM third_party_findings","UPDATE local_users SET status='Disabled' WHERE id='next'","UPDATE local_users SET role='Editor' WHERE id='next'","UPDATE local_users SET status='Disabled' WHERE id='maker'","UPDATE local_users SET role='Viewer' WHERE id='maker'","INSERT INTO user_module_access VALUES('next','{}')"];
  for(const sql of changes){const f=await setup();try{await f.finding();const body=await f.handoff(),events=f.count('third_party_events');f.before(()=>f.sqlite.exec(sql));assert.equal((await f.post(body)).status,409,sql);assert.notEqual(f.row('third_party_profiles').reviewer,'next@example.com');assert.equal(f.count('third_party_events'),events);}finally{f.sqlite.close()}}
  const f=await setup();try{const id=await f.finding(),body=await f.handoff(),columns=Object.keys(f.row('third_party_findings',id));f.before(()=>f.sqlite.exec(`INSERT INTO third_party_findings(${columns.join(',')}) SELECT ${columns.map(key=>key==='id'?"'TPF-extra'":key).join(',')} FROM third_party_findings WHERE id='${id}'`));assert.equal((await f.post(body)).status,409);}finally{f.sqlite.close()}
});
test('event failure rolls back assignment and live disabled assigning Admin cannot write',async()=>{
  const f=await setup();try{const body=await f.handoff(),profile=f.row('third_party_profiles');f.sqlite.exec("CREATE TRIGGER fail_handoff BEFORE INSERT ON third_party_events WHEN NEW.action='vendor-reviewer-reassigned' BEGIN SELECT RAISE(ABORT,'owned failure'); END");assert.equal((await f.post(body)).status,400);assert.deepEqual(f.row('third_party_profiles'),profile);assert.equal(((await f.history()).body.rows as unknown[]).length,0);f.sqlite.exec("DROP TRIGGER fail_handoff;UPDATE local_users SET status='Disabled' WHERE id='maker'");assert.equal((await f.post(body)).status,403);}finally{f.sqlite.close()}
});
test('history is bounded, paginated, preserves malformed legacy entries and validates query selectors',async()=>{
  const f=await setup();try{const body=await f.handoff();assert.equal((await f.post(body)).status,200);const first=(await f.history()).body.rows as {id:string}[];const event=f.sqlite.prepare('SELECT * FROM third_party_events WHERE id=?').get(first[0].id)!;const insert=f.sqlite.prepare('INSERT INTO third_party_events(id,vendor_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?)');for(let i=0;i<51;i++)insert.run('handoff-'+i,f.vendorId,event.action,i===0?'malformed':event.detail,event.actor,new Date(Date.now()+i+1000).toISOString());const page=(await f.history()).body;assert.equal((page.rows as unknown[]).length,50);assert.equal(page.hasMore,true);const next=(await f.get(`view=reviewer-history&vendorId=${f.vendorId}&page=1`)).body;assert.equal((next.rows as unknown[]).length,2);assert.equal(next.hasMore,false);assert.equal((next.rows as {detail:unknown}[])[0].detail,null);
    for(const query of ['view=reviewer-context','view=reviewer-context&vendorId=x&page=0','view=reviewer-history&vendorId=x&page=-1','view=reviewer-history&vendorId=x&page=10000','view=reviewer-history&vendorId=x&vendorId=y','view=reviewer-context&vendorId=x&format=csv'])assert.equal((await f.get(query)).status,400,query);
    assert.equal((await f.get('view=reviewer-history&vendorId=missing')).status,404);
    for(const invalid of ['null','{}','{bad',JSON.stringify({schema:'tprm-reviewer-handoff-v1',reviewer:'r',previousReviewer:'p',note:'n',counts:{activeAssessments:0,submittedAssessments:1,openFindings:0,verificationFindings:0}})])assert.equal(parseReviewerHandoffRecord(invalid),null);
  }finally{f.sqlite.close()}
});
test('too much active work explicitly blocks an incomplete handoff context and write',async()=>{
  for(const table of ['third_party_findings','third_party_assessments']){const f=await setup();try{
    const id=table==='third_party_findings'?await f.finding():f.assessmentId,body=await f.handoff(),columns=Object.keys(f.row(table,id)),rows=columns.map(key=>key==='id'?"?":key==='cycle_number'?'?':key).join(',');const insert=f.sqlite.prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${rows} FROM ${table} WHERE id=?`);
    for(let i=0;i<2000;i++)insert.run(...(table==='third_party_findings'?['extra-'+i,id]:['extra-'+i,i+2,id]));
    assert.equal((await f.get(`view=reviewer-context&vendorId=${f.vendorId}`)).status,409);assert.equal((await f.post(body)).status,409);assert.equal(((await f.history()).body.rows as unknown[]).length,0);
  }finally{f.sqlite.close()}}
});
