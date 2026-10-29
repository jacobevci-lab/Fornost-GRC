import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { ensureWorkflowEvidenceSchema } from '../app/workflow-selection-store';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';
import { CORRECTION_PHRASES, assessmentDraft, parseCorrectionRecord, type CorrectionContext } from '../app/third-party-risk/assessment-correction';
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
  const context=async()=>{const r=await f.get(`view=assessment-context&assessmentId=${assessmentId}`);assert.equal(r.status,200,JSON.stringify(r.body));return r.body as unknown as CorrectionContext;};
  const correction=async(mode:'return'|'revise',patch:Record<string,unknown>={})=>{const c=await context();return{action:mode==='return'?'return-assessment':'revise-assessment',assessmentId,contextToken:c.token,note:'Explain and correct supplier responses using the reviewed source.',confirmation:CORRECTION_PHRASES[mode],...(mode==='revise'?{...assessmentDraft(c.assessment),impact:5}:{}),...patch};};
  const submit=async()=>{f.setActor(actor('owner','Editor'));const r=await f.post({action:'assessment-action',assessmentId,operation:'submit',note:'Submit the reviewed supplier assessment evidence.',confirmation:'İNCELEMEYE GÖNDER',expectedRevision:row('third_party_assessments',assessmentId).updated_at,...choice});assert.equal(r.status,200,JSON.stringify(r.body));};
  const history=()=>f.get(`view=assessment-corrections&assessmentId=${assessmentId}`);
  f.setActor(actor('owner','Editor'));
  return {...f,row,count,vendorId,assessmentId,scoring,evidenceId,version,choice,context,correction,submit,history};
}

