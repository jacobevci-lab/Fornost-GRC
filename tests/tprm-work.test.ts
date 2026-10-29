import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers/enterprise-route-fixture';
import { projectEnterpriseWork } from '../app/enterprise-work';
import { workCompletionDate, matchesWorkIdentity } from '../app/work-queue';
import { TPRM_CONTROLS } from '../app/third-party-risk/domain';

const dates = { createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-10-29T00:00:00Z' };
const profile = { ...dates, vendorId:'V-1', name:'Supplier', status:'approved', criticality:'high', businessOwner:'business@example.com', riskOwner:'owner@example.com', reviewer:'reviewer@example.com', nextReview:'2026-12-01', contractEnd:'2027-12-01', completedAt:null };
const assessment = { ...dates, id:'A-1', vendorId:'V-1', cycleNumber:1, status:'submitted', riskTier:'high', completedAt:null, decidedBy:null };
const finding = { ...dates, id:'F-1', vendorId:'V-1', assessmentId:'A-1', title:'Remediate supplier issue', status:'verification', severity:'high', owner:'owner@example.com', dueDate:'2026-12-01', completedAt:null, verifiedBy:null };
const project = (patch:Record<string,unknown>={}) => projectEnterpriseWork('vendor',{ profiles:[profile], assessments:[assessment], findings:[finding], complete:true, ...patch });
function seed(db:DatabaseSync, table:string, values:Record<string,string|number|null>) {
  const row:Record<string,string|number|null>={};
  for(const column of db.prepare(`PRAGMA table_info(${table})`).all()) if(column.notnull&&!column.dflt_value)row[String(column.name)]=column.type==='INTEGER'?0:'fixture';
  Object.assign(row,values);db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
}
function seedProfile(db:DatabaseSync, patch:Record<string,string|number|null>={}) {
  seed(db,'third_party_profiles',{ vendor_id:profile.vendorId,name:profile.name,status:profile.status,criticality:profile.criticality,business_owner:profile.businessOwner,risk_owner:profile.riskOwner,reviewer:profile.reviewer,next_review:profile.nextReview,contract_end:profile.contractEnd,created_at:dates.createdAt,updated_at:dates.updatedAt,created_by:profile.riskOwner,...patch });
}
function seedAssessment(db:DatabaseSync, patch:Record<string,string|number|null>={}) {
  seed(db,'third_party_assessments',{ id:assessment.id,vendor_id:profile.vendorId,cycle_number:1,status:assessment.status,risk_tier:assessment.riskTier,created_at:dates.createdAt,updated_at:dates.updatedAt,created_by:profile.riskOwner,submitted_by:profile.riskOwner,critical_gaps_json:'[]',...patch });
}
function seedFinding(db:DatabaseSync, patch:Record<string,string|number|null>={}) {
  seed(db,'third_party_findings',{ id:finding.id,vendor_id:profile.vendorId,assessment_id:assessment.id,title:finding.title,status:finding.status,severity:finding.severity,owner:finding.owner,due_date:finding.dueDate,created_at:dates.createdAt,updated_at:dates.updatedAt,created_by:profile.riskOwner,submitted_by:profile.riskOwner,...patch });
}
const evidence = { note:'Independent source and decision checked.', evidenceReference:'synthetic evidence', evidenceSha256:'a'.repeat(64) };

test('TPRM handoff retains the actual deciding and verifying reviewer in completed work',()=>{
  for(const status of ['draft','submitted','approved','conditional','rejected','superseded']) {
    const closed=!['draft','submitted'].includes(status), result=project({assessments:[{...assessment,status,decidedBy:closed?'former-reviewer@example.com':null,completedAt:closed?'2026-02-01T00:00:00Z':null}],findings:[]});
    assert.equal(result.complete,true);const row=result.rows.find(r=>r.workKind==='vendor-assessment')!;
    assert.equal(row.data.workClosed,closed);assert.equal(row.data.reviewer,status==='submitted'?profile.reviewer:closed?'former-reviewer@example.com':'');assert.equal(row.data.workWaitingForReview,status==='submitted');assert.equal(row.data.dueDate,undefined);
    assert.equal(matchesWorkIdentity([String(row.data.reviewer)],{email:'former-reviewer@example.com.extra'}),false);
  }
  const result=project({findings:[{...finding,status:'closed',verifiedBy:'former-reviewer@example.com',completedAt:'2026-02-01T00:00:00Z'}]});
  assert.equal(result.rows.find(r=>r.workKind==='vendor-finding')?.data.reviewer,'former-reviewer@example.com');
});
test('missing or old completion dates never fall back to recent edits or record creation',()=>{
  for(const completedAt of [null,'','2020-01-01T00:00:00Z']) {
    const result=project({assessments:[{...assessment,status:'approved',completedAt,decidedBy:profile.reviewer}],findings:[{...finding,status:'closed',completedAt,verifiedBy:profile.reviewer}]});
    for(const row of result.rows.filter(r=>r.data.workClosed))assert.equal(workCompletionDate(row),completedAt||'');
  }
  assert.ok(project().rows.every(r=>workCompletionDate(r)===''));
});
test('terminal vendor profiles suppress unactionable child work without inventing completed decisions',()=>{
  for(const status of ['rejected','offboarded']) {
    const result=project({profiles:[{...profile,status}]});assert.equal(result.complete,true);assert.deepEqual(result.rows.map(r=>r.workKind),['vendor-review']);assert.equal(workCompletionDate(result.rows[0]),'');
    const closed=project({profiles:[{...profile,status}],assessments:[{...assessment,status:'approved',decidedBy:profile.reviewer}],findings:[{...finding,status:'closed',verifiedBy:profile.reviewer}]});assert.equal(closed.rows.length,3);
  }
});
test('malformed identities, stages, dates and relationships produce incomplete coverage',()=>{
  const cases=[{complete:false},{profiles:[profile,profile]},{profiles:[{...profile,reviewer:profile.riskOwner.toUpperCase()}]},
    ...[{status:'unknown'},{criticality:'urgent'},{nextReview:'2026-02-31'},{updatedAt:'2026-02-31T00:00:00Z'},{businessOwner:'owner@example.com;other@example.com'}].map(change=>({profiles:[{...profile,...change}]})),
    ...[{status:'unknown'},{cycleNumber:0},{riskTier:'urgent'},{vendorId:'missing'},{decidedBy:'bad'},{completedAt:dates.updatedAt}].map(change=>({assessments:[{...assessment,...change}]})),
    ...[{status:'unknown'},{assessmentId:'missing'},{owner:'bad'},{dueDate:'2026-02-31'},{title:''},{verifiedBy:'bad'},{completedAt:dates.updatedAt}].map(change=>({findings:[{...finding,...change}]}))];
  for(const patch of cases) assert.equal(project(patch).complete,false,JSON.stringify(patch));
  assert.equal(project({profiles:[profile,{...profile,vendorId:'V-2'}],findings:[{...finding,vendorId:'V-2'}]}).complete,false);
  assert.equal(projectEnterpriseWork('vendor',{profiles:[],assessments:[],findings:[]}).complete,false);
  assert.deepEqual(project({profiles:[],assessments:[],findings:[]}),{rows:[],complete:true});
});
test('work GET is read-only and omits questionnaires, contacts, narratives and evidence',async()=>{
  const f=fixture('third-party-risk');try{
    await f.get('view=work');seedProfile(f.sqlite,{contact:'private-contact@example.com',exit_plan:'private exit'});seedAssessment(f.sqlite,{questionnaire_json:'{"private":true}',treatment_plan:'private plan'});seedFinding(f.sqlite,{description:'private description',evidence_reference:'private evidence'});
    const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n,r=await f.get('view=work');assert.equal(r.status,200);assert.equal(r.body.complete,true);assert.equal(projectEnterpriseWork('vendor',r.body).complete,true);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
    assert.doesNotMatch(JSON.stringify(r.body),/private|questionnaire|contact|description|evidence|exitPlan|treatmentPlan|hostingLocation|dataAccess|decisionNote/i);
    for(const query of ['view=work&view=other','view=work&format=csv','view=work&focusKind=vendor-review&focusId=V-1'])assert.equal((await f.get(query)).status,400);
  }finally{f.sqlite.close();}
});
test('assessment decision and later renewal retain original completion time and deciding reviewer',async()=>{
  const f=fixture('third-party-risk');try{
    await f.get('view=work');seedProfile(f.sqlite,{status:'in-review'});seedAssessment(f.sqlite);
    const approved=await f.post({action:'assessment-action',assessmentId:assessment.id,operation:'approve',confirmation:'TEDARİKÇİYİ ONAYLA',...evidence});assert.equal(approved.status,200);
    let row=projectEnterpriseWork('vendor',(await f.get('view=work')).body).rows.find(r=>r.nativeRef===assessment.id)!;const date=String(f.sqlite.prepare('SELECT decided_at FROM third_party_assessments').get()!.decided_at);assert.equal(workCompletionDate(row),date);assert.equal(row.data.reviewer,profile.reviewer);
    f.sqlite.prepare('UPDATE third_party_assessments SET decided_at=?').run('2020-01-01T00:00:00Z');
    const renewal=await f.post({action:'renew-assessment',vendorId:profile.vendorId,impact:2,likelihood:2,controlMaturity:4,treatmentPlan:'Review the next period of the vendor relationship.',...Object.fromEntries(TPRM_CONTROLS.map(k=>[k,true]))});assert.equal(renewal.status,201);
    row=projectEnterpriseWork('vendor',(await f.get('view=work')).body).rows.find(r=>r.nativeRef===assessment.id)!;assert.equal(row.data.status,'superseded');assert.equal(workCompletionDate(row),'2020-01-01T00:00:00Z');assert.notEqual(row.updatedAt,row.completedAt);assert.equal(row.data.reviewer,profile.reviewer);
  }finally{f.sqlite.close();}
});
test('finding verification and reopening use actual completion and restore active owner work',async()=>{
  const f=fixture('third-party-risk');try{
    await f.get('view=work');seedProfile(f.sqlite);seedAssessment(f.sqlite,{status:'approved'});seedFinding(f.sqlite);
    const closed=await f.post({action:'finding-action',findingId:finding.id,operation:'verify-finding',confirmation:'BULGUYU KAPAT',...evidence});assert.equal(closed.status,200);
    let row=projectEnterpriseWork('vendor',(await f.get('view=work')).body).rows.find(r=>r.nativeRef===finding.id)!;assert.equal(row.completedAt,f.sqlite.prepare('SELECT verified_at FROM third_party_findings').get()!.verified_at);assert.equal(row.data.reviewer,profile.reviewer);
    const reopened=await f.post({action:'finding-action',findingId:finding.id,operation:'reopen-finding',confirmation:'BULGUYU YENİDEN AÇ',note:'A new remediation concern requires reopening.'});assert.equal(reopened.status,200);
    row=projectEnterpriseWork('vendor',(await f.get('view=work')).body).rows.find(r=>r.nativeRef===finding.id)!;assert.equal(row.data.status,'in-progress');assert.equal(row.data.workClosed,false);assert.equal(row.data.reviewer,'');assert.equal(workCompletionDate(row),'');
  }finally{f.sqlite.close();}
});
test('offboarding completion comes from its retained event, never later profile edits',async()=>{
  const f=fixture('third-party-risk');try{
    await f.get('view=work');seedProfile(f.sqlite);seed(f.sqlite,'simple_grc_records',{id:profile.vendorId,module:'Tedarikçiler',data_json:'{}',created_at:dates.createdAt,updated_at:dates.updatedAt});
    const result=await f.post({action:'offboard',vendorId:profile.vendorId,confirmation:'TEDARİKÇİYİ KAPAT',...evidence});assert.equal(result.status,200);
    const completed=String(f.sqlite.prepare("SELECT created_at FROM third_party_events WHERE action='vendor-offboard'").get()!.created_at);f.sqlite.prepare('UPDATE third_party_profiles SET updated_at=?').run('2099-01-01T00:00:00Z');
    const row=projectEnterpriseWork('vendor',(await f.get('view=work')).body).rows[0];assert.equal(workCompletionDate(row),completed);assert.notEqual(row.completedAt,row.updatedAt);
  }finally{f.sqlite.close();}
});
test('exact capacity differs from overflow; active work and recent terminal work precede old history',async()=>{
  const f=fixture('third-party-risk');try{
    await f.get('view=work');for(let i=0;i<2000;i++)seedProfile(f.sqlite,{vendor_id:'V-'+i,status:'offboarded'});
    let result=await f.get('view=work');assert.equal(result.body.complete,true);assert.equal(projectEnterpriseWork('vendor',result.body).complete,true);
    seedProfile(f.sqlite,{vendor_id:'active',criticality:'low'});seedProfile(f.sqlite,{vendor_id:'recent',status:'offboarded'});seed(f.sqlite,'third_party_events',{id:'EVENT-1',vendor_id:'recent',action:'vendor-offboard',actor:profile.reviewer,created_at:dates.updatedAt});
    result=await f.get('view=work');assert.equal(result.body.complete,false);const rows=projectEnterpriseWork('vendor',result.body);assert.equal(rows.complete,false);assert.equal(rows.rows.length,2000);assert.equal(rows.rows[0].nativeRef,'active');assert.equal(rows.rows[1].nativeRef,'recent');
    const oversized=project({profiles:Array.from({length:2001},(_,i)=>({...profile,vendorId:String(i)})),assessments:[],findings:[]});assert.equal(oversized.complete,false);assert.equal(oversized.rows.length,2000);
  }finally{f.sqlite.close();}
});
test('work-source failure is unavailable rather than a successful empty queue',async()=>{
  const f=fixture('third-party-risk'),prepare=f.db.prepare.bind(f.db);try{
    f.db.prepare=((sql:string)=>sql.startsWith('SELECT p.vendor_id vendorId')?{bind(){return{all:async()=>{throw new Error('read unavailable');}};}}:prepare(sql)) as typeof f.db.prepare;
    const r=await f.get('view=work');assert.equal(r.status,503);assert.equal(r.body.code,'TPRM_WORK_UNAVAILABLE');assert.equal(r.body.profiles,undefined);
  }finally{f.sqlite.close();}
});
test('assessment and finding bounds retain active work ahead of old completed history',async()=>{
  for(const kind of ['assessment','finding'] as const){
    const f=fixture('third-party-risk');try{
      await f.get('view=work');seedProfile(f.sqlite);
      if(kind==='finding')seedAssessment(f.sqlite,{status:'approved'});
      for(let i=0;i<2000;i++)if(kind==='assessment')seedAssessment(f.sqlite,{id:'A-'+i,cycle_number:i+1,status:'approved',decided_at:'2020-01-01T00:00:00Z',decided_by:profile.reviewer});else seedFinding(f.sqlite,{id:'F-'+i,status:'closed',verified_at:'2020-01-01T00:00:00Z',verified_by:profile.reviewer});
      let r=await f.get('view=work');assert.equal(r.body.complete,true);
      if(kind==='assessment'){
        seedAssessment(f.sqlite,{id:'active',cycle_number:2001,status:'draft',risk_tier:'low'});seedAssessment(f.sqlite,{id:'recent',cycle_number:2002,status:'approved',decided_at:dates.updatedAt,decided_by:profile.reviewer});
      }else{
        seedFinding(f.sqlite,{id:'active',status:'open',severity:'low'});seedFinding(f.sqlite,{id:'recent',status:'closed',verified_at:dates.updatedAt,verified_by:profile.reviewer});
      }
      seedProfile(f.sqlite,{vendor_id:'terminal',status:'rejected'});
      if(kind==='assessment')seedAssessment(f.sqlite,{id:'blocked',vendor_id:'terminal',cycle_number:1,status:'draft',risk_tier:'critical'});
      else {seedAssessment(f.sqlite,{id:'A-terminal',vendor_id:'terminal',cycle_number:1,status:'approved'});seedFinding(f.sqlite,{id:'blocked',vendor_id:'terminal',assessment_id:'A-terminal',status:'open',severity:'critical'});}
      r=await f.get('view=work');assert.equal(r.body.complete,false);const rows=r.body[kind==='assessment'?'assessments':'findings'] as {id:string}[];assert.equal(rows.length,2000);assert.equal(rows[0].id,'active');assert.equal(rows[1].id,'recent');
    }finally{f.sqlite.close();}
  }
});
