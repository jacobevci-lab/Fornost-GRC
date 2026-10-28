import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
import {appendEvidenceVersion,sha256HexBytes} from '../app/evidence/versioning';
import {ensureCoreGrcSchemaCompatibility} from '../app/api/grc/schema-compat';
import {ensureWorkflowEvidenceSchema} from '../app/workflow-selection-store';
import {findingDecisionPhrases,findingEvidenceOperations} from '../app/findings/decisions';
import {readFindingDecisionPins} from '../app/findings/decision-store';
import {readFindingHistory} from '../app/findings/history';
import type {Actor} from '../app/api/auth/security';
const actor=(id:string,role:'Admin'|'Editor'|'Viewer'='Admin'):Actor=>({id,email:id+'@example.com',name:id,role,source:'local'});
const date=(days=0)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
async function setup(){
 const f=fixture('findings',true);await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);await ensureWorkflowEvidenceSchema(f.db);
 f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
 for(const [id,role] of [['maker','Admin'],['reviewer','Admin'],['owner','Editor'],['viewer','Viewer']])f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
 const bytes=new TextEncoder().encode('%PDF-1.4\nIndependent CAPA verification'),hash=await sha256HexBytes(bytes),evidenceId='EVD-capa',key=`evidence/${evidenceId}/capa.pdf`,stamp=new Date().toISOString();
 const evidence={evidenceId,fileKey:key,fileName:'capa.pdf',fileType:'application/pdf',fileSize:bytes.length,contentSha256:hash,evidenceTitle:'CAPA review report',owner:'owner@example.com',period:'2026-Q4',frameworks:'ISO 27001',controlRefs:'A.5.1',changeNote:'Original report',createdBy:'maker@example.com',createdAt:stamp};
 const version=await appendEvidenceVersion(f.db,evidence,{additionalStatements:c=>[f.db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(evidenceId,'Kanıtlar',JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),stamp,stamp)]});
 f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'capa.pdf','application/pdf',bytes,stamp);
 f.sqlite.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('RSK-capa','Risk Assessment','{}',stamp,stamp);
 const create={action:'create',assignmentMode:'directory',sourceType:'manual',sourceRef:'QA-CAPA',sourceTitle:'Controlled access review',findingType:'nonconformity',title:'Review privileged access exceptions',description:'An independent review found incomplete privilege reassessment records.',severity:'high',owner:'owner@example.com',reviewer:'reviewer@example.com',rootCause:'Ownership changed without complete transfer.',correctiveAction:'Reassess privileged access and retain the independent review record.',preventiveAction:'Perform monthly owner-led review with separate reviewer sign-off.',dueDate:date(10),riskRef:'RSK-capa',controlRef:''};
 f.setActor(actor('maker'));const created=await f.post(create);assert.equal(created.status,201,JSON.stringify(created.body));const id=String(created.body.id);
 const choice={evidenceMode:'library',evidenceSelection:{evidenceId,versionId:version.id}};
 const context=async()=>(await f.get('view=decision&findingId='+id)).body;
 const decision=async(operation:string,patch:Record<string,unknown>={})=>{const c=await context();return f.post({action:'transition',findingId:id,operation,note:'The corrective action and selected evidence have been independently assessed.',confirmation:findingDecisionPhrases[operation],decisionMode:'reviewed',expectedRevision:c.revision,...(findingEvidenceOperations.includes(operation)?choice:{}),...(operation==='accept-risk'?{acceptUntil:date(30),acceptanceRationale:'Temporary residual risk is accepted with monthly independent monitoring.'}:{}),...patch});};
 const start=async()=>{f.setActor(actor('owner','Editor'));assert.equal((await decision('start')).status,200);};
 const row=()=>f.sqlite.prepare('SELECT * FROM enterprise_findings WHERE id=?').get(id)!;
 const count=(table:string)=>Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
 return {...f,id,create,evidence,version,bytes,key,hash,evidenceId,choice,context,decision,start,row,count};
}
test('CAPA retains separate acceptance, remediation and closure pins and exact event evidence after reopening and a new upload',async()=>{
 const f=await setup();try{
  await f.start();f.setActor(actor('reviewer'));assert.equal((await f.decision('accept-risk')).status,200);assert.equal((await f.decision('reopen')).status,200);
  await appendEvidenceVersion(f.db,{...f.evidence,fileName:'new-period.pdf',changeNote:'New review period',period:'2027-Q1'},{additionalStatements:c=>[f.db.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').bind(JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),f.evidenceId)]});
  f.setActor(actor('owner','Editor'));assert.equal((await f.decision('submit')).status,200);f.setActor(actor('reviewer'));assert.equal((await f.decision('verify')).status,200);
  const events=await readFindingHistory(f.db,f.id,null,null),pins=await readFindingDecisionPins(f.db,f.id,events.events.map(e=>e.id));
  assert.deepEqual(pins.map(p=>p.purpose).sort(),['capa-accept-risk','capa-submit','capa-verify']);assert.ok(pins.every(p=>p.evidence.id===f.version.id&&events.events.some(e=>e.id===p.eventId)));assert.equal(f.row().status,'closed');assert.equal(f.row().recurrence_count,1);
  assert.equal((await f.decision('verify')).status,403);assert.equal(f.count('workflow_evidence_pins'),3);
  assert.deepEqual(await readFindingDecisionPins(f.db,'other',events.events.map(e=>e.id)),[]);
  const first=pins[0];assert.equal((await readFindingDecisionPins(f.db,f.id,[first.eventId])).length,1);
  assert.throws(()=>f.sqlite.exec("UPDATE workflow_evidence_pins SET purpose='changed'"),/immutable/);
 }finally{f.sqlite.close();}
});
test('the reviewed CAPA plan rejects content changes even without a timestamp change',async()=>{
 const f=await setup();try{await f.start();const before=await f.context();f.sqlite.exec("UPDATE enterprise_findings SET corrective_action='A different action was proposed without updating the timestamp'");assert.equal((await f.decision('submit',{expectedRevision:before.revision})).status,409);assert.equal(f.row().status,'in-progress');assert.equal(f.count('workflow_evidence_pins'),0);}finally{f.sqlite.close();}
});
test('source, live identity, access and evidence races cannot partially submit CAPA',async()=>{
 for(const sql of ["UPDATE enterprise_findings SET root_cause='Concurrent root cause correction'","UPDATE enterprise_findings SET reviewer='maker@example.com'","UPDATE local_users SET status='Disabled' WHERE id='owner'","UPDATE local_users SET role='Viewer' WHERE id='owner'","INSERT INTO user_module_access VALUES('owner','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE evidence_versions SET file_name='changed.pdf'","UPDATE simple_evidence_files SET content=x'00'"]){
  const f=await setup();try{await f.start();const events=f.count('enterprise_finding_events');f.before(()=>f.sqlite.exec(sql));assert.equal((await f.decision('submit')).status,409,sql);assert.equal(f.row().status,'in-progress');assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.count('enterprise_finding_events'),events);}finally{f.sqlite.close();}
 }
});
test('invalid or unreviewed evidence cannot advance a finding',async()=>{
 for(const kind of ['missing','mismatch','bytes','chain','anchor','missing-revision','missing-mode']){
  const f=await setup();try{await f.start();let patch:Record<string,unknown>={};
   if(kind==='missing')f.sqlite.exec('DELETE FROM simple_evidence_files');if(kind==='mismatch')patch={evidenceSelection:{evidenceId:'EVD-other',versionId:f.version.id}};
   if(kind==='bytes')f.sqlite.prepare('UPDATE simple_evidence_files SET content=?').run(new TextEncoder().encode('changed'));
   if(kind==='chain')f.sqlite.exec("UPDATE evidence_versions SET period='changed'");if(kind==='anchor')f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run('{}',f.evidenceId);
   if(kind==='missing-revision')patch={expectedRevision:undefined};if(kind==='missing-mode')patch={decisionMode:undefined};
   assert.equal((await f.decision('submit',patch)).status,kind.startsWith('missing-')?400:422,kind);assert.equal(f.row().status,'in-progress');assert.equal(f.count('workflow_evidence_pins'),0);
  }finally{f.sqlite.close();}
 }
});
test('event and evidence-pin failures roll back the decision and report revision',async()=>{
 for(const table of ['enterprise_finding_events','workflow_evidence_pins']){const f=await setup();try{
  await f.start();const events=f.count('enterprise_finding_events'),revision=f.sqlite.prepare('SELECT revision FROM finding_report_revision').get()!.revision;
  f.sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced write failure'); END`);
  assert.equal((await f.decision('submit')).status,400);assert.equal(f.row().status,'in-progress');assert.equal(f.count('enterprise_finding_events'),events);assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.sqlite.prepare('SELECT revision FROM finding_report_revision').get()!.revision,revision);
  f.sqlite.exec('DROP TRIGGER fail_write');assert.equal((await f.decision('submit')).status,200);assert.equal(f.count('workflow_evidence_pins'),1);
 }finally{f.sqlite.close();}}
});
test('directory intake excludes self-review and binds currently eligible assignees and actor',async()=>{
 const f=await setup();try{
  f.setActor(actor('maker'));assert.equal((await f.post({...f.create,reviewer:'maker@example.com'})).status,422);assert.equal((await f.post({...f.create,reviewer:'owner@example.com'})).status,422);
  f.before(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='owner'"));assert.equal((await f.post(f.create)).status,409);assert.equal(f.count('enterprise_findings'),1);assert.equal(f.count('enterprise_finding_events'),1);assert.equal((await f.post(f.create)).status,422);
 }finally{f.sqlite.close();}
});
test('independent decision boundaries, acceptance dates and legacy unpinned callers remain authoritative',async()=>{
 const f=await setup();try{
  await f.start();f.setActor(actor('maker'));assert.equal((await f.decision('accept-risk')).status,403);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('accept-risk',{acceptUntil:date(181)})).status,400);
  f.setActor(actor('owner','Editor'));const legacy={decisionMode:undefined,expectedRevision:undefined,evidenceMode:undefined,evidenceSelection:undefined,evidenceReference:'legacy-review',evidenceSha256:'a'.repeat(64)};assert.equal((await f.decision('submit',legacy)).status,200);assert.equal(f.count('workflow_evidence_pins'),0);
  f.setActor(actor('maker'));assert.equal((await f.decision('verify')).status,403);f.setActor(actor('viewer','Viewer'));assert.equal((await f.decision('verify')).status,403);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('verify',legacy)).status,200);assert.equal(f.count('workflow_evidence_pins'),0);
  assert.equal((await f.get('view=decision&findingId=missing')).status,404);assert.equal((await f.get('view=decision&findingId=../bad')).status,400);
  assert.deepEqual(await readFindingDecisionPins(f.db,f.id,(await readFindingHistory(f.db,f.id,null,null)).events.map(e=>e.id)),[]);
 }finally{f.sqlite.close();}
});