test('assigned risk owner corrects the canonical draft with derived scores, atomic history and no duplicate retry',async()=>{
  const f=await setup();try{
    const profile=f.row('third_party_profiles'),core=f.row('simple_grc_records'),before=f.row('third_party_assessments',f.assessmentId),body=await f.correction('revise',{impact:5,likelihood:5,controlMaturity:1,dpa:false});
    assert.equal((await f.post(body)).status,200);const after=f.row('third_party_assessments',f.assessmentId);
    assert.equal(after.id,before.id);assert.equal(after.cycle_number,1);assert.equal(after.status,'draft');assert.equal(after.inherent_score,25);assert.equal(after.coverage,92);assert.equal(after.residual_score,11);assert.equal(after.risk_tier,'high');assert.deepEqual(JSON.parse(String(after.critical_gaps_json)),['dpa']);
    assert.deepEqual(f.row('third_party_profiles'),profile);assert.deepEqual(f.row('simple_grc_records'),core);assert.equal(f.count('workflow_evidence_pins'),0);
    const history=(await f.history()).body.rows as {actor:string;detail:{before:{impact:number};after:{impact:number}}}[];assert.equal(history.length,1);assert.equal(history[0].actor,'owner@example.com');assert.equal(history[0].detail.before.impact,3);assert.equal(history[0].detail.after.impact,5);
    assert.equal((await f.post(body)).status,409);assert.equal((await f.post(await f.correction('revise'))).status,400);assert.equal(((await f.history()).body.rows as unknown[]).length,1);
  }finally{f.sqlite.close()}
});
test('independent return moves My Work to owner; corrected resubmission retains original pins and permits a normal independent approval',async()=>{
  const f=await setup();try{
    await f.submit();const original=f.row('third_party_assessments',f.assessmentId),pins=f.sqlite.prepare('SELECT * FROM workflow_evidence_pins').all(),core=f.row('simple_grc_records');f.setActor(actor('reviewer'));
    assert.equal((await f.context()).canReturn,true);const body=await f.correction('return');assert.equal((await f.post(body)).status,200);assert.equal((await f.post(body)).status,409);
    const returned=f.row('third_party_assessments',f.assessmentId);assert.deepEqual({...returned},{...original,status:'draft',updated_by:'reviewer@example.com',updated_at:returned.updated_at});assert.equal(f.row('third_party_profiles').status,'onboarding');assert.deepEqual(f.row('simple_grc_records'),core);assert.deepEqual(f.sqlite.prepare('SELECT * FROM workflow_evidence_pins').all(),pins);
    const work=projectEnterpriseWork('vendor',(await f.get('view=work')).body).rows.find(r=>r.workKind==='vendor-assessment')!;assert.equal(work.data.status,'draft');assert.equal(work.data.owner,'owner@example.com');
    f.setActor(actor('owner','Editor'));assert.equal((await f.post(await f.correction('revise',{treatmentPlan:'Updated treatment after independent reviewer feedback.'}))).status,200);await f.submit();
    assert.equal(f.count('workflow_evidence_pins'),2);for(const pin of pins)assert.deepEqual(f.sqlite.prepare('SELECT * FROM workflow_evidence_pins WHERE id=?').get(pin.id),pin);
    assert.equal((await f.context()).canRevise,false);f.setActor(actor('reviewer'));assert.equal((await f.post({action:'assessment-action',assessmentId:f.assessmentId,operation:'approve',note:'The corrected assessment and resubmission evidence were independently checked.',confirmation:'TEDARİKÇİYİ ONAYLA',expectedRevision:f.row('third_party_assessments',f.assessmentId).updated_at,...f.choice})).status,200);assert.equal(f.row('third_party_assessments',f.assessmentId).decided_by,'reviewer@example.com');
    const history=(await f.history()).body.rows as {detail:{before:{status:string;submittedBy:string};after:{status:string}}}[];assert.equal(history.length,2);assert.equal(history[1].detail.before.status,'submitted');assert.equal(history[1].detail.before.submittedBy,'owner@example.com');assert.equal(history[1].detail.after.status,'draft');
  }finally{f.sqlite.close()}
});
test('returning a renewal restores reassessment without rewriting the completed cycle or review schedule',async()=>{
  const f=await setup();try{
    await f.submit();f.setActor(actor('reviewer'));assert.equal((await f.post({action:'assessment-action',assessmentId:f.assessmentId,operation:'approve',note:'Independent approval of the original cycle.',expectedRevision:f.row('third_party_assessments',f.assessmentId).updated_at,confirmation:'TEDARİKÇİYİ ONAYLA',...f.choice})).status,200);
    f.setActor(actor('maker'));const renewal=await f.post({action:'renew-assessment',vendorId:f.vendorId,...f.scoring});assert.equal(renewal.status,201);const id=String(renewal.body.id),previous=f.row('third_party_assessments',f.assessmentId),profile=f.row('third_party_profiles');
    f.setActor(actor('owner','Editor'));assert.equal((await f.post({action:'assessment-action',assessmentId:id,operation:'submit',note:'Submit the next periodic review cycle.',expectedRevision:f.row('third_party_assessments',id).updated_at,confirmation:'İNCELEMEYE GÖNDER',...f.choice})).status,200);f.setActor(actor('reviewer'));const context=(await f.get(`view=assessment-context&assessmentId=${id}`)).body;
    assert.equal((await f.post({action:'return-assessment',assessmentId:id,contextToken:context.token,note:'The renewed assessment needs a more specific treatment plan.',confirmation:CORRECTION_PHRASES.return})).status,200);
    assert.equal(f.row('third_party_profiles').status,'reassessment');assert.equal(f.row('third_party_profiles').next_review,profile.next_review);assert.deepEqual(f.row('third_party_assessments',f.assessmentId),previous);assert.equal(f.row('third_party_assessments',id).cycle_number,2);
  }finally{f.sqlite.close()}
});
test('only active assigned owner revises; only the independent assigned Admin returns; Viewer may inspect history',async()=>{
  for(const [id,role] of [['maker','Admin'],['reviewer','Admin'],['lead','Editor'],['owner','Viewer']] as const){const f=await setup();try{const body=await f.correction('revise');f.setActor(actor(id,role));assert.equal((await f.post(body)).status,403);assert.equal((await f.context()).canRevise,false);assert.equal((await f.history()).status,200);}finally{f.sqlite.close()}}
  for(const [id,role] of [['maker','Admin'],['owner','Editor'],['lead','Editor'],['reviewer','Viewer']] as const){const f=await setup();try{await f.submit();const body=await f.correction('return');f.setActor(actor(id,role));assert.equal((await f.post(body)).status,403);assert.equal((await f.context()).canReturn,false);}finally{f.sqlite.close()}}
  for(const column of ['created_by','business_owner','risk_owner']){const f=await setup();try{await f.submit();f.sqlite.prepare(`UPDATE third_party_profiles SET ${column}=?`).run('REVIEWER@example.com');f.setActor(actor('reviewer'));assert.equal((await f.post(await f.correction('return'))).status,403);}finally{f.sqlite.close()}}
  for(const column of ['created_by','submitted_by']){const f=await setup();try{await f.submit();f.sqlite.prepare(`UPDATE third_party_assessments SET ${column}=?`).run('REVIEWER@example.com');f.setActor(actor('reviewer'));assert.equal((await f.post(await f.correction('return'))).status,403);}finally{f.sqlite.close()}}
  const f=await setup();try{const body=await f.correction('revise');f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='owner'");assert.equal((await f.post(body)).status,403);}finally{f.sqlite.close()}
});
test('submitted and terminal assessments and closed suppliers cannot be edited or returned',async()=>{
  for(const status of ['submitted','approved','conditional','rejected','superseded']){const f=await setup();try{f.sqlite.prepare('UPDATE third_party_assessments SET status=?').run(status);assert.equal((await f.post(await f.correction('revise'))).status,403);}finally{f.sqlite.close()}}
  for(const status of ['draft','approved','conditional','rejected','superseded']){const f=await setup();try{await f.submit();f.sqlite.prepare('UPDATE third_party_assessments SET status=?').run(status);f.setActor(actor('reviewer'));assert.equal((await f.post(await f.correction('return'))).status,403);}finally{f.sqlite.close()}}
  for(const mode of ['return','revise'] as const)for(const status of ['offboarded','rejected']){const f=await setup();try{if(mode==='return'){await f.submit();f.setActor(actor('reviewer'))}f.sqlite.prepare('UPDATE third_party_profiles SET status=?').run(status);assert.equal((await f.post(await f.correction(mode))).status,403);}finally{f.sqlite.close()}}
});
test('full context and committing source/account snapshots reject races with no partial correction',async()=>{
  const mutations=["UPDATE third_party_profiles SET service='Changed service'","UPDATE third_party_profiles SET reviewer='next@example.com'","UPDATE third_party_profiles SET risk_owner='lead@example.com'","UPDATE third_party_profiles SET next_review='2099-01-01'","UPDATE third_party_assessments SET treatment_plan='Changed treatment plan'","UPDATE third_party_assessments SET likelihood=1","UPDATE third_party_assessments SET status='approved'","UPDATE local_users SET status='Disabled' WHERE id IN ('owner','reviewer')","UPDATE local_users SET role='Viewer' WHERE id IN ('owner','reviewer')","INSERT INTO user_module_access VALUES('owner','{}');INSERT INTO user_module_access VALUES('reviewer','{}')"];
  for(const mode of ['return','revise'] as const)for(const sql of mutations){const f=await setup();try{if(mode==='return'){await f.submit();f.setActor(actor('reviewer'))}const body=await f.correction(mode),count=f.count('third_party_events');f.before(()=>f.sqlite.exec(sql));assert.equal((await f.post(body)).status,409,mode+sql);assert.equal(f.count('third_party_events'),count);assert.equal(((await f.history()).body.rows as unknown[]).length,0);}finally{f.sqlite.close()}}
  const f=await setup();try{const body=await f.correction('revise');f.sqlite.exec("UPDATE third_party_assessments SET treatment_plan='New source without a changed timestamp'");assert.equal((await f.post(body)).status,409);}finally{f.sqlite.close()}
});
test('event failure rolls back assessment and parent for both operations',async()=>{
  for(const mode of ['return','revise'] as const){const f=await setup();try{if(mode==='return'){await f.submit();f.setActor(actor('reviewer'))}const body=await f.correction(mode),before=f.row('third_party_assessments',f.assessmentId),profile=f.row('third_party_profiles');f.sqlite.exec("CREATE TRIGGER fail_correction BEFORE INSERT ON third_party_events WHEN NEW.action IN ('assessment-returned','assessment-revised') BEGIN SELECT RAISE(ABORT,'owned failure'); END");assert.equal((await f.post(body)).status,400);assert.deepEqual(f.row('third_party_assessments',f.assessmentId),before);assert.deepEqual(f.row('third_party_profiles'),profile);}finally{f.sqlite.close()}}
});
test('strict inputs reject ambiguous scores, incomplete controls, wrong confirmation and caller-supplied derived values',async()=>{
  const f=await setup();try{const body=await f.correction('revise'),before=f.row('third_party_assessments',f.assessmentId);for(const patch of [{assessmentId:[]},{contextToken:'old'},{note:'short'},{note:'x'.repeat(1201)},{note:'long reason with\u0000null byte'},{confirmation:'yes'},{impact:'5'},{impact:[5]},{likelihood:0},{controlMaturity:6},{dpa:'true'},{dpa:undefined},{treatmentPlan:'short'},{treatmentPlan:'x'.repeat(2001)},{residualScore:1},{evidenceMode:'library'},{vendorId:f.vendorId}])assert.equal((await f.post({...body,...patch})).status,400,JSON.stringify(patch));assert.deepEqual(f.row('third_party_assessments',f.assessmentId),before);assert.equal(((await f.history()).body.rows as unknown[]).length,0);}finally{f.sqlite.close()}
});
test('bounded history pagination keeps complete snapshots, exposes corrupt events and validates selectors',async()=>{
  const f=await setup();try{assert.equal((await f.post(await f.correction('revise'))).status,200);const event=f.sqlite.prepare("SELECT * FROM third_party_events WHERE action='assessment-revised'").get()!;for(let i=0;i<21;i++)f.sqlite.prepare('INSERT INTO third_party_events(id,vendor_id,assessment_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?,?)').run('copy-'+i,f.vendorId,f.assessmentId,event.action,i===0?'bad-json':event.detail,event.actor,new Date(Date.now()+i+1000).toISOString());const first=(await f.history()).body;assert.equal((first.rows as unknown[]).length,20);assert.equal(first.hasMore,true);const second=(await f.get(`view=assessment-corrections&assessmentId=${f.assessmentId}&page=1`)).body;assert.equal((second.rows as {detail:unknown}[])[0].detail,null);assert.equal((second.rows as unknown[]).length,2);assert.equal(second.hasMore,false);
    for(const query of ['view=assessment-context','view=assessment-context&assessmentId=x&page=0','view=assessment-corrections&assessmentId=x&page=-1','view=assessment-corrections&assessmentId=x&page=10000','view=assessment-context&assessmentId=x&assessmentId=y','view=assessment-corrections&assessmentId=x&format=csv'])assert.equal((await f.get(query)).status,400,query);
    assert.equal((await f.get('view=assessment-context&assessmentId=missing')).status,404);assert.equal((await f.get('view=assessment-corrections&assessmentId=missing')).status,404);for(const raw of ['{}','null','{bad',JSON.stringify({...JSON.parse(String(event.detail)),after:{id:'other'}})])assert.equal(parseCorrectionRecord(raw),null);
  }finally{f.sqlite.close()}
});
