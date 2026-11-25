import {appendEvidenceVersion} from '../app/evidence/versioning';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,prepareExit,actor,future} from './helpers/supplier-evidence-fixture';
test('the complete supplier assessment, remediation and exit chain pins canonical evidence with each event',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit')).status,200);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('approve')).status,200);
  const id=await f.addFinding();f.setActor(actor('owner','Editor'));assert.equal((await f.decision('start',id)).status,200);assert.equal((await f.decision('submit-finding',id)).status,200);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('verify-finding',id)).status,200);await prepareExit(f);assert.equal((await f.decision('offboard',f.vendorId)).status,200);
  const pins=f.sqlite.prepare('SELECT p.*,e.id event FROM workflow_evidence_pins p LEFT JOIN third_party_events e ON e.id=p.event_id').all();assert.equal(pins.length,6);
  assert.deepEqual(pins.map(p=>p.purpose).sort(),['assessment-approved','assessment-submit','exit-receipt','submit-finding','vendor-offboard','verify-finding']);
  assert.ok(pins.every(p=>p.event&&p.workflow==='tprm'&&JSON.parse(String(p.snapshot_json)).id===f.version.id));
  assert.equal(f.row('third_party_profiles',f.vendorId,'vendor_id').status,'offboarded');assert.equal(f.row('third_party_findings',id).status,'closed');
  assert.equal(f.row('third_party_assessments',f.assessmentId).evidence_sha256,f.hash);assert.equal((await f.get()).body.evidencePinsLimited,false);assert.equal(((await f.get()).body.evidencePins as unknown[]).length,6);
  assert.equal((await f.decision('offboard',f.vendorId)).status,404);assert.equal(f.count('workflow_evidence_pins'),6);
 }finally{f.sqlite.close()}
});

test('conditional decisions retain a distinct pin and manual legacy calls never acquire a canonical pin',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit',f.assessmentId,{evidenceMode:undefined,evidenceSelection:undefined,evidenceReference:'legacy-file',evidenceSha256:'a'.repeat(64)})).status,200);assert.equal(f.count('workflow_evidence_pins'),0);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('conditional')).status,200);assert.equal(f.sqlite.prepare('SELECT purpose FROM workflow_evidence_pins').get()!.purpose,'assessment-conditional');
 }finally{f.sqlite.close()}
});

test('missing, mismatched, tampered and stale selections fail without advancing the assessment',async()=>{
 for(const mode of ['missing','mismatch','bytes','chain','anchor','missing-revision','stale']){
  const f=await setup();try{
   f.setActor(actor('owner','Editor'));let patch:Record<string,unknown>={};
   if(mode==='missing')f.sqlite.exec('DELETE FROM simple_evidence_files');
   if(mode==='mismatch')patch={evidenceSelection:{evidenceId:'EVD-other',versionId:f.version.id}};
   if(mode==='bytes')f.sqlite.prepare('UPDATE simple_evidence_files SET content=?').run(new TextEncoder().encode('changed'));
   if(mode==='chain')f.sqlite.exec("UPDATE evidence_versions SET period='changed'");
   if(mode==='anchor')f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run('{}',f.evidenceId);
   if(mode==='missing-revision')patch={expectedRevision:undefined};if(mode==='stale')patch={expectedRevision:'2020-01-01T00:00:00Z'};
   const result=await f.decision('submit',f.assessmentId,patch);assert.equal(result.status,mode==='stale'?409:mode==='missing-revision'?400:422,mode+' '+JSON.stringify(result.body));
   assert.equal(f.row('third_party_assessments',f.assessmentId).status,'draft');assert.equal(f.row('third_party_profiles',f.vendorId,'vendor_id').status,'onboarding');assert.equal(f.count('workflow_evidence_pins'),0);
  }finally{f.sqlite.close()}
 }
});

