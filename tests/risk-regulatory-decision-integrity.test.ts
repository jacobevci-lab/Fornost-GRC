import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './helpers/enterprise-route-fixture';
const stamp='2026-10-12T00:00:00.000Z';
const evidence={note:'Independent evidence and decision reviewed.',evidenceReference:'EVD-1',evidenceSha256:'a'.repeat(64)};
function seed(db:DatabaseSync,table:string,values:Record<string,string|number|null>){
 const row:Record<string,string|number|null>={};
 for(const c of db.prepare(`PRAGMA table_info(${table})`).all())if(c.notnull&&!c.dflt_value)row[String(c.name)]=String(c.type)==='INTEGER'?1:'fixture';
 Object.assign(row,{...values});const keys=Object.keys(row);db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
}
const count=(db:DatabaseSync,table:string)=>Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
async function riskFixture(status='approved'){const f=fixture('risk-appetite');await f.post({});seed(f.sqlite,'risk_appetite_statements',{id:'RA-1',code:'RA-1',status,reviewer:'reviewer@example.com',owner:'owner@example.com',created_by:'maker@example.com',submitted_by:'maker@example.com',direction:'upper',warning_threshold:5,breach_threshold:10,frequency_days:30,valid_from:'2026-01-01',valid_until:'2027-01-01',updated_at:stamp});return f;}
async function regFixture(){const f=fixture('regulatory-intelligence');await f.post({});seed(f.sqlite,'regulatory_changes',{id:'RC-1',source_id:'SRC-1',status:'implementation',reviewer:'reviewer@example.com',detected_by:'maker@example.com',effective_date:'2027-01-01',updated_at:stamp});return f;}
function impact(db:DatabaseSync,status='verification',id='RI-1'){seed(db,'regulatory_change_impacts',{id,change_id:'RC-1',target_type:'control',target_ref:id,status,action_owner:'owner@example.com',created_by:'maker@example.com',submitted_by:'maker@example.com',updated_at:stamp});}
const measurement={action:'record-measurement',appetiteId:'RA-1',periodStart:'2026-10-01',periodEnd:'2026-10-01',value:12,sourceRef:'EVD-1',...evidence};
const closeChange={action:'change-action',changeId:'RC-1',operation:'close',confirmation:'DEĞİŞİKLİĞİ KAPAT',...evidence};
const verifyImpact={action:'impact-action',impactId:'RI-1',operation:'verify',confirmation:'ETKİYİ DOĞRULA',...evidence};

