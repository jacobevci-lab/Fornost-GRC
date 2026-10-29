import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { ensureWorkflowEvidenceSchema } from '../app/workflow-selection-store';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';
import { validContractExtension } from '../app/third-party-risk/contract-extension';
import { readWorkflowUsage } from '../app/evidence/workflow-usage';
import { projectEnterpriseWork } from '../app/enterprise-work';
import type { Actor } from '../app/api/auth/security';

const actor = (id: string, role: 'Admin' | 'Editor' | 'Viewer' = 'Admin'): Actor => ({ id, name: id, email: id + '@example.com', role, source: 'local' });
const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
async function setup(previous = date(-1)) {
  const f = fixture('third-party-risk'); await f.post({}); await ensureCoreGrcSchemaCompatibility(f.db); await ensureWorkflowEvidenceSchema(f.db);
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  for (const [id, role] of [['maker','Admin'], ['reviewer','Admin'], ['owner','Editor'], ['lead','Editor']]) f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
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
  return { ...f, row, count, vendorId, assessmentId, decision, scoring, extension, evidenceId, version };
}

test('contract extension requires a real later future calendar date', () => {
  assert.equal(validContractExtension('2028-02-29','2028-02-28','2028-02-27'),true);
  assert.equal(validContractExtension('2026-11-01','2026-10-01','2026-10-29'),true);
  for (const next of ['2026-02-29','2026-10-29','2026-10-28','2026-11-01T00:00:00Z',null]) assert.equal(validContractExtension(next,'2026-10-28','2026-10-29'),false);
  assert.equal(validContractExtension('2026-11-01','2026-11-01','2026-10-29'),false);
});
test('recording an executed extension updates connected contract dates, preserves overdue review and enables a later independent decision', async () => {
  const f=await setup(); try {
    f.sqlite.prepare('UPDATE third_party_profiles SET contract_end=? WHERE vendor_id=?').run(date(-1),f.vendorId);
    f.sqlite.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.contractEnd',?) WHERE id=?").run(date(-1),f.vendorId);
    const originalCore=JSON.parse(String(f.row('simple_grc_records').data_json)), originalAssessment=f.row('third_party_assessments',f.assessmentId);
    assert.equal((await f.post(f.decision())).status,400);
    const body=f.extension(),result=await f.post(body); assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(f.row('third_party_profiles').contract_end,date(730)); assert.equal(f.row('third_party_profiles').next_review,date(-1)); assert.equal(f.row('third_party_profiles').status,'in-review');
    assert.deepEqual(JSON.parse(String(f.row('simple_grc_records').data_json)),{...originalCore,contractEnd:date(730)}); assert.deepEqual(f.row('third_party_assessments',f.assessmentId),originalAssessment);
    const work=projectEnterpriseWork('vendor',(await f.get('view=work')).body); assert.equal(work.rows.find(x=>x.workKind==='vendor-review')?.data.dueDate,date(-1));
    const history=await f.get(`view=contract-history&vendorId=${f.vendorId}`),row=(history.body.rows as Record<string,unknown>[])[0]; assert.equal(history.status,200); assert.deepEqual(row.detail,{previousDate:date(-1),nextDate:date(730),reviewDate:date(-1),note:body.note}); assert.equal(row.actor,'reviewer@example.com'); assert.ok(row.createdAt);
    assert.equal((row.pin as {evidence:{id:string}}).evidence.id,f.version.id);
    const usage=await readWorkflowUsage(f.db,'tprm',{id:f.evidenceId} as Parameters<typeof readWorkflowUsage>[2]),used=usage.rows.find(x=>x.decision?.purpose==='vendor-contract-extended'); assert.equal(used?.decision?.sourceAvailable,true); assert.equal(used?.target.kind,'vendor-review'); assert.equal(used?.target.ref,f.vendorId);
    assert.equal((await f.post(f.decision())).status,200); assert.equal(f.row('third_party_profiles').next_review,date(90)); assert.equal(f.row('third_party_profiles').contract_end,date(730));
  } finally { f.sqlite.close(); }
});
test('required evidence, strict source/date/note/confirmation and wrong-operation input cannot mutate the supplier',async()=>{
  const f=await setup();try{
    const before=f.row('third_party_profiles'),events=f.count('third_party_events'),pins=f.count('workflow_evidence_pins');
    for(const patch of [{contractExtension:null},{contractExtension:[]},{contractExtension:{previousDate:date(365),nextDate:date(730),extra:true}},{contractExtension:{previousDate:date(365),nextDate:date(365)}},{contractExtension:{previousDate:date(365),nextDate:date(-1)}},{expectedRevision:undefined},{confirmation:'yes'},{note:'short'},{note:'x'.repeat(1201)},{evidenceMode:undefined},{evidenceMode:'manual'},{action:'offboard'},{reviewSchedule:{}}]){
      assert.equal((await f.post(f.extension(patch))).status,400,JSON.stringify(patch));
    }
    for(const patch of [{evidenceSelection:undefined},{evidenceSelection:{evidenceId:'EVD-missing',versionId:f.version.id}}])assert.equal((await f.post(f.extension(patch))).status,422);
    assert.deepEqual(f.row('third_party_profiles'),before);assert.equal(f.count('third_party_events'),events);assert.equal(f.count('workflow_evidence_pins'),pins);
  }finally{f.sqlite.close()}
});
test('only the current independent reviewer can record an extension, including legacy self-assignment cases',async()=>{
  for(const account of [actor('maker'),actor('owner','Editor'),actor('lead','Editor'),actor('viewer','Viewer')]){const f=await setup();try{f.setActor(account);assert.equal((await f.post(f.extension())).status,403);assert.equal(f.row('third_party_profiles').contract_end,date(365));}finally{f.sqlite.close()}}
  for(const field of ['created_by','risk_owner','business_owner']){const f=await setup();try{f.sqlite.exec(`UPDATE third_party_profiles SET ${field}='reviewer@example.com'`);assert.equal((await f.post(f.extension())).status,403);}finally{f.sqlite.close()}}
  for(const status of ['offboarded','rejected']){const f=await setup();try{f.sqlite.prepare('UPDATE third_party_profiles SET status=?').run(status);assert.equal((await f.post(f.extension())).status,403);}finally{f.sqlite.close()}}
  const f=await setup();try{f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='reviewer'");assert.equal((await f.post(f.extension())).status,403);}finally{f.sqlite.close()}
});
test('stale inspected profile/date and a missing or corrupt connected vendor require recovery',async()=>{
  const f=await setup();try{
    assert.equal((await f.post(f.extension({expectedRevision:'stale'}))).status,409);
    assert.equal((await f.post(f.extension({contractExtension:{previousDate:date(364),nextDate:date(730)}}))).status,409);
    for(const data of ['null','[]','{broken']){f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(data,f.vendorId);assert.equal((await f.post(f.extension())).status,409);}
    f.sqlite.prepare('DELETE FROM simple_grc_records WHERE id=?').run(f.vendorId);assert.equal((await f.post(f.extension())).status,409);
    assert.equal(f.row('third_party_profiles').contract_end,date(365));
  }finally{f.sqlite.close()}
});
test('commit-time profile, core, account and evidence conflicts leave no partial extension',async()=>{
  for(const sql of ["UPDATE third_party_profiles SET contract_end='2099-01-01'","UPDATE third_party_profiles SET next_review='2099-01-01'","UPDATE third_party_profiles SET reviewer='other@example.com'","UPDATE third_party_profiles SET business_owner='reviewer@example.com'","UPDATE third_party_profiles SET status='offboarded'","UPDATE simple_grc_records SET data_json='{}' WHERE module='Tedarikçiler'","DELETE FROM simple_grc_records WHERE module='Tedarikçiler'","UPDATE local_users SET status='Disabled' WHERE id='reviewer'","UPDATE local_users SET role='Viewer' WHERE id='reviewer'","UPDATE evidence_versions SET period='changed'","UPDATE simple_evidence_files SET content=x'00'"]){
    const f=await setup();try{const events=f.count('third_party_events'),pins=f.count('workflow_evidence_pins');f.before(()=>f.sqlite.exec(sql));assert.equal((await f.post(f.extension())).status,409,sql);assert.equal(f.count('third_party_events'),events);assert.equal(f.count('workflow_evidence_pins'),pins);assert.notEqual(f.row('third_party_profiles').contract_end,date(730));}finally{f.sqlite.close()}
  }
});
test('each dependent write failure rolls back dates, history and evidence together',async()=>{
  for(const table of ['third_party_profiles','simple_grc_records','third_party_events','workflow_evidence_pins']){const f=await setup();try{
    const profile=f.row('third_party_profiles'),core=f.row('simple_grc_records'),events=f.count('third_party_events'),pins=f.count('workflow_evidence_pins');
    f.sqlite.exec(`CREATE TRIGGER fail_extension BEFORE ${['third_party_profiles','simple_grc_records'].includes(table)?'UPDATE':'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'forced extension failure'); END`);
    assert.equal((await f.post(f.extension())).status,400);assert.deepEqual(f.row('third_party_profiles'),profile);assert.deepEqual(f.row('simple_grc_records'),core);assert.equal(f.count('third_party_events'),events);assert.equal(f.count('workflow_evidence_pins'),pins);
  }finally{f.sqlite.close()}}
});
test('repeated and later extensions retain distinct evidence history, including escaped long notes',async()=>{
  const f=await setup();try{
    const note='Reviewed executed extension. '+ '"\\'.repeat(570),body=f.extension({note});assert.equal((await f.post(body)).status,200);const events=f.count('third_party_events'),pins=f.count('workflow_evidence_pins');assert.equal((await f.post(body)).status,409);assert.equal(f.count('third_party_events'),events);assert.equal(f.count('workflow_evidence_pins'),pins);
    const first=((await f.get(`view=contract-history&vendorId=${f.vendorId}`)).body.rows as Record<string,unknown>[])[0];assert.equal((first.detail as {note:string}).note,note);
    assert.equal((await f.post(f.extension({contractExtension:{previousDate:date(730),nextDate:date(900)}}))).status,200);
    const rows=(await f.get(`view=contract-history&vendorId=${f.vendorId}`)).body.rows as Record<string,unknown>[];assert.equal(rows.length,2);assert.deepEqual(rows[1],first);assert.notEqual((rows[0].pin as {eventId:string}).eventId,(rows[1].pin as {eventId:string}).eventId);
    f.setActor(actor('owner','Editor'));assert.equal((await f.post({action:'renew-assessment',vendorId:f.vendorId,...f.scoring})).status,409);assert.equal(f.row('third_party_profiles').status,'in-review');
  }finally{f.sqlite.close()}
});
test('history is vendor-scoped, paginated, read-only and explicit about unavailable legacy detail',async()=>{
  const f=await setup();try{
    assert.deepEqual((await f.get(`view=contract-history&vendorId=${f.vendorId}`)).body.rows,[]);
    assert.equal((await f.post(f.extension())).status,200);
    const history=f.sqlite.prepare("SELECT * FROM third_party_events WHERE action='vendor-contract-extended'").get()!;
    for(let i=0;i<51;i++)f.sqlite.prepare('INSERT INTO third_party_events(id,vendor_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?)').run('historical-'+String(i).padStart(3,'0'),f.vendorId,history.action,i===0?'invalid':history.detail,history.actor,'2020-01-01T00:00:00Z');
    f.setActor(actor('viewer','Viewer'));let r=await f.get(`view=contract-history&vendorId=${f.vendorId}`);assert.equal((r.body.rows as unknown[]).length,50);assert.equal(r.body.hasMore,true);
    r=await f.get(`view=contract-history&vendorId=${f.vendorId}&page=1`);assert.equal((r.body.rows as unknown[]).length,2);assert.equal(r.body.hasMore,false);assert.equal((r.body.rows as {detail:unknown}[])[1].detail,null);
    for(const query of [`view=contract-history&vendorId=${f.vendorId}&page=-1`,`view=contract-history&vendorId=${f.vendorId}&page=1&page=2`,`view=contract-history&vendorId=${f.vendorId}&format=csv`,'view=contract-history'])assert.equal((await f.get(query)).status,400);
    assert.equal((await f.get('view=contract-history&vendorId=missing')).status,404);
  }finally{f.sqlite.close()}
});
test('malformed retained evidence is disclosed without losing the contract event',async()=>{
  const f=await setup();try{
    assert.equal((await f.post(f.extension())).status,200);
    f.sqlite.exec('DROP TRIGGER workflow_evidence_pin_immutable');
    for(const value of ['null','{}','{broken']){
      f.sqlite.prepare("UPDATE workflow_evidence_pins SET snapshot_json=? WHERE purpose='vendor-contract-extended'").run(value);
      const r=await f.get(`view=contract-history&vendorId=${f.vendorId}`);assert.equal(r.status,200);
      const rows=r.body.rows as {pin:unknown;detail:{nextDate:string}}[];assert.equal(rows.length,1);assert.equal(rows[0].pin,null);assert.equal(rows[0].detail.nextDate,date(730));
    }
  }finally{f.sqlite.close()}
});
