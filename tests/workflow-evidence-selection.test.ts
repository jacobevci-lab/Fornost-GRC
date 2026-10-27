import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './helpers/enterprise-route-fixture';
import {appendEvidenceVersion,sha256HexBytes} from '../app/evidence/versioning';
import {ensureCoreGrcSchemaCompatibility} from '../app/api/grc/schema-compat';
import {ensureWorkflowEvidenceSchema,prepareWorkflowSelection,workflowPeople,workflowEvidenceChoices} from '../app/workflow-selection-store';
import {scopedApiAllowed} from '../app/module-access';
import {deleteCoreRecord,CoreRecordLinked} from '../app/core-record-delete';
import type {Actor} from '../app/api/auth/security';

const stamp='2026-10-01T00:00:00.000Z',actor:Actor={id:'reviewer',email:'reviewer@example.com',name:'Reviewer',role:'Admin',source:'local'};
function seed(db:DatabaseSync,table:string,values:Record<string,string|number|null>) {
  const row:Record<string,string|number|null>={};for(const c of db.prepare(`PRAGMA table_info(${table})`).all())if(c.notnull&&!c.dflt_value)row[String(c.name)]=String(c.type)==='INTEGER'?1:'fixture';
  Object.assign(row,values);db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
}
const count=(db:DatabaseSync,table:string)=>Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
async function setup(module:'continuity'|'regulatory-intelligence'='continuity') {
  const f=fixture(module);await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);await ensureWorkflowEvidenceSchema(f.db);
  f.sqlite.exec(`CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);`);
  for(const [id,role] of [['reviewer','Admin'],['maker','Admin'],['owner','Editor'],['lead','Editor']])f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
  const bytes=new TextEncoder().encode('%PDF-1.4\nQA version one'),hash=await sha256HexBytes(bytes),evidenceId='EVD-canonical',key=`evidence/${evidenceId}/v1-qa.pdf`;
  const version=await appendEvidenceVersion(f.db,{evidenceId,fileKey:key,fileName:'qa.pdf',fileType:'application/pdf',fileSize:bytes.length,contentSha256:hash,evidenceTitle:'Recovery evidence',owner:'owner@example.com',period:'2026-Q4',frameworks:'ISO 22301',controlRefs:'A.5.30',changeNote:'Initial upload',createdBy:'maker@example.com',createdAt:stamp},{additionalStatements:commit=>[f.db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(evidenceId,'Kanıtlar',JSON.stringify({evidenceTitle:'Recovery evidence',versionNo:commit.versionNo,versionChainSha256:commit.chainSha256}),stamp,stamp)]});
  f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'qa.pdf','application/pdf',bytes,stamp);
  const choice={evidenceMode:'library',evidenceSelection:{evidenceId,versionId:version.id}};
  if(module==='continuity') {
    seed(f.sqlite,'enterprise_continuity_plans',{id:'BCP-1',code:'BCP-1',name:'Recovery',status:'active',owner:'owner@example.com',reviewer:actor.email,crisis_lead:'lead@example.com',rto_hours:4,rpo_hours:1,criticality:'high',updated_at:stamp});
    seed(f.sqlite,'enterprise_continuity_exercises',{id:'BCE-1',code:'BCE-1',plan_id:'BCP-1',type:'technical',scheduled_date:'2026-10-01',facilitator:'owner@example.com',status:'planned',created_at:stamp});
  } else {
    seed(f.sqlite,'regulatory_changes',{id:'RC-1',source_id:'SRC-1',status:'implementation',reviewer:actor.email,detected_by:'maker@example.com',effective_date:'2027-01-01',updated_at:stamp});
    seed(f.sqlite,'regulatory_change_impacts',{id:'RI-1',change_id:'RC-1',target_type:'control',target_ref:'A.5.18',status:'verification',action_owner:'owner@example.com',created_by:'maker@example.com',submitted_by:'maker@example.com',updated_at:stamp});
  }
  return {...f,choice,version,hash,bytes,key};
}
const result={action:'complete-exercise',exerciseId:'BCE-1',outcome:'passed',actualRecoveryHours:2,actualDataLossHours:0,observations:'Recovery targets were met with the recorded evidence.'};
const verify={action:'impact-action',impactId:'RI-1',operation:'verify',confirmation:'ETKİYİ DOĞRULA',note:'Independent control operating evidence was reviewed.'};
test('canonical evidence overrides client digest, pins the chosen version, and duplicate decisions add no event or pin',async()=>{
  const f=await setup();try {
    const response=await f.post({...result,...f.choice,evidenceReference:'untrusted',evidenceSha256:'b'.repeat(64)});assert.equal(response.status,200,JSON.stringify(response.body));
    const exercise=f.sqlite.prepare('SELECT * FROM enterprise_continuity_exercises').get()!;assert.equal(exercise.evidence_reference,'EVD-canonical');assert.equal(exercise.evidence_sha256,f.hash);
    const pin=f.sqlite.prepare('SELECT * FROM workflow_evidence_pins').get()!,snapshot=JSON.parse(String(pin.snapshot_json));assert.equal(snapshot.id,f.version.id);assert.equal(snapshot.period,'2026-Q4');assert.equal(snapshot.fileName,'qa.pdf');assert.equal(snapshot.versionNo,1);
    assert.equal(f.sqlite.prepare('SELECT id FROM enterprise_continuity_events').get()!.id,pin.event_id);
    const record=f.sqlite.prepare('SELECT * FROM simple_grc_records WHERE id=?').get('EVD-canonical')!;
    await assert.rejects(deleteCoreRecord(f.db,'EVD-canonical',{module:'Kanıtlar',data_json:String(record.data_json),updated_at:String(record.updated_at)},String(record.updated_at)),CoreRecordLinked);
    assert.equal((await f.post({...result,...f.choice})).status,409);assert.equal(count(f.sqlite,'workflow_evidence_pins'),1);assert.equal(count(f.sqlite,'enterprise_continuity_events'),1);
    assert.throws(()=>f.sqlite.exec("UPDATE workflow_evidence_pins SET purpose='changed'"),/immutable-workflow-evidence/);
    const newer=await appendEvidenceVersion(f.db,{evidenceId:'EVD-canonical',fileKey:f.key,fileName:'qa-v2.pdf',fileType:'application/pdf',fileSize:f.bytes.length,contentSha256:f.hash,evidenceTitle:'Changed title',owner:'owner@example.com',period:'2027-Q1',frameworks:'ISO 22301',controlRefs:'A.5.30',changeNote:'Next version',createdBy:'maker@example.com',createdAt:'2026-10-02T00:00:00.000Z'},{additionalStatements:c=>[f.db.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').bind(JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),'EVD-canonical')]});
    assert.equal(newer.versionNo,2);assert.equal(f.sqlite.prepare('SELECT snapshot_json FROM workflow_evidence_pins').get()!.snapshot_json,pin.snapshot_json);
    const selected=await prepareWorkflowSelection({DB:f.db},actor,f.choice,{},true);assert.equal(selected.evidence?.versionNo,1,'An older explicitly chosen version is not silently replaced');
  }finally{f.sqlite.close()}
});
test('gap closure pins its decision evidence without replacing the independent successful retest evidence',async()=>{
  const f=await setup();try {
    seed(f.sqlite,'enterprise_continuity_gaps',{id:'BCG-1',exercise_id:'BCE-failed',plan_id:'BCP-1',severity:'high',title:'Recovery gap',owner:'owner@example.com',reviewer:actor.email,due_date:'2026-11-01',status:'open',created_at:'2026-09-30T00:00:00.000Z'});
    f.sqlite.exec("UPDATE enterprise_continuity_exercises SET status='completed',outcome='passed',actual_recovery_hours=2,actual_data_loss_hours=0,completed_by='owner@example.com',completed_at='2026-10-02T00:00:00.000Z',evidence_reference='Legacy-retest',evidence_sha256='"+'a'.repeat(64)+"'");
    const response=await f.post({action:'close-gap',gapId:'BCG-1',retestExerciseId:'BCE-1',confirmation:'AÇIĞI KAPAT',note:'Independent retest and closure evidence reviewed.',...f.choice});assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_continuity_gaps').get()!.status,'closed');assert.equal(f.sqlite.prepare('SELECT evidence_reference FROM enterprise_continuity_gap_verifications').get()!.evidence_reference,'Legacy-retest');assert.equal(f.sqlite.prepare('SELECT purpose FROM workflow_evidence_pins').get()!.purpose,'gap-closure');
  }finally{f.sqlite.close()}
});
test('deleted, mismatched, tampered, missing and malformed evidence leaves the exercise untouched',async()=>{
  for(const mode of ['deleted','mismatch','bytes','chain','anchor','missing-file','missing-selection','unknown-mode']) {
    const f=await setup();try {
      const choice=structuredClone(f.choice);
      if(mode==='deleted')f.sqlite.exec('DELETE FROM simple_grc_records');
      if(mode==='mismatch')choice.evidenceSelection.evidenceId='EVD-other';
      if(mode==='bytes')f.sqlite.prepare('UPDATE simple_evidence_files SET content=?').run(new TextEncoder().encode('tampered'));
      if(mode==='chain')f.sqlite.exec("UPDATE evidence_versions SET period='forged'");
      if(mode==='anchor')f.sqlite.exec("UPDATE simple_grc_records SET data_json='{}'");
      if(mode==='missing-file')f.sqlite.exec('DELETE FROM simple_evidence_files');
      if(mode==='missing-selection')choice.evidenceSelection.versionId='';
      if(mode==='unknown-mode')choice.evidenceMode='unknown';
      assert.equal((await f.post({...result,...choice})).status,422,mode);assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_continuity_exercises').get()!.status,'planned');assert.equal(count(f.sqlite,'enterprise_continuity_events'),0);assert.equal(count(f.sqlite,'workflow_evidence_pins'),0);
    }finally{f.sqlite.close()}
  }
});
test('claim rechecks evidence, bytes and actor permission changes after lookup, with no partial events or pins',async()=>{
  for(const mutation of ["DELETE FROM simple_grc_records","UPDATE evidence_versions SET file_name='changed.pdf'","UPDATE local_users SET status='Disabled' WHERE id='reviewer'","UPDATE local_users SET role='Viewer' WHERE id='reviewer'","DELETE FROM simple_evidence_files"]) {
    const f=await setup();try {
      // Warm only compatibility metadata, then race the actual lifecycle transaction.
      await prepareWorkflowSelection({DB:f.db},actor,f.choice,{},true);f.before(()=>f.sqlite.exec(mutation));
      assert.equal((await f.post({...result,...f.choice})).status,409,mutation);assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_continuity_exercises').get()!.status,'planned');assert.equal(count(f.sqlite,'enterprise_continuity_events'),0);assert.equal(count(f.sqlite,'workflow_evidence_pins'),0);
    }finally{f.sqlite.close()}
  }
});
test('pin insertion failure rolls back exercise, automatically opened gap and history together',async()=>{
  const f=await setup();try {
    f.sqlite.exec("CREATE TRIGGER fail_pin BEFORE INSERT ON workflow_evidence_pins BEGIN SELECT RAISE(ABORT,'injected pin failure'); END");
    const r=await f.post({...result,...f.choice,outcome:'partial',actualRecoveryHours:6,rootCause:'Recovery automation was incomplete.'});assert.equal(r.status,400);assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_continuity_exercises').get()!.status,'planned');assert.equal(count(f.sqlite,'enterprise_continuity_gaps'),0);assert.equal(count(f.sqlite,'enterprise_continuity_events'),0);
  }finally{f.sqlite.close()}
});
test('regulatory verification pins server evidence atomically with impact, parent and event; independence still applies',async()=>{
  for(const mode of ['success','self','rollback']) {const f=await setup('regulatory-intelligence');try {
    if(mode==='self')f.sqlite.prepare('UPDATE regulatory_change_impacts SET submitted_by=?').run(actor.email);
    if(mode==='rollback')f.sqlite.exec("CREATE TRIGGER fail_pin BEFORE INSERT ON workflow_evidence_pins BEGIN SELECT RAISE(ABORT,'injected pin failure'); END");
    const response=await f.post({...verify,...f.choice});assert.equal(response.status,mode==='success'?200:mode==='self'?409:400,JSON.stringify(response.body));
    assert.equal(f.sqlite.prepare('SELECT status FROM regulatory_change_impacts').get()!.status,mode==='success'?'completed':'verification');assert.equal(f.sqlite.prepare('SELECT status FROM regulatory_changes').get()!.status,mode==='success'?'verification':'implementation');assert.equal(count(f.sqlite,'workflow_evidence_pins'),mode==='success'?1:0);assert.equal(count(f.sqlite,'regulatory_change_events'),mode==='success'?1:0);
  }finally{f.sqlite.close()}}
});
test('directory only offers active full writers, requires an independent Admin reviewer and guards assignment revocation',async()=>{
  const f=await setup();try {
    f.sqlite.exec(`UPDATE local_users SET status='Disabled' WHERE id='lead';INSERT INTO user_module_access VALUES('owner','{"mode":"scoped","modules":{}}')`);
    const listed=await workflowPeople(f.db,'',false);assert.deepEqual(listed.people.map(p=>p.id).sort(),['maker','reviewer']);
    const maker={...actor,id:'maker',email:'maker@example.com'};f.setActor(maker);
    await assert.rejects(()=>prepareWorkflowSelection({DB:f.db},maker,{assignmentMode:'directory',owner:'owner@example.com'},{owner:'writer'}),/Atanan kişi/);
    await assert.rejects(()=>prepareWorkflowSelection({DB:f.db},maker,{assignmentMode:'directory',reviewer:maker.email},{reviewer:'reviewer'}),/Atanan kişi/);
    f.sqlite.exec("DELETE FROM user_module_access;UPDATE local_users SET status='Active' WHERE id='lead'");
    f.before(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='owner'"));
    const response=await f.post({action:'create-plan',assignmentMode:'directory',name:'Recovery plan draft',process:'Payments',biaRef:'Legacy BIA reference',criticality:'high',owner:'owner@example.com',reviewer:actor.email,crisisLead:'lead@example.com',rtoHours:4,rpoHours:1,mtpdHours:24,dependencies:'Identity and database services',recoveryStrategy:'Restore the secondary region and validate data.',communicationPlan:'Notify crisis leaders and process owners.',minimumStaff:2,reviewDate:'2027-01-01'});
    assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(count(f.sqlite,'enterprise_continuity_plans'),1);assert.equal(count(f.sqlite,'enterprise_continuity_events'),0);
  }finally{f.sqlite.close()}
});
test('choice endpoints remain outside scoped access and only return canonical versioned evidence',async()=>{
  const f=await setup();try {
    for(const method of ['GET','POST'])assert.equal(scopedApiAllowed({role:'Editor',moduleAccess:{mode:'scoped',modules:{'Kanıtlar':'write'}}},'/api/workflow-choices',method),false);
    const choices=await workflowEvidenceChoices(f.db,'Recovery',0,'');assert.equal(choices.records?.length,1);assert.equal((await workflowEvidenceChoices(f.db,'no-match',0,'')).records?.length,0);
    const versions=await workflowEvidenceChoices(f.db,'',0,'EVD-canonical');assert.equal(versions.versions?.[0].id,f.version.id);
    f.sqlite.exec("UPDATE local_users SET role='Viewer' WHERE id='reviewer'");await assert.rejects(()=>prepareWorkflowSelection({DB:f.db},actor,f.choice,{},true),/tam erişimli/);
  }finally{f.sqlite.close()}
});
test('object storage evidence is byte-verified and oversized streams are rejected',async()=>{
  const f=await setup();try {
    for(const valid of [true,false]) {
      const bytes=valid?f.bytes:new Uint8Array(f.bytes.length+1);
      const env={DB:f.db,BUCKET:{get:async()=>({body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}})}),put:async()=>{}}};
      if(valid)assert.equal((await prepareWorkflowSelection(env,actor,f.choice,{},true)).evidence?.contentSha256,f.hash);
      else await assert.rejects(()=>prepareWorkflowSelection(env,actor,f.choice,{},true),/doğrulanamadı/);
    }
  }finally{f.sqlite.close()}
});