test('commit-time changes to source, file, actor and policy cannot leave a partial decision or history',async()=>{
 for(const sql of ["UPDATE third_party_assessments SET treatment_plan='concurrent changed source'","UPDATE third_party_profiles SET reviewer='other@example.com'","UPDATE local_users SET status='Disabled' WHERE id='owner'","UPDATE local_users SET role='Viewer' WHERE id='owner'","INSERT INTO user_module_access VALUES('owner','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE evidence_versions SET file_name='changed.pdf'","UPDATE simple_evidence_files SET content=x'00'"]){
  const f=await setup();try{f.setActor(actor('owner','Editor'));f.before(()=>f.sqlite.exec(sql));assert.equal((await f.decision('submit')).status,409,sql);assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.row('third_party_assessments',f.assessmentId).status,'draft');assert.equal(f.row('third_party_profiles',f.vendorId,'vendor_id').status,'onboarding');assert.equal(f.count('third_party_events'),1)}finally{f.sqlite.close()}
 }
});

test('event and pin write failures roll back both assessment and parent status',async()=>{
 for(const table of ['third_party_events','workflow_evidence_pins']){const f=await setup();try{f.sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced failure'); END`);f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit')).status,400);assert.equal(f.row('third_party_assessments',f.assessmentId).status,'draft');assert.equal(f.row('third_party_profiles',f.vendorId,'vendor_id').status,'onboarding');assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.count('third_party_events'),1)}finally{f.sqlite.close()}}
});

test('reviewer independence, revoked directory accounts and current ownership remain enforced',async()=>{
 const f=await setup();try{
  f.setActor(actor('viewer','Viewer'));assert.equal((await f.decision('submit')).status,403);
  f.setActor(actor('maker'));assert.equal((await f.decision('submit')).status,200);assert.equal((await f.decision('approve')).status,409);
  assert.equal((await f.post({...f.vendor,name:'Other',reviewer:'maker@example.com'})).status,422);
  f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='lead'");assert.equal((await f.post({...f.vendor,name:'Other'})).status,422);
  assert.equal((await f.post({action:'add-finding',assignmentMode:'directory',assessmentId:f.assessmentId,title:'Owner cannot review',severity:'low',description:'Assign an independent remediation owner.',owner:'reviewer@example.com',dueDate:future(10)})).status,422);
  const id=await f.addFinding();f.setActor(actor('owner','Editor'));await f.decision('start',id);await f.decision('submit-finding',id);
  f.sqlite.prepare('UPDATE third_party_findings SET owner=? WHERE id=?').run('reviewer@example.com',id);f.setActor(actor('reviewer'));assert.equal((await f.decision('verify-finding',id)).status,409);
 }finally{f.sqlite.close()}
});

test('directory assignment changes during intake roll back all profile and assessment writes',async()=>{
 const f=await setup();try{f.before(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='lead'"));assert.equal((await f.post({...f.vendor,name:'A distinct supplier'})).status,409);assert.equal(f.count('third_party_profiles'),1);assert.equal(f.count('third_party_assessments'),1);assert.equal(f.count('third_party_events'),1)}finally{f.sqlite.close()}
});

test('old explicitly selected versions remain pinned after a newer upload and repeated decisions do not duplicate pins',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit')).status,200);const before=f.sqlite.prepare('SELECT snapshot_json FROM workflow_evidence_pins').get()!.snapshot_json;
  await appendEvidenceVersion(f.db,{evidenceId:f.evidenceId,fileKey:f.key,fileName:'supplier-v2.pdf',fileType:'application/pdf',fileSize:f.bytes.length,contentSha256:f.hash,evidenceTitle:'New supplier report',owner:'owner@example.com',period:'2027-Q1',frameworks:'ISO 27001',controlRefs:'A.5.19',changeNote:'Next period',createdBy:'maker@example.com',createdAt:new Date().toISOString()},{additionalStatements:c=>[f.db.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').bind(JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),f.evidenceId)]});
  f.setActor(actor('reviewer'));assert.equal((await f.decision('approve')).status,200);assert.equal((await f.decision('approve')).status,409);assert.equal(f.count('workflow_evidence_pins'),2);assert.ok(f.sqlite.prepare('SELECT snapshot_json FROM workflow_evidence_pins').all().every(p=>p.snapshot_json===before));
 }finally{f.sqlite.close()}
});
