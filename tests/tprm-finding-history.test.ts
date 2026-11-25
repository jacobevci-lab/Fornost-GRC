import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { ensureWorkflowEvidenceSchema } from '../app/workflow-selection-store';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';
import { findingEventDetail, parseFindingEvidence, type FindingHistory } from '../app/third-party-risk/finding-history';
import type { Actor } from '../app/api/auth/security';

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
  return {...f,row,count,vendorId,assessmentId,findingId,evidenceId,version,choice,history,act};
}

test('finding feedback and every event-specific proof survive return, resubmission, closure and reopening',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));await f.act('start','Begin the assigned remediation work.');await f.act('submit-finding','First remediation submission using the original evidence.');
  f.setActor(actor('reviewer'));await f.act('reopen-finding','Please include the deletion test and complete access revocation.');
  const returned=await f.history();assert.equal(returned.rows[0].from,'verification');assert.equal(returned.rows[0].to,'in-progress');assert.match(returned.finding.actionNote,/deletion test/);
  const bytes=new TextEncoder().encode('Owned revised remediation proof'),stamp=new Date().toISOString(),key='evidence/EVD-review/revised.txt';
  const version=await appendEvidenceVersion(f.db,{evidenceId:f.evidenceId,fileKey:key,fileName:'revised.txt',fileType:'text/plain',fileSize:bytes.length,contentSha256:await sha256HexBytes(bytes),evidenceTitle:'Supplier review',owner:'owner@example.com',period:'2026-Q4',frameworks:'ISO 27001',controlRefs:'A.5.19',changeNote:'Revised remediation proof',createdBy:'maker@example.com',createdAt:stamp},{additionalStatements:c=>[f.db.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.versionNo',?,'$.versionChainSha256',?),updated_at=? WHERE id=?").bind(c.versionNo,c.chainSha256,stamp,f.evidenceId)]});
  f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'revised.txt','text/plain',bytes,stamp);
  f.setActor(actor('owner','Editor'));await f.act('submit-finding','Second remediation submission includes requested deletion testing.',{evidenceSelection:{evidenceId:f.evidenceId,versionId:version.id}});
  f.setActor(actor('reviewer'));await f.act('verify-finding','Independently verified deletion and access revocation.',{evidenceSelection:{evidenceId:f.evidenceId,versionId:version.id}});await f.act('reopen-finding','Reopen after discovering a missed supplier service account.');
  f.setActor(actor('reader','Viewer'));const before=f.sqlite.prepare('SELECT * FROM third_party_events ORDER BY id').all(),h=await f.history();assert.deepEqual(f.sqlite.prepare('SELECT * FROM third_party_events ORDER BY id').all(),before);assert.equal(h.rows.length,7);assert.equal(h.rows[0].from,'closed');assert.equal(h.rows[0].to,'in-progress');assert.equal(h.finding.status,'in-progress');assert.equal(h.rows[1].pin?.evidence.id,version.id);assert.equal(h.rows[2].pin?.evidence.id,version.id);assert.equal(h.rows[4].pin?.evidence.id,f.version.id);assert.match(h.rows[3].note,/deletion test/);assert.match(h.rows[4].note,/original evidence/);assert.ok(h.rows.every(r=>!r.pinIssue));assert.equal(h.nextCursor,null);
 }finally{f.sqlite.close()}
});

test('keyset pages include older events beyond global bounds and remain stable after a new decision',async()=>{
 const f=await setup();try{
  const insert=f.sqlite.prepare('INSERT INTO third_party_events(id,vendor_id,assessment_id,finding_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?,?,?)');
  for(let i=0;i<45;i++)insert.run('history-'+String(i).padStart(3,'0'),f.vendorId,f.assessmentId,f.findingId,'finding-start','open->in-progress; Preserved historical reason '+i,'owner@example.com','2026-01-01T00:00:00.000Z');
  for(let i=0;i<130;i++)insert.run('unrelated-'+i,f.vendorId,f.assessmentId,null,'assessment-submit','Other assessment event','maker@example.com','2099-01-01T00:00:00.000Z');
  const first=await f.history();assert.equal(first.rows.length,20);assert.ok(first.nextCursor);insert.run('new-event',f.vendorId,f.assessmentId,f.findingId,'finding-start','open->in-progress; New decision','owner@example.com','2099-01-01T00:00:00.000Z');
  const second=await f.history(first.nextCursor!);assert.equal(second.rows.length,20);assert.ok(second.nextCursor);const third=await f.history(second.nextCursor!);assert.equal(third.rows.length,6);assert.equal(third.nextCursor,null);const ids=[...first.rows,...second.rows,...third.rows].map(r=>r.id);assert.equal(new Set(ids).size,46);assert.ok(!ids.includes('new-event'));assert.equal((await f.history()).rows[0].id,'new-event');
 }finally{f.sqlite.close()}
});

