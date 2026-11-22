import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,actor,prepareExit,future} from './helpers/supplier-evidence-fixture';
import {vendorTier,suggestedReview} from '../app/third-party-risk/tier';
import {parseSurvey,surveyTemplate,type SurveyRecord} from '../app/third-party-risk/survey';
import {TPRM_CONTROLS} from '../app/third-party-risk/domain';

test('tier precedence, missing classifications, leap days and contract-bound suggestions',()=>{
 assert.equal(vendorTier('critical','public'),1);assert.equal(vendorTier('Yüksek','Çok Gizli'),1);
 assert.equal(vendorTier('low','confidential'),2);assert.equal(vendorTier('high','internal'),2);assert.equal(vendorTier('low','public'),3);
 assert.equal(vendorTier('High','Internal'),2);assert.equal(vendorTier('low',''),null);assert.equal(suggestedReview(1,'','2027-09-02'),'2028-02-29');
 assert.equal(suggestedReview(2,'','2026-01-01'),'2027-01-01');assert.equal(suggestedReview(3,'','2026-01-01'),'2028-01-01');
 assert.equal(suggestedReview(3,'2026-02-01','2026-01-01'),'2026-02-01');
});
function csv(code:string,tr=false){let i=0;return surveyTemplate(code,1,tr).replace(/,"",""\r\n/g,()=>',"' + (tr?['Evet','Kısmi','Hayır','Uygulanabilir Değil']:['Yes','Partial','No','Not applicable'])[i++%4]+'","A, B; ""notes""\nsecond line"\r\n');}
test('TR/EN CSV round trip and all-or-nothing validation',()=>{
 for(const tr of [true,false]){const contents=csv('VEN-001',tr),results=parseSurvey(contents,'VEN-001',1);assert.equal(results.length,12);
 assert.deepEqual(results.slice(0,4).map(x=>x.answer),['yes','partial','no','na']);assert.equal(results[0].comment,'A, B; "notes"\nsecond line');
 for(const bad of [contents.replace('VEN-001','VEN-002'),contents.replace('"1"','"2"'),contents.replace('accessControl','securityProgram'),contents.replace(tr?'Kısmi':'Partial','???'),contents.slice(0,-12)])assert.throws(()=>parseSurvey(bad,'VEN-001',1));}
});
test('import updates only matching draft; findings deduplicate and keep supplier response',async()=>{
 const f=await setup();try{
  f.setActor(actor('owner','Editor'));const base=()=>({assessmentId:f.assessmentId,expectedRevision:f.row('third_party_assessments',f.assessmentId).updated_at});
  const w=await f.get();const code=(w.body.profiles as {code:string}[])[0].code;
  const upload={action:'survey-import',...base(),csv:csv(code)};
  assert.equal((await f.post({...upload,csv:csv('VEN-888')})).status,422);assert.equal((await f.post(upload)).status,200);
  assert.equal((await f.post(upload)).status,409);
  const a=f.row('third_party_assessments',f.assessmentId);assert.equal(a.coverage,25);assert.equal(a.impact,f.vendor.impact);
  assert.equal(TPRM_CONTROLS.filter(k=>JSON.parse(String(a.questionnaire_json))[k]).length,3);
  const create=()=>({action:'survey-finding',...base(),control:'accessControl',dueDate:future(5),severity:'medium'});
  assert.equal((await f.post({...create(),control:'securityProgram'})).status,422);assert.equal((await f.post(create())).status,200);
  assert.equal((await f.post(create())).status,409);assert.equal(f.count('third_party_findings'),1);
  const result=((await f.get()).body.assessments as {survey:SurveyRecord;surveyFindings:Record<string,string>}[])[0];
  assert.match(result.surveyFindings.accessControl,/^TPF-/);assert.equal(result.survey.rows[1].answer,'partial');
  f.setActor(actor('reviewer'));assert.equal((await f.post({...upload,...base()})).status,403);
  f.setActor(actor('owner','Editor'));f.sqlite.exec("UPDATE third_party_assessments SET status='submitted'");assert.equal((await f.post({...upload,...base()})).status,409);
 }finally{f.sqlite.close()}
});
test('draft questionnaire assigns a missing vendor code once through the registry',async()=>{
 const f=await setup();try{
  f.sqlite.prepare('DELETE FROM simple_grc_record_codes WHERE record_id=?').run(f.vendorId);
  f.setActor(actor('owner','Editor'));
  const issue=()=>f.post({action:'survey-code',assessmentId:f.assessmentId,expectedRevision:f.row('third_party_assessments',f.assessmentId).updated_at});
  const first=await issue();assert.equal(first.status,200);assert.match(String(first.body.code),/^VEN-\d{3,}$/);
  assert.equal((await issue()).body.code,first.body.code);
  assert.equal(f.sqlite.prepare('SELECT code FROM simple_grc_record_codes WHERE record_id=?').get(f.vendorId)?.code,first.body.code);
 }finally{f.sqlite.close()}
});
test('offboarding enforces preparation, evidence, open CAPA, both owners and reviewer, and preserves its snapshot',async()=>{
 const f=await setup();try{
 const rev=()=>f.row('third_party_profiles',f.vendorId,'vendor_id').updated_at,call=(action:string,extra={})=>f.post({action,vendorId:f.vendorId,expectedRevision:rev(),...extra});
 const finding=await f.addFinding();await prepareExit(f);
 assert.equal((await f.decision('offboard',f.vendorId)).body.code,'EXIT_CAPA');
 f.sqlite.prepare("UPDATE third_party_findings SET status='closed' WHERE id=?").run(finding);
 f.setActor(actor('owner','Editor'));assert.equal((await call('offboard',{confirmation:'TEDARİKÇİYİ KAPAT'})).status,403);
 assert.equal((await call('save-exit',{accessRevoked:false,dataReturned:true})).status,200);
 f.setActor(actor('reviewer'));assert.equal((await f.decision('offboard',f.vendorId)).body.code,'EXIT_GATE');
 f.setActor(actor('owner','Editor'));assert.equal((await call('save-exit',{accessRevoked:true,dataReturned:true,clearProof:true})).status,200);
 f.setActor(actor('reviewer'));assert.equal((await f.decision('offboard',f.vendorId)).body.code,'EXIT_GATE');
 f.setActor(actor('owner','Editor'));assert.equal((await call('save-exit',{accessRevoked:true,dataReturned:true,...f.choice})).status,200);
 f.setActor(actor('reviewer'));assert.equal((await f.decision('offboard',f.vendorId)).status,200);
 assert.equal((await f.decision('offboard',f.vendorId)).status,404);
 const x=JSON.parse(String(f.sqlite.prepare("SELECT detail FROM third_party_events WHERE action='vendor-offboard'").get()!.detail));
 assert.equal(x.proof.versionId,f.version.id);assert.equal(x.openFindings,0);assert.equal(x.approvedBy,'reviewer@example.com');assert.ok(x.approvedAt);
 }finally{f.sqlite.close()}
});
test('exit closure rechecks concurrent changes and rolls back both records and history on failure',async()=>{
 for(const mode of ['source','reviewer','finding','audit','update']){const f=await setup();try{
 const finding=await f.addFinding();f.sqlite.prepare("UPDATE third_party_findings SET status='closed' WHERE id=?").run(finding);await prepareExit(f);
 const before=f.count('third_party_events');
 if(mode==='audit'||mode==='update')f.sqlite.exec(mode==='audit'?"CREATE TRIGGER fail_exit BEFORE INSERT ON third_party_events BEGIN SELECT RAISE(ABORT,'fixture'); END":"CREATE TRIGGER fail_exit BEFORE UPDATE ON simple_grc_records BEGIN SELECT RAISE(ABORT,'fixture'); END");
 else f.before(()=>{if(mode==='source')f.sqlite.prepare("UPDATE simple_grc_records SET data_json='{}' WHERE id=?").run(f.vendorId);else if(mode==='reviewer')f.sqlite.exec("UPDATE third_party_profiles SET reviewer='other@example.com'");else f.sqlite.prepare("UPDATE third_party_findings SET status='open' WHERE id=?").run(finding)});
 const r=await f.decision('offboard',f.vendorId);assert.equal(r.status,mode==='audit'||mode==='update'?400:409,JSON.stringify(r.body));
 assert.equal(f.row('third_party_profiles',f.vendorId,'vendor_id').status,'offboarding');assert.equal(f.count('third_party_events'),before);
 }finally{f.sqlite.close()}}
});
