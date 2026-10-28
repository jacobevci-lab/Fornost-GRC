import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
import {appendEvidenceVersion,sha256HexBytes} from '../app/evidence/versioning';
import {ensureCoreGrcSchemaCompatibility} from '../app/api/grc/schema-compat';
import {ensureWorkflowEvidenceSchema} from '../app/workflow-selection-store';
import {incidentDecisionPhrases,incidentEvidenceOperations,incidentDecisionDetail} from '../app/incidents/decisions';
import type {Actor} from '../app/api/auth/security';
const actor=(id:string,role:'Admin'|'Editor'|'Viewer'='Admin'):Actor=>({id,email:id+'@example.com',name:id,role,source:'local'});
const date=(days=0)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
async function setup(){
 const f=fixture('incidents',true);await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);await ensureWorkflowEvidenceSchema(f.db);
 f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
 for(const [id,role] of [['maker','Admin'],['reviewer','Admin'],['owner','Editor'],['commander','Editor'],['other','Editor'],['viewer','Viewer']])f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
 const bytes=new TextEncoder().encode('%PDF-1.4\nIndependent Incident verification'),hash=await sha256HexBytes(bytes),evidenceId='EVD-incident',key=`evidence/${evidenceId}/incident.pdf`,stamp=new Date().toISOString();
 const evidence={evidenceId,fileKey:key,fileName:'incident.pdf',fileType:'application/pdf',fileSize:bytes.length,contentSha256:hash,evidenceTitle:'Incident review report',owner:'owner@example.com',period:'2026-Q4',frameworks:'ISO 27001',controlRefs:'A.5.1',changeNote:'Original report',createdBy:'maker@example.com',createdAt:stamp};
 const version=await appendEvidenceVersion(f.db,evidence,{additionalStatements:c=>[f.db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(evidenceId,'Kanıtlar',JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),stamp,stamp)]});
 f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'incident.pdf','application/pdf',bytes,stamp);
 f.sqlite.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('AST-001','Varlık Envanteri','{}',stamp,stamp);
 const create={action:'create',assignmentMode:'directory',requestId:crypto.randomUUID(),title:'Controlled identity compromise',category:'account-compromise',severity:'high',detectedDate:date(),description:'Privileged identity activity requires a controlled incident response.',businessImpact:'The affected service requires independent recovery validation.',owner:'owner@example.com',commander:'commander@example.com',reviewer:'reviewer@example.com',assetRefs:'AST-001',riskRef:'',biaRef:'',dataClassification:'Restricted',personalData:true};
 f.setActor(actor('maker'));const created=await f.post(create);assert.equal(created.status,201,JSON.stringify(created.body));const id=String(created.body.id);
 const choice={evidenceMode:'library',evidenceSelection:{evidenceId,versionId:version.id}};
 const context=async()=>(await f.get('view=decision&incidentId='+id)).body;
 const decision=async(operation:string,patch:Record<string,unknown>={})=>{const c=await context();return f.post({action:'transition',incidentId:id,operation,note:'The corrective action and selected evidence have been independently assessed.',confirmation:incidentDecisionPhrases[operation],decisionMode:'reviewed',expectedRevision:c.revision,...(incidentEvidenceOperations.includes(operation)?choice:{}),rootCause:'The compromised credential did not use phishing-resistant authentication.',lessonsLearned:'Use phishing-resistant authentication and independent recovery verification.',notificationDecision:'required',notificationRationale:'The authorized response team reviewed the affected information and its obligations.',...patch});};
 const start=async()=>{f.setActor(actor('owner','Editor'));assert.equal((await decision('triage')).status,200);};
 const row=()=>f.sqlite.prepare('SELECT * FROM enterprise_incidents WHERE id=?').get(id)!;
 const count=(table:string)=>Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
 return {...f,id,create,evidence,version,bytes,key,hash,evidenceId,choice,context,decision,start,row,count};
}
test('five incident stages retain separate reviewed sources and evidence across reopening and later uploads',async()=>{
 const f=await setup();try{
  await f.start();
  await appendEvidenceVersion(f.db,{...f.evidence,fileName:'later.pdf',changeNote:'Later report',period:'2027-Q1'},{additionalStatements:c=>[f.db.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').bind(JSON.stringify({versionNo:c.versionNo,versionChainSha256:c.chainSha256}),f.evidenceId)]});
  for(const operation of ['contain','eradicate','recover','review'])assert.equal((await f.decision(operation)).status,200,operation);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('close')).status,200);
  let history=(await f.get('view=history&incidentId='+f.id)).body;
  const pins=history.evidencePins as Array<{purpose:string;eventId:string;evidence:{id:string}}>;
  const events=history.events as Array<Record<string,string>>;
  assert.deepEqual(pins.map(p=>p.purpose).sort(),['incident-close','incident-contain','incident-eradicate','incident-recover','incident-review']);
  assert.ok(pins.every(p=>p.evidence.id===f.version.id&&events.some(e=>e.id===p.eventId)));
  const closed=events.find(e=>e.action==='close')!,snapshot=incidentDecisionDetail(closed.detail)!;
  assert.equal(snapshot.reviewedSource.status,'review');assert.equal(snapshot.decision.notificationDecision,'required');assert.ok(snapshot.reviewedSource.root_cause);
  assert.equal((await f.decision('close')).status,409);assert.equal((await f.decision('reopen')).status,200);assert.equal(f.row().status,'triage');
  assert.equal(f.count('workflow_evidence_pins'),5);history=(await f.get('view=history&incidentId='+f.id)).body;
  assert.equal((history.events as Array<Record<string,string>>).find(e=>e.id===closed.id)!.detail,closed.detail);
  assert.throws(()=>f.sqlite.exec("UPDATE workflow_evidence_pins SET purpose='changed'"),/immutable/);
 }finally{f.sqlite.close();}
});
test('complete incident content, live actor and selected evidence races reject atomic decisions',async()=>{
 for(const sql of ["UPDATE enterprise_incidents SET business_impact='Concurrent impact correction'","UPDATE enterprise_incidents SET reviewer='maker@example.com'","UPDATE local_users SET status='Disabled' WHERE id='owner'","UPDATE local_users SET role='Viewer' WHERE id='owner'","INSERT INTO user_module_access VALUES('owner','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE evidence_versions SET file_name='changed.pdf'","UPDATE simple_evidence_files SET content=x'00'"]){
  const f=await setup();try{await f.start();const before=f.count('enterprise_incident_events');f.before(()=>f.sqlite.exec(sql));assert.equal((await f.decision('contain')).status,409,sql);assert.equal(f.row().status,'triage');assert.equal(f.count('workflow_evidence_pins'),0);assert.equal(f.count('enterprise_incident_events'),before);}finally{f.sqlite.close();}
 }
 const f=await setup();try{await f.start();const before=await f.context();f.sqlite.exec("UPDATE enterprise_incidents SET description='Different incident description without timestamp change'");assert.equal((await f.decision('contain',{expectedRevision:before.revision})).status,409);assert.equal(f.count('workflow_evidence_pins'),0);}finally{f.sqlite.close();}
});
test('invalid evidence, missing review context and incomplete notification decisions cannot advance incidents',async()=>{
 for(const kind of ['missing','mismatch','bytes','chain','anchor','missing-revision','missing-mode']){
  const f=await setup();try{await f.start();let patch:Record<string,unknown>={};
   if(kind==='missing')f.sqlite.exec('DELETE FROM simple_evidence_files');if(kind==='mismatch')patch={evidenceSelection:{evidenceId:'EVD-other',versionId:f.version.id}};
   if(kind==='bytes')f.sqlite.prepare('UPDATE simple_evidence_files SET content=?').run(new TextEncoder().encode('changed'));
   if(kind==='chain')f.sqlite.exec("UPDATE evidence_versions SET period='changed'");if(kind==='anchor')f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run('{}',f.evidenceId);
   if(kind==='missing-revision')patch={expectedRevision:undefined};if(kind==='missing-mode')patch={decisionMode:undefined};
   assert.equal((await f.decision('contain',patch)).status,kind.startsWith('missing-')?400:422,kind);assert.equal(f.row().status,'triage');assert.equal(f.count('workflow_evidence_pins'),0);
  }finally{f.sqlite.close();}
 }
 const f=await setup();try{await f.start();for(const op of ['contain','eradicate','recover'])await f.decision(op);assert.equal((await f.decision('review',{rootCause:'short'})).status,400);assert.equal((await f.decision('review',{notificationDecision:'pending'})).status,400);assert.equal(f.row().status,'recovered');assert.equal(f.count('workflow_evidence_pins'),3);}finally{f.sqlite.close();}
});
test('event and pin failures roll back incident transitions and allow one subsequent retry',async()=>{
 for(const table of ['enterprise_incident_events','workflow_evidence_pins']){const f=await setup();try{
  await f.start();const events=f.count('enterprise_incident_events');
  f.sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced write failure'); END`);
  assert.equal((await f.decision('contain')).status,400);assert.equal(f.row().status,'triage');assert.equal(f.count('enterprise_incident_events'),events);assert.equal(f.count('workflow_evidence_pins'),0);
  f.sqlite.exec('DROP TRIGGER fail_write');assert.equal((await f.decision('contain')).status,200);assert.equal((await f.decision('contain')).status,409);assert.equal(f.count('workflow_evidence_pins'),1);
 }finally{f.sqlite.close();}}
});
test('directory declaration rejects self-review, duplicate roles and revoked assignees; token retries never duplicate or overwrite',async()=>{
 const f=await setup();try{
  assert.equal((await f.post(f.create)).status,201);assert.equal(f.count('enterprise_incidents'),1);assert.equal(f.count('enterprise_incident_events'),1);
  assert.equal((await f.post({...f.create,title:'Different incident payload'})).status,409);
  const fresh={...f.create,requestId:crypto.randomUUID()};
  assert.equal((await f.post({...fresh,reviewer:'maker@example.com'})).status,422);assert.equal((await f.post({...fresh,commander:'owner@example.com'})).status,400);
  f.before(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='commander'"));assert.equal((await f.post(fresh)).status,409);assert.equal(f.count('enterprise_incidents'),1);assert.equal(f.count('enterprise_incident_events'),1);
  assert.equal((await f.post(fresh)).status,422);assert.equal((await f.post({...fresh,assetRefs:'AST-999999999',assignmentMode:undefined})).status,422);
  f.sqlite.exec("UPDATE local_users SET status='Active' WHERE id='commander'");
  const concurrent=await Promise.all([f.post(fresh),f.post(fresh)]);assert.ok(concurrent.every(r=>r.status===201));assert.equal(concurrent[0].body.id,concurrent[1].body.id);assert.equal(f.count('enterprise_incidents'),2);assert.equal(f.count('enterprise_incident_events'),2);
  const recoverable={...fresh,requestId:crypto.randomUUID()};f.sqlite.exec("CREATE TRIGGER fail_declaration BEFORE INSERT ON enterprise_incident_events BEGIN SELECT RAISE(ABORT,'forced failure'); END");
  assert.equal((await f.post(recoverable)).status,400);assert.equal(f.count('enterprise_incidents'),2);f.sqlite.exec('DROP TRIGGER fail_declaration');assert.equal((await f.post(recoverable)).status,201);assert.equal(f.count('enterprise_incidents'),3);assert.equal(f.count('enterprise_incident_events'),3);
 }finally{f.sqlite.close();}
});
test('assigned response and independent closure boundaries remain enforced with legacy compatibility',async()=>{
 const f=await setup();try{
  f.setActor(actor('other','Editor'));assert.equal((await f.decision('triage')).status,403);
  f.setActor(actor('viewer','Viewer'));assert.equal((await f.decision('triage')).status,403);
  await f.start();const legacy={decisionMode:undefined,expectedRevision:undefined,evidenceMode:undefined,evidenceSelection:undefined,evidenceReference:'legacy-report',evidenceSha256:'a'.repeat(64)};
  for(const op of ['contain','eradicate','recover','review'])assert.equal((await f.decision(op,legacy)).status,200);
  f.setActor(actor('maker'));assert.equal((await f.decision('close')).status,403);
  f.setActor(actor('reviewer'));assert.equal((await f.decision('close',legacy)).status,200);assert.equal(f.count('workflow_evidence_pins'),0);
  f.setActor(actor('owner','Editor'));assert.equal((await f.decision('reopen')).status,403);
  assert.equal((await f.get('view=decision&incidentId=INC-missing')).status,404);assert.equal((await f.get('view=decision&incidentId=../bad')).status,400);
 }finally{f.sqlite.close();}
});
test('exact incident focus crosses list bounds and paginated history returns only the current events pins',async()=>{
 const f=await setup();try{
  await f.start();await f.decision('contain');
  for(let i=0;i<55;i++)f.sqlite.prepare('INSERT INTO enterprise_incident_events(id,incident_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?)').run('later-'+String(i).padStart(2,'0'),f.id,'test','Retained test event','reviewer@example.com','2099-01-01T00:00:00.000Z');
  const first=(await f.get('view=history&incidentId='+f.id)).body;assert.equal((first.events as unknown[]).length,50);assert.equal((first.evidencePins as unknown[]).length,0);assert.ok(first.nextCursor);
  const second=(await f.get('view=history&'+new URLSearchParams({incidentId:f.id,cursor:String(first.nextCursor)}))).body;assert.equal((second.events as unknown[]).length,8);assert.equal((second.evidencePins as unknown[]).length,1);assert.equal(second.nextCursor,null);
  assert.equal((await f.get('view=history&incidentId='+f.id+'&cursor=bad')).status,400);
  const original=f.row(),columns=Object.keys(original),insert=f.sqlite.prepare(`INSERT INTO enterprise_incidents(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
  for(let i=0;i<3001;i++){const record={...original,id:'INC-later-'+i,code:'INC-LATER-'+i,severity:'critical'};insert.run(...columns.map(k=>record[k as keyof typeof record]));}
  const ordinary=(await f.get()).body;assert.equal(ordinary.limited,true);assert.ok(!(ordinary.incidents as Array<{id:string}>).some(x=>x.id===f.id));
  const focused=(await f.get('focusKind=incident&focusId='+f.id)).body;assert.equal((focused.incidents as Array<{id:string}>)[0].id,f.id);
  assert.equal((await f.get('focusKind=incident&focusId=../bad')).status,400);
 }finally{f.sqlite.close();}
});