test('history and cursor are strictly scoped to the canonical finding, assessment and supplier',async()=>{
 const f=await setup();try{
  const insert=f.sqlite.prepare('INSERT INTO third_party_events(id,vendor_id,assessment_id,finding_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?,?,?)');
  for(const [id,v,a,fid] of [['wrong-vendor','other',f.assessmentId,f.findingId],['wrong-assessment',f.vendorId,'other',f.findingId],['wrong-finding',f.vendorId,f.assessmentId,'other']]){insert.run(id,v,a,fid,'finding-start','Other confidential event','other@example.com','2099-01-01T00:00:00.000Z');assert.equal((await f.get(`view=finding-history&findingId=${f.findingId}&before=${id}`)).status,400);}
  assert.equal((await f.history()).rows.length,1);
  f.sqlite.prepare("UPDATE third_party_profiles SET status='offboarded'").run();assert.equal((await f.history()).rows.length,1);
  f.sqlite.prepare("UPDATE third_party_assessments SET vendor_id='other'").run();assert.equal((await f.get(`view=finding-history&findingId=${f.findingId}`)).status,404);
 }finally{f.sqlite.close()}
});

test('missing, malformed or mismatched event pins stay explicit without using latest evidence',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));await f.act('start','Begin remediation on the assigned finding.');await f.act('submit-finding','Submit the original retained remediation proof.');
  const pin=f.sqlite.prepare('SELECT * FROM workflow_evidence_pins').get()!;const original=String(pin.snapshot_json),eventId=String(pin.event_id);
  // Simulate legacy/restored corruption; production pin updates remain protected by the immutable trigger.
  f.sqlite.exec('DROP TRIGGER workflow_evidence_pin_immutable');
  for(const raw of ['null','{}','{bad',JSON.stringify({...JSON.parse(original),versionNo:0}),JSON.stringify({...JSON.parse(original),fileKey:22}),JSON.stringify({...JSON.parse(original),contentSha256:'wrong'})]){f.sqlite.prepare('UPDATE workflow_evidence_pins SET snapshot_json=?').run(raw);const row=(await f.history()).rows.find(r=>r.id===eventId)!;assert.equal(row.pin,null);assert.equal(row.pinIssue,true);}
  f.sqlite.prepare('UPDATE workflow_evidence_pins SET snapshot_json=?,actor=?').run(original,'wrong@example.com');assert.equal((await f.history()).rows[0].pinIssue,true);
  f.sqlite.prepare('UPDATE workflow_evidence_pins SET actor=?,purpose=?').run(pin.actor,'verify-finding');assert.equal((await f.history()).rows[0].pinIssue,true);
  f.sqlite.prepare('UPDATE workflow_evidence_pins SET purpose=?').run(pin.purpose);
  assert.throws(()=>f.sqlite.exec("INSERT INTO workflow_evidence_pins SELECT 'duplicate',event_id,workflow,entity_id,purpose,snapshot_json,actor,created_at FROM workflow_evidence_pins"),/UNIQUE/);assert.equal((await f.history()).rows[0].pin?.evidence.id,f.version.id);
  f.sqlite.prepare("UPDATE workflow_evidence_pins SET entity_id='foreign-finding'").run();assert.equal((await f.history()).rows[0].pin,null);assert.equal((await f.history()).rows[0].pinIssue,false);
  f.sqlite.prepare('UPDATE workflow_evidence_pins SET entity_id=?,workflow=?').run(f.findingId,'incidents');assert.equal((await f.history()).rows[0].pin,null);
 }finally{f.sqlite.close()}
});

test('legacy messages remain exact and unknown transitions do not acquire invented states',async()=>{
 assert.deepEqual(findingEventDetail('finding-reopen-finding','verification->in-progress; Explain; with a semicolon'),{from:'verification',to:'in-progress',note:'Explain; with a semicolon'});
 for(const [action,detail] of [['finding-reopen-finding','Legacy note without states'],['unknown-action','open->in-progress; Old raw text'],['finding-start','closed->in-progress; Wrong transition']])assert.deepEqual(findingEventDetail(action,detail),{from:null,to:null,note:detail});
 assert.equal(parseFindingEvidence('[]'),null);
 const f=await setup();try{f.sqlite.prepare('UPDATE third_party_events SET detail=? WHERE finding_id=?').run('<script>text only</script>',f.findingId);assert.equal((await f.history()).rows[0].note,'<script>text only</script>');f.sqlite.prepare('DELETE FROM third_party_events WHERE finding_id=?').run(f.findingId);const h=await f.history();assert.deepEqual(h.rows,[]);assert.equal(h.nextCursor,null);}finally{f.sqlite.close()}
});

test('invalid selectors and missing sources are rejected; source failures are not empty histories',async()=>{
 const f=await setup();try{
  for(const query of ['view=finding-history','view=finding-history&findingId=','view=finding-history&findingId=x&findingId=y','view=finding-history&findingId=x&before=','view=finding-history&findingId=x&before=a&before=b','view=finding-history&findingId=x&page=0','view=finding-history&findingId=x&format=csv','view=finding-history&findingId=x&view=work','view=finding-history&findingId='+ 'a'.repeat(101),'view=finding-history&findingId=x&before='+ 'a'.repeat(101)])assert.equal((await f.get(query)).status,400,query);
  assert.equal((await f.get('view=finding-history&findingId=missing')).status,404);
  f.sqlite.exec('DROP TABLE workflow_evidence_pins;CREATE TABLE workflow_evidence_pins(id TEXT)');assert.equal((await f.get(`view=finding-history&findingId=${f.findingId}`)).status,503);
 }finally{f.sqlite.close()}
});
