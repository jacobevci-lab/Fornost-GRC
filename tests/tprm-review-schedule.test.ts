import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { ensureWorkflowEvidenceSchema } from '../app/workflow-selection-store';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';
import { nextReviewMinimum, validNextReview, parseReviewScheduleRecord } from '../app/third-party-risk/review-schedule';
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
  return { ...f, row, count, vendorId, assessmentId, decision, scoring };
}

test('review dates use real calendar days, permit earlier future reviews and include the contract end', () => {
  assert.equal(nextReviewMinimum('2028-02-28'),'2028-02-29'); assert.equal(nextReviewMinimum('2026-12-31'),'2027-01-01');
  assert.equal(validNextReview('2026-11-01','2026-11-01','2026-10-29'),true);
  for (const value of ['2026-02-31','2026-10-29','2026-10-28','2026-11-02','2026-11-01T00:00:00Z',null]) assert.equal(validNextReview(value,'2026-11-01','2026-10-29'),false);
});
test('approval atomically schedules profile and connected vendor, retains history and updates My Work', async () => {
  const f = await setup(); try {
    const original = JSON.parse(String(f.row('simple_grc_records').data_json)), result = await f.post(f.decision()); assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.nextReviewDate,date(90)); assert.equal(f.row('third_party_profiles').next_review,date(90));
    assert.deepEqual(JSON.parse(String(f.row('simple_grc_records').data_json)),{...original,nextAssessment:date(90)});
    const read = await f.get(), a = (read.body.assessments as Record<string,unknown>[]).find(x => x.id === f.assessmentId)!, history = a.reviewSchedule as Record<string,unknown>;
    assert.equal(history.previousDate,date(-1)); assert.equal(history.nextDate,date(90)); assert.equal(history.contractEnd,date(365)); assert.equal(history.actor,'reviewer@example.com'); assert.equal(history.cycleNumber,1); assert.ok(history.createdAt);
    const work = projectEnterpriseWork('vendor',(await f.get('view=work')).body); assert.equal(work.rows.find(x => x.workKind === 'vendor-review')?.data.dueDate,date(90));
    assert.equal((read.body.profiles as Record<string,unknown>[])[0].attention,'approved');
    f.setActor(actor('owner','Editor')); assert.equal((await f.post({action:'renew-assessment',vendorId:f.vendorId,...f.scoring})).status,201);
    const renewed = ((await f.get()).body.assessments as Record<string,unknown>[]).find(x => x.id === f.assessmentId)!; assert.equal(renewed.status,'superseded'); assert.deepEqual(renewed.reviewSchedule,history);
  } finally { f.sqlite.close(); }
});
test('conditional approval can bring a future review forward or choose contract end without rewriting prior history', async () => {
  for (const next of [date(10),date(365)]) { const f = await setup(date(90)); try {
    const body = f.decision({operation:'conditional',confirmation:'KOŞULLU ONAYLA'}); body.reviewSchedule.nextDate = next;
    assert.equal((await f.post(body)).status,200); assert.equal(f.row('third_party_profiles').next_review,next);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM third_party_events WHERE action='assessment-conditional'").get()!.n,1);
  } finally { f.sqlite.close(); } }
});
test('invalid scheduling input never advances decision, date, event or evidence', async () => {
  const cases: unknown[] = [null,[],{},'2026-11-01'];
  const f = await setup(); try {
    const initialEvents = f.count('third_party_events'), initialPins = f.count('workflow_evidence_pins'), good = f.decision().reviewSchedule;
    cases.push(...['',date(0),date(-1),date(366),'2026-02-31'].map(nextDate => ({...good,nextDate})),{...good,extra:true},{...good,profileRevision:''});
    for (const reviewSchedule of cases) { const r = await f.post(f.decision({reviewSchedule})); assert.equal(r.status,400,JSON.stringify(reviewSchedule)); assert.equal(r.body.code,'TPRM_REVIEW_DATE'); }
    assert.equal(f.row('third_party_assessments',f.assessmentId).status,'submitted'); assert.equal(f.row('third_party_profiles').next_review,date(-1)); assert.equal(f.count('third_party_events'),initialEvents); assert.equal(f.count('workflow_evidence_pins'),initialPins);
  } finally { f.sqlite.close(); }
});
test('profile revision, old date, contract and assessment changes require an explicit fresh decision', async () => {
  for (const field of ['profileRevision','previousDate','contractEnd','assessment']) { const f = await setup(); try {
    const body = f.decision(); if (field === 'assessment') body.expectedRevision = '2020-01-01T00:00:00Z'; else Object.assign(body.reviewSchedule,{[field]:field==='profileRevision'?'2020-01-01T00:00:00Z':date(364)});
    assert.equal((await f.post(body)).status,409,field); assert.equal(f.row('third_party_assessments',f.assessmentId).status,'submitted'); assert.equal(f.row('third_party_profiles').next_review,date(-1));
  } finally { f.sqlite.close(); } }
});
test('scheduling requires canonical evidence and cannot be attached to another operation', async () => {
  const f = await setup(); try {
    for (const patch of [{evidenceMode:'manual'},{action:'renew-assessment'},{action:'finding-action'},{operation:'reject'},{operation:'submit'},{action:'offboard'}]) assert.equal((await f.post(f.decision(patch))).status,400);
    assert.equal(f.row('third_party_assessments',f.assessmentId).status,'submitted');
  } finally { f.sqlite.close(); }
});
test('decision-time date, contract, core source and actor changes leave no partial scheduling', async () => {
  for (const sql of ["UPDATE third_party_profiles SET next_review='2099-01-01'", "UPDATE third_party_profiles SET contract_end='2099-01-01'", "UPDATE third_party_profiles SET reviewer='other@example.com'", "UPDATE simple_grc_records SET data_json='{}' WHERE module='Tedarikçiler'", "DELETE FROM simple_grc_records WHERE module='Tedarikçiler'", "UPDATE local_users SET status='Disabled' WHERE id='reviewer'"]) {
    const f = await setup(); try { const events = f.count('third_party_events'), pins = f.count('workflow_evidence_pins'); f.before(() => f.sqlite.exec(sql)); assert.equal((await f.post(f.decision())).status,409,sql); assert.equal(f.row('third_party_assessments',f.assessmentId).status,'submitted'); assert.equal(f.row('third_party_profiles').status,'in-review'); assert.equal(f.count('third_party_events'),events); assert.equal(f.count('workflow_evidence_pins'),pins); } finally { f.sqlite.close(); }
  }
});
test('profile, connected record, history and evidence write failures roll back the whole decision', async () => {
  for (const table of ['third_party_profiles','simple_grc_records','third_party_events','workflow_evidence_pins']) { const f = await setup(); try {
    const events = f.count('third_party_events'), pins = f.count('workflow_evidence_pins'), core = f.row('simple_grc_records').data_json;
    f.sqlite.exec(`CREATE TRIGGER fail_schedule BEFORE ${table==='third_party_profiles'||table==='simple_grc_records'?'UPDATE':'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'forced schedule failure'); END`);
    assert.equal((await f.post(f.decision())).status,400,table); assert.equal(f.row('third_party_assessments',f.assessmentId).status,'submitted'); assert.equal(f.row('third_party_profiles').next_review,date(-1)); assert.equal(f.row('simple_grc_records').data_json,core); assert.equal(f.count('third_party_events'),events); assert.equal(f.count('workflow_evidence_pins'),pins);
  } finally { f.sqlite.close(); } }
});
test('reviewer independence and duplicate decisions retain one dated event', async () => {
  const f = await setup(); try {
    for (const account of [actor('owner','Editor'),actor('maker'),actor('lead','Editor')]) { f.setActor(account); assert.ok([403,409].includes((await f.post(f.decision())).status)); }
    f.setActor(actor('reviewer')); const body = f.decision(); assert.equal((await f.post(body)).status,200); const events = f.count('third_party_events'), pins = f.count('workflow_evidence_pins'); assert.equal((await f.post(body)).status,409); assert.equal(f.count('third_party_events'),events); assert.equal(f.count('workflow_evidence_pins'),pins); assert.equal(f.row('third_party_profiles').next_review,date(90));
  } finally { f.sqlite.close(); }
});
test('legacy decisions keep the existing date and missing or malformed history is never invented', async () => {
  const f = await setup(); try {
    const {reviewSchedule:_schedule,...legacy} = f.decision(); assert.ok(_schedule); assert.equal((await f.post(legacy)).status,200); assert.equal(f.row('third_party_profiles').next_review,date(-1));
    assert.equal(((await f.get()).body.assessments as Record<string,unknown>[])[0].reviewSchedule,null);
    for (const detail of ['{broken','{"schema":"tprm-review-schedule-v1"}']) { f.sqlite.prepare("UPDATE third_party_events SET detail=? WHERE action='assessment-approved'").run(detail); assert.equal(((await f.get()).body.assessments as Record<string,unknown>[])[0].reviewSchedule,null); }
    assert.equal(parseReviewScheduleRecord('bad'),null);
  } finally { f.sqlite.close(); }
});
test('escaped long decision notes retain valid structured schedule history without truncation', async () => {
  const f = await setup(); try {
    const note = 'Approved. ' + '"\\'.repeat(590);
    assert.equal((await f.post(f.decision({note}))).status,200);
    const history = ((await f.get()).body.assessments as Record<string,unknown>[])[0].reviewSchedule as Record<string,unknown>;
    assert.ok(history); assert.equal(history.note,note); assert.equal(history.nextDate,date(90));
  } finally { f.sqlite.close(); }
});
