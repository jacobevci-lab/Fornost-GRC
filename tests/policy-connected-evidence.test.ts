import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
import {appendEvidenceVersion,sha256HexBytes} from '../app/evidence/versioning';
import {ensureCoreGrcSchemaCompatibility} from '../app/api/grc/schema-compat';
import {ensureWorkflowEvidenceSchema} from '../app/workflow-selection-store';
import {policyDecisionPhrases,policyEvidenceOperations} from '../app/policy-lifecycle/decisions';
import type {Actor} from '../app/api/auth/security';
const actor=(id:string,role:'Admin'|'Editor'|'Viewer'='Admin'):Actor=>({id,email:id+'@example.com',name:id,role,source:'local'});
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
async function setup(){
 const f=fixture('policy-lifecycle');await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);await ensureWorkflowEvidenceSchema(f.db);
 f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
 for(const [id,role] of [['maker','Admin'],['reviewer','Admin'],['owner','Editor'],['viewer','Viewer']])f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
 const bytes=new TextEncoder().encode('%PDF-1.4\nPolicy assurance report'),hash=await sha256HexBytes(bytes),evidenceId='EVD-policy',key=`evidence/${evidenceId}/policy.pdf`,stamp=new Date().toISOString();
 const version=await appendEvidenceVersion(f.db,{evidenceId,fileKey:key,fileName:'policy.pdf',fileType:'application/pdf',fileSize:bytes.length,contentSha256:hash,evidenceTitle:'Policy review report',owner:'owner@example.com',period:'2026-Q4',frameworks:'ISO 27001',controlRefs:'A.5.1',changeNote:'Initial report',createdBy:'maker@example.com',createdAt:stamp},{additionalStatements:c=>[f.db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(evidenceId,'Kanıtlar',JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),stamp,stamp)]});
 f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'policy.pdf','application/pdf',bytes,stamp);
 const policy={action:'save-policy',assignmentMode:'directory',code:'POL-CONNECTED',title:'Connected policy review',category:'security',classification:'internal',owner:'owner@example.com',reviewer:'reviewer@example.com',audience:'All employees',reviewFrequencyDays:365};
 f.setActor(actor('maker'));let result=await f.post(policy);assert.equal(result.status,200,JSON.stringify(result.body));const policyId=String(result.body.id);
 result=await f.post({action:'create-version',policyId,summary:'Update the policy and the assigned review workflow.',content:'This policy defines mandatory responsibilities, independent approval and accountable records of changes. Everyone must follow the approved process.',effectiveDate:future(0),regulationRefs:['ISO-27001']});assert.equal(result.status,200,JSON.stringify(result.body));const policyVersionId=String(result.body.id);
 const choice={evidenceMode:'library',evidenceSelection:{evidenceId,versionId:version.id}};
 const context=async(kind:string,id:string)=>(await f.get('view=decision&'+new URLSearchParams({kind,id}))).body;
 const decision=async(operation:string,id=policyVersionId,patch:Record<string,unknown>={})=>{const kind=operation==='retire'?'retire':operation.includes('exception')?'exception':'version';const source=await context(kind,id);return f.post({action:kind==='retire'?'retire-policy':kind+'-action',[kind==='retire'?'policyId':kind==='exception'?'exceptionId':'versionId']:id,operation,note:'The actual policy and its supporting evidence have been reviewed.',confirmation:policyDecisionPhrases[operation],decisionMode:'reviewed',expectedRevision:source.revision,...(policyEvidenceOperations.includes(operation)?choice:{}),...patch})};
 const publish=async()=>{f.setActor(actor('owner','Editor'));assert.equal((await decision('submit')).status,200);f.setActor(actor('reviewer'));assert.equal((await decision('approve')).status,200);assert.equal((await decision('publish')).status,200)};
 const exception=async()=>{f.setActor(actor('maker'));const result=await f.post({action:'create-exception',assignmentMode:'directory',policyId,versionId:policyVersionId,scope:'Temporary migration scope',rationale:'Migration requires a controlled temporary policy exception.',compensatingControl:'Daily independent access monitoring and escalation.',owner:'owner@example.com',reviewer:'reviewer@example.com',expiresAt:future(30)});assert.equal(result.status,200,JSON.stringify(result.body));return String(result.body.id)};
 const row=(table:string,id:string)=>f.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)!;
 const count=(table:string)=>Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
 return {...f,policy,policyId,policyVersionId,evidenceId,key,bytes,hash,version,choice,context,decision,publish,exception,row,count};
}
test('policy review, publication, exception and retirement retain six canonical decision purposes atomically',async()=>{
 const f=await setup();try{
  await f.publish();const id=await f.exception();f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit-exception',id)).status,200);f.setActor(actor('reviewer'));assert.equal((await f.decision('approve-exception',id)).status,200);
  assert.equal((await f.decision('retire',f.policyId)).status,409,'An active exception still blocks retirement');
  assert.equal((await f.decision('close-exception',id)).status,200);assert.equal((await f.decision('retire',f.policyId)).status,200);
  const pins=f.sqlite.prepare('SELECT p.*,e.id event FROM workflow_evidence_pins p LEFT JOIN policy_events e ON e.id=p.event_id').all();
  assert.equal(pins.length,6);assert.deepEqual(pins.map(p=>p.purpose).sort(),['version-submit','version-approve','version-publish','approve-exception','close-exception','policy-retire'].sort());assert.ok(pins.every(p=>p.event&&p.workflow==='policy'&&JSON.parse(String(p.snapshot_json)).id===f.version.id));
  assert.equal(f.row('policy_documents',f.policyId).status,'retired');assert.equal(f.row('policy_versions',f.policyVersionId).status,'superseded');assert.equal(f.row('policy_exceptions',id).status,'closed');
  const response=await f.get();assert.equal((response.body.evidencePins as unknown[]).length,6);assert.equal(response.body.evidencePinsLimited,false);
  assert.equal((await f.decision('retire',f.policyId)).status,403);assert.equal(f.count('workflow_evidence_pins'),6);
 }finally{f.sqlite.close()}
});
test('reviewed decisions freeze parent metadata, policy content and exception context, not only the row timestamp',async()=>{
 const f=await setup();try{
  const prior=await f.context('version',f.policyVersionId);f.sqlite.exec("UPDATE policy_documents SET title='Changed without timestamp'");f.setActor(actor('owner','Editor'));
  assert.equal((await f.decision('submit',f.policyVersionId,{expectedRevision:prior.revision})).status,409);assert.equal(f.count('workflow_evidence_pins'),0);
  await f.publish();const id=await f.exception();f.setActor(actor('owner','Editor'));await f.decision('submit-exception',id);const old=await f.context('exception',id);f.sqlite.exec("UPDATE policy_versions SET content='Concurrent changed content'");f.setActor(actor('reviewer'));
  assert.equal((await f.decision('approve-exception',id,{expectedRevision:old.revision})).status,409);assert.equal(f.row('policy_exceptions',id).status,'submitted');
 }finally{f.sqlite.close()}
});
test('missing, mismatched, tampered and unreviewed library selections cannot advance a policy',async()=>{
 for(const mode of ['missing','mismatch','bytes','chain','anchor','missing-revision','missing-mode']){
  const f=await setup();try{f.setActor(actor('owner','Editor'));let patch:Record<string,unknown>={};
   if(mode==='missing')f.sqlite.exec('DELETE FROM simple_evidence_files');if(mode==='mismatch')patch={evidenceSelection:{evidenceId:'EVD-other',versionId:f.version.id}};
   if(mode==='bytes')f.sqlite.prepare('UPDATE simple_evidence_files SET content=?').run(new TextEncoder().encode('changed'));
   if(mode==='chain')f.sqlite.exec("UPDATE evidence_versions SET period='changed'");if(mode==='anchor')f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run('{}',f.evidenceId);
   if(mode==='missing-revision')patch={expectedRevision:undefined};if(mode==='missing-mode')patch={decisionMode:undefined};
   assert.equal((await f.decision('submit',f.policyVersionId,patch)).status,mode.startsWith('missing-')?400:422,mode);assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.row('policy_versions',f.policyVersionId).status,'draft');
  }finally{f.sqlite.close()}
 }
});
test('source, parent, file and live actor races reject the entire transaction',async()=>{
 for(const sql of ["UPDATE policy_versions SET content='Concurrent content'","UPDATE policy_documents SET audience='Changed audience'","UPDATE local_users SET status='Disabled' WHERE id='owner'","UPDATE local_users SET role='Viewer' WHERE id='owner'","INSERT INTO user_module_access VALUES('owner','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE evidence_versions SET file_name='changed.pdf'","UPDATE simple_evidence_files SET content=x'00'"]){
  const f=await setup();try{f.setActor(actor('owner','Editor'));f.before(()=>f.sqlite.exec(sql));const result=await f.decision('submit');assert.equal(result.status,409,sql+JSON.stringify(result.body));assert.equal(f.row('policy_versions',f.policyVersionId).status,'draft');assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.count('policy_events'),2)}finally{f.sqlite.close()}
 }
});
test('event and pin failures roll back publication, prior-version changes and exception decisions',async()=>{
 for(const table of ['policy_events','workflow_evidence_pins']){const f=await setup();try{
  f.setActor(actor('owner','Editor'));await f.decision('submit');f.setActor(actor('reviewer'));await f.decision('approve');const events=f.count('policy_events');
  f.sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced failure'); END`);
  assert.equal((await f.decision('publish')).status,400);assert.equal(f.row('policy_versions',f.policyVersionId).status,'approved');assert.equal(f.row('policy_documents',f.policyId).status,'draft');assert.equal(f.count('workflow_evidence_pins'),2);assert.equal(f.count('policy_events'),events);
 }finally{f.sqlite.close()}}
});
test('directory assignments preserve independent reviewers and current account eligibility, including metadata edits by that reviewer',async()=>{
 const f=await setup();try{
  f.setActor(actor('reviewer'));assert.equal((await f.post({...f.policy,policyId:f.policyId,title:'Reviewed metadata updated'})).status,200,'Assigned reviewer can maintain existing metadata without assigning themselves as a new creator');
  f.setActor(actor('maker'));assert.equal((await f.post({...f.policy,code:'POL-OTHER',reviewer:'maker@example.com'})).status,422);assert.equal((await f.post({...f.policy,code:'POL-OTHER',reviewer:'owner@example.com'})).status,422);
  f.before(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='owner'"));assert.equal((await f.post({...f.policy,code:'POL-OTHER'})).status,409);assert.equal(f.count('policy_documents'),1);
  assert.equal((await f.post({...f.policy,code:'POL-OTHER'})).status,422);
  f.setActor(actor('viewer','Viewer'));assert.equal((await f.decision('submit')).status,403);
  f.setActor(actor('maker'));assert.equal((await f.decision('submit')).status,200);assert.equal((await f.decision('approve')).status,403);f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='reviewer'");f.setActor(actor('reviewer'));assert.equal((await f.decision('reject')).status,403);
 }finally{f.sqlite.close()}
});
test('legacy decisions remain compatible and older explicitly chosen versions retain their identity after a new upload',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit',f.policyVersionId,{decisionMode:undefined,expectedRevision:undefined,evidenceMode:undefined,evidenceSelection:undefined,evidenceReference:'legacy-file',evidenceSha256:'a'.repeat(64)})).status,200);assert.equal(f.count('workflow_evidence_pins'),0);
  await appendEvidenceVersion(f.db,{evidenceId:f.evidenceId,fileKey:f.key,fileName:'new.pdf',fileType:'application/pdf',fileSize:f.bytes.length,contentSha256:f.hash,evidenceTitle:'New period report',owner:'owner@example.com',period:'2027-Q1',frameworks:'ISO 27001',controlRefs:'A.5.1',changeNote:'New report',createdBy:'maker@example.com',createdAt:new Date().toISOString()},{additionalStatements:c=>[f.db.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').bind(JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),f.evidenceId)]});
  f.setActor(actor('reviewer'));assert.equal((await f.decision('approve')).status,200);assert.equal((await f.decision('approve')).status,403);assert.equal(f.count('workflow_evidence_pins'),1);assert.equal(JSON.parse(String(f.sqlite.prepare('SELECT snapshot_json FROM workflow_evidence_pins').get()!.snapshot_json)).id,f.version.id);
 }finally{f.sqlite.close()}
});
test('exact policy navigation prioritizes the linked version and rejects malformed or missing targets',async()=>{
 const f=await setup();try{
  const original=f.row('policy_versions',f.policyVersionId),columns=Object.keys(original);const insert=f.sqlite.prepare(`INSERT INTO policy_versions(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
  for(let i=0;i<3001;i++){const row={...original,id:'PV-later-'+i,version_number:i+2,updated_at:'2099-01-01T00:00:00.000Z'};insert.run(...columns.map(k=>row[k as keyof typeof row]));}
  assert.ok(!(await f.get()).body.versions||!( (await f.get()).body.versions as {id:string}[]).some(v=>v.id===f.policyVersionId));
  const focused=await f.get('focusKind=policy-version&focusId='+f.policyVersionId);assert.equal(focused.status,200);assert.equal((focused.body.versions as {id:string}[])[0].id,f.policyVersionId);assert.equal((focused.body.documents as {id:string}[])[0].id,f.policyId);
  assert.equal((await f.get('focusKind=policy-version&focusId=../x')).status,400);assert.equal((await f.get('view=decision&kind=version&id=PV-missing')).status,404);
 }finally{f.sqlite.close()}
});