const reopenChange={action:'change-action',changeId:'RC-1',operation:'reopen',confirmation:'DEĞİŞİKLİĞİ YENİDEN AÇ',note:'Reassessment required after new regulatory evidence.'};
const excludeChange={action:'change-action',changeId:'RC-1',operation:'not-applicable',confirmation:'KAPSAM DIŞI',note:'Documented assessment confirms this regulation is out of scope.'};
test('regulatory terminal decisions reject invalid origins without changing history',async()=>{
 for(const status of ['triage','impact-assessment','implementation','verification','closed','not-applicable']){
  for(const operation of ['close','reopen','not-applicable']){
   const allowed=operation==='close'?status==='verification':operation==='reopen'?['closed','not-applicable'].includes(status):['triage','impact-assessment'].includes(status);
   const f=await regFixture();try{
    f.sqlite.prepare('UPDATE regulatory_changes SET status=?').run(status);
    if(operation==='close')impact(f.sqlite,'completed');
    const parent=f.sqlite.prepare('SELECT * FROM regulatory_changes').get();
    const response=await f.post(operation==='close'?closeChange:operation==='reopen'?reopenChange:excludeChange);
    assert.equal(response.status,allowed?200:409,`${status} / ${operation}`);
    assert.equal(count(f.sqlite,'regulatory_change_events'),allowed?1:0);
    if(!allowed)assert.deepEqual(f.sqlite.prepare('SELECT * FROM regulatory_changes').get(),parent);
   }finally{f.sqlite.close();}
  }
 }
});
test('reopening excluded changes resets applicability and preserves the previous decision event',async()=>{
 const f=await regFixture();try{
  f.sqlite.exec("UPDATE regulatory_changes SET status='triage'");
  assert.equal((await f.post(excludeChange)).status,200);
  assert.equal((await f.post({...reopenChange,note:''})).status,400);
  assert.equal((await f.post(reopenChange)).status,200);
  const row=f.sqlite.prepare('SELECT * FROM regulatory_changes').get()!;
  assert.equal(row.status,'triage');assert.equal(row.applicability,'undetermined');assert.equal(row.applicability_rationale,'');
  const history=f.sqlite.prepare('SELECT action,detail FROM regulatory_change_events ORDER BY created_at').all();
  assert.equal(history.length,2);assert.ok(history.some(e=>e.action==='change-not-applicable'&&e.detail===excludeChange.note));
  assert.equal((await f.post(reopenChange)).status,409);assert.equal(count(f.sqlite,'regulatory_change_events'),2);
 }finally{f.sqlite.close();}
});
test('reopened changes resume from actual impact completion and clear current closure metadata',async()=>{
 for(const open of [false,true]){const f=await regFixture();try{
  f.sqlite.exec("UPDATE regulatory_changes SET status='closed',applicability='applicable',closed_by='reviewer@example.com',closed_at='2026-10-12',closure_note='Prior closure'");
  impact(f.sqlite,open?'open':'completed');
  const response=await f.post(reopenChange);assert.equal(response.status,200);
  const row=f.sqlite.prepare('SELECT * FROM regulatory_changes').get()!;
  assert.equal(row.status,open?'implementation':'verification');assert.equal(row.applicability,'applicable');
  assert.equal(row.closed_by,null);assert.equal(row.closed_at,null);assert.equal(row.closure_note,null);
  assert.equal(count(f.sqlite,'regulatory_change_events'),1);
 }finally{f.sqlite.close();}}
});
test('reopen rechecks concurrent impact counts and completion before updating parent',async()=>{
 for(const mode of ['added','changed']){const f=await regFixture();try{
  f.sqlite.exec("UPDATE regulatory_changes SET status='closed'");impact(f.sqlite,'completed');
  const parent=f.sqlite.prepare('SELECT * FROM regulatory_changes').get();
  f.before(()=>mode==='added'?impact(f.sqlite,'open','RI-2'):f.sqlite.exec("UPDATE regulatory_change_impacts SET status='open'"));
  assert.equal((await f.post(reopenChange)).status,409);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM regulatory_changes').get(),parent);
  assert.equal(count(f.sqlite,'regulatory_change_events'),0);
 }finally{f.sqlite.close();}}
});
test('reopen audit failure restores terminal status and all decision metadata',async()=>{
 const f=await regFixture();try{
  f.sqlite.exec("UPDATE regulatory_changes SET status='not-applicable',applicability='not-applicable',applicability_rationale='Prior assessment'");
  const parent=f.sqlite.prepare('SELECT * FROM regulatory_changes').get();
  f.sqlite.exec("CREATE TRIGGER fail_reopen_event BEFORE INSERT ON regulatory_change_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.equal((await f.post(reopenChange)).status,400);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM regulatory_changes').get(),parent);
  assert.equal(count(f.sqlite,'regulatory_change_events'),0);
 }finally{f.sqlite.close();}
});

test('historical KRI breaches preserve the latest measurement schedule',async()=>{
 const f=await riskFixture();try{
  assert.equal((await f.post({...measurement,value:1})).status,200);
  const due=f.sqlite.prepare('SELECT next_measurement FROM risk_appetite_statements').get()!.next_measurement;
  const historical=await f.post({...measurement,periodStart:'2026-09-01',periodEnd:'2026-09-01'});
  assert.equal(historical.status,200);
  assert.equal(f.sqlite.prepare('SELECT next_measurement FROM risk_appetite_statements').get()!.next_measurement,due);
  assert.equal(f.sqlite.prepare('SELECT band FROM risk_kri_measurements ORDER BY period_end DESC LIMIT 1').get()!.band,'green');
  assert.equal(count(f.sqlite,'risk_kri_breaches'),1);
  assert.equal(count(f.sqlite,'risk_appetite_events'),2);
  assert.equal((await f.post({...measurement,periodStart:'2026-10-02',periodEnd:'2026-10-02',value:1})).status,200);
  assert.equal(f.sqlite.prepare('SELECT next_measurement FROM risk_appetite_statements').get()!.next_measurement,'2026-11-01');
 }finally{f.sqlite.close();}
});
test('KRI duplicate periods return conflict without altering measurements, breaches, events or parent',async()=>{
 const f=await riskFixture();try{
  assert.equal((await f.post(measurement)).status,200);
  const parent=f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get();
  assert.equal((await f.post({...measurement,value:1})).status,409);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get(),parent);
  assert.equal(count(f.sqlite,'risk_kri_measurements'),1);
  assert.equal(count(f.sqlite,'risk_kri_breaches'),1);
  assert.equal(count(f.sqlite,'risk_appetite_events'),1);
 }finally{f.sqlite.close();}
});
test('KRI period uniqueness is checked again at write time',async()=>{
 const f=await riskFixture();try{
  const parent=f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get();
  f.before(()=>seed(f.sqlite,'risk_kri_measurements',{id:'RACING-MEASUREMENT',appetite_id:'RA-1',period_start:measurement.periodStart,period_end:measurement.periodEnd,value:1,band:'green'}));
  assert.equal((await f.post(measurement)).status,409);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get(),parent);
  assert.equal(count(f.sqlite,'risk_kri_measurements'),1);
  assert.equal(count(f.sqlite,'risk_kri_breaches'),0);
  assert.equal(count(f.sqlite,'risk_appetite_events'),0);
 }finally{f.sqlite.close();}
});
test('the entire KRI period must fit within appetite validity, including inclusive boundaries',async()=>{
 for(const invalid of [true,false]){const f=await riskFixture();try{
  f.sqlite.exec("UPDATE risk_appetite_statements SET valid_from='2026-09-01', valid_until='2026-10-01'");
  const parent=f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get();
  assert.equal((await f.post({...measurement,periodStart:invalid?'2026-08-31':'2026-09-01'})).status,invalid?409:200);
  assert.equal(count(f.sqlite,'risk_kri_measurements'),invalid?0:1);
  if(invalid)assert.deepEqual(f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get(),parent);
 }finally{f.sqlite.close();}}
});
test('failed historical KRI audit rolls back the measurement and breach while preserving schedule',async()=>{
 const f=await riskFixture();try{
  assert.equal((await f.post({...measurement,value:1})).status,200);
  const parent=f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get();
  f.sqlite.exec("CREATE TRIGGER fail_backfill_event BEFORE INSERT ON risk_appetite_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.equal((await f.post({...measurement,periodStart:'2026-09-01',periodEnd:'2026-09-01'})).status,400);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM risk_appetite_statements').get(),parent);
  assert.equal(count(f.sqlite,'risk_kri_measurements'),1);
  assert.equal(count(f.sqlite,'risk_kri_breaches'),0);
  assert.equal(count(f.sqlite,'risk_appetite_events'),1);
 }finally{f.sqlite.close();}
});

test('KRI measurements atomically create breach and event, or roll back all writes',async()=>{for(const mode of ['red','green','audit','breach','retired','threshold']){const f=await riskFixture();try{if(mode==='audit'||mode==='breach')f.sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${mode==='audit'?'risk_appetite_events':'risk_kri_breaches'} BEGIN SELECT RAISE(ABORT,'injected failure'); END`);if(mode==='retired'||mode==='threshold')f.before(()=>f.sqlite.exec(mode==='retired'?"UPDATE risk_appetite_statements SET status='retired'":"UPDATE risk_appetite_statements SET breach_threshold=20"));const result=await f.post({...measurement,value:mode==='green'?1:12});const success=['red','green'].includes(mode);assert.equal(result.status,success?200:['retired','threshold'].includes(mode)?409:400);assert.equal(count(f.sqlite,'risk_kri_measurements'),success?1:0);assert.equal(count(f.sqlite,'risk_kri_breaches'),mode==='red'?1:0);assert.equal(count(f.sqlite,'risk_appetite_events'),success?1:0);}finally{f.sqlite.close();}}});
test('risk appetite approval uses current reviewer and rolls back failed event',async()=>{for(const mode of ['success','reviewer','audit']){const f=await riskFixture('review');try{if(mode==='reviewer')f.before(()=>f.sqlite.exec("UPDATE risk_appetite_statements SET reviewer='other@example.com'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON risk_appetite_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");assert.equal((await f.post({action:'appetite-action',appetiteId:'RA-1',operation:'approve',confirmation:'RİSK İŞTAHINI ONAYLA',...evidence})).status,mode==='success'?200:mode==='reviewer'?409:400);assert.equal(f.sqlite.prepare('SELECT status FROM risk_appetite_statements').get()!.status,mode==='success'?'approved':'review');}finally{f.sqlite.close();}}});
test('retirement rechecks newly opened KRI breaches',async()=>{const f=await riskFixture();try{f.before(()=>seed(f.sqlite,'risk_kri_breaches',{id:'B-1',appetite_id:'RA-1',measurement_id:'M-1',status:'open',updated_at:stamp}));assert.equal((await f.post({action:'appetite-action',appetiteId:'RA-1',operation:'retire',confirmation:'RİSK İŞTAHINI YÜRÜRLÜKTEN KALDIR',...evidence})).status,409);assert.equal(count(f.sqlite,'risk_appetite_events'),0);}finally{f.sqlite.close();}});
test('KRI breach close rechecks parent reviewer and commits event atomically',async()=>{for(const mode of ['success','reviewer','audit']){const f=await riskFixture();try{seed(f.sqlite,'risk_kri_breaches',{id:'B-1',appetite_id:'RA-1',measurement_id:'M-1',status:'verification',detected_by:'maker@example.com',response_owner:'owner@example.com',submitted_by:'maker@example.com',updated_at:stamp});if(mode==='reviewer')f.before(()=>f.sqlite.exec("UPDATE risk_appetite_statements SET reviewer='other@example.com'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON risk_appetite_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");assert.equal((await f.post({action:'breach-action',breachId:'B-1',operation:'close-breach',confirmation:'İHLALİ KAPAT',...evidence})).status,mode==='success'?200:mode==='reviewer'?409:400);assert.equal(f.sqlite.prepare('SELECT status FROM risk_kri_breaches').get()!.status,mode==='success'?'closed':'verification');}finally{f.sqlite.close();}}});
test('regulatory closure rechecks open impacts and records exactly one event',async()=>{for(const mode of ['success','new-impact','reopen','audit']){const f=await regFixture();try{f.sqlite.exec("UPDATE regulatory_changes SET status='verification'");impact(f.sqlite,'completed');if(mode==='new-impact')f.before(()=>impact(f.sqlite,'open','RI-2'));if(mode==='reopen')f.before(()=>f.sqlite.exec("UPDATE regulatory_change_impacts SET status='in-progress'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON regulatory_change_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");assert.equal((await f.post(closeChange)).status,mode==='success'?200:mode==='audit'?400:409);assert.equal(f.sqlite.prepare('SELECT status FROM regulatory_changes').get()!.status,mode==='success'?'closed':'verification');assert.equal(count(f.sqlite,'regulatory_change_events'),mode==='success'?1:0);}finally{f.sqlite.close();}}});
test('impact verification updates parent and audit atomically and rejects concurrent parent changes',async()=>{for(const mode of ['success','other-open','closed','reviewer','audit','parent-failure']){const f=await regFixture();try{impact(f.sqlite);if(mode==='other-open')impact(f.sqlite,'open','RI-2');if(mode==='closed'||mode==='reviewer')f.before(()=>f.sqlite.exec(mode==='closed'?"UPDATE regulatory_changes SET status='closed'":"UPDATE regulatory_changes SET reviewer='other@example.com'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON regulatory_change_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");if(mode==='parent-failure')f.sqlite.exec("CREATE TRIGGER fail_parent BEFORE UPDATE ON regulatory_changes BEGIN SELECT RAISE(ABORT,'injected failure'); END");const result=await f.post(verifyImpact),success=['success','other-open'].includes(mode);assert.equal(result.status,success?200:['closed','reviewer'].includes(mode)?409:400);assert.equal(f.sqlite.prepare("SELECT status FROM regulatory_change_impacts WHERE id='RI-1'").get()!.status,success?'completed':'verification');assert.equal(count(f.sqlite,'regulatory_change_events'),success?1:0);if(success)assert.equal(result.body.parentStatus,mode==='success'?'verification':'implementation');}finally{f.sqlite.close();}}});
test('adding an impact cannot resurrect a closed change, and event failure rolls back parent and child',async()=>{for(const mode of ['success','closed','audit']){const f=await regFixture();try{if(mode==='closed')f.before(()=>f.sqlite.exec("UPDATE regulatory_changes SET status='closed'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON regulatory_change_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");const result=await f.post({action:'add-impact',changeId:'RC-1',targetType:'control',targetRef:'CTL-1',targetTitle:'Access control',impactLevel:'high',requiredAction:'Review access control implementation.',actionOwner:'owner@example.com',dueDate:'2026-12-01'});assert.equal(result.status,mode==='success'?201:mode==='closed'?409:400);assert.equal(count(f.sqlite,'regulatory_change_impacts'),mode==='success'?1:0);assert.equal(f.sqlite.prepare('SELECT status FROM regulatory_changes').get()!.status,mode==='success'?'impact-assessment':mode==='closed'?'closed':'implementation');}finally{f.sqlite.close();}}});
test('scenario verification and breach planning roll back on event failures',async()=>{for(const kind of ['scenario','plan'])for(const failure of [false,true]){const f=await riskFixture();try{if(kind==='scenario')seed(f.sqlite,'risk_appetite_scenarios',{id:'S-1',appetite_id:'RA-1',status:'review',reviewer:'reviewer@example.com',owner:'owner@example.com',created_by:'maker@example.com',submitted_by:'maker@example.com',updated_at:stamp});else seed(f.sqlite,'risk_kri_breaches',{id:'B-1',appetite_id:'RA-1',measurement_id:'M-1',status:'open',updated_at:stamp});if(failure)f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON risk_appetite_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");const result=await f.post(kind==='scenario'?{action:'scenario-action',scenarioId:'S-1',operation:'verify-scenario',confirmation:'SENARYOYU DOĞRULA',...evidence}:{action:'plan-breach',breachId:'B-1',responseOwner:'owner@example.com',responsePlan:'Reduce exposure and validate evidence independently.',dueDate:'2026-12-01'});assert.equal(result.status,failure?400:200);assert.equal(count(f.sqlite,'risk_appetite_events'),failure?0:1);assert.equal(f.sqlite.prepare(`SELECT status FROM ${kind==='scenario'?'risk_appetite_scenarios':'risk_kri_breaches'}`).get()!.status,kind==='scenario'?(failure?'review':'verified'):(failure?'open':'in-progress'));}finally{f.sqlite.close();}}});
test('board approval binds the exact verified snapshot and rolls back failed audit',async()=>{const content='{"a":1}',digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))).toString('hex');for(const mode of ['success','tamper','reviewer','audit']){const f=await riskFixture();try{seed(f.sqlite,'risk_board_snapshots',{id:'BS-1',status:'draft',reviewer:'reviewer@example.com',prepared_by:'maker@example.com',snapshot_json:content,snapshot_sha256:digest});if(mode==='tamper')f.before(()=>f.sqlite.exec("UPDATE risk_board_snapshots SET snapshot_json='{}'"));if(mode==='reviewer')f.before(()=>f.sqlite.exec("UPDATE risk_board_snapshots SET reviewer='other@example.com'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON risk_appetite_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");assert.equal((await f.post({action:'approve-board',snapshotId:'BS-1',confirmation:'YÖNETİM KURULU PAKETİNİ ONAYLA',...evidence})).status,mode==='success'?200:mode==='audit'?400:409);assert.equal(f.sqlite.prepare('SELECT status FROM risk_board_snapshots').get()!.status,mode==='success'?'approved':'draft');assert.equal(count(f.sqlite,'risk_appetite_events'),mode==='success'?1:0);}finally{f.sqlite.close();}}});
