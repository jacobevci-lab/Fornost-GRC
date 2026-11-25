import test from 'node:test';
import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {fixture} from './helpers/enterprise-route-fixture';
import {ensureCoreGrcSchemaCompatibility} from '../app/api/grc/schema-compat';
import {parseWorkflowRecordFocus} from '../app/workflow-record-focus';
import {scopedApiAllowed} from '../app/module-access';

function seed(db:DatabaseSync,table:string,values:Record<string,string|number>) {
 const row:Record<string,string|number>={};
 for(const column of db.prepare(`PRAGMA table_info(${table})`).all())if(column.notnull&&!column.dflt_value)row[String(column.name)]=['INTEGER','REAL'].includes(String(column.type))?1:'fixture';
 Object.assign(row,values);db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
}
test('focused module reads reject mixed, repeated and malformed targets without weakening module scope',async()=>{
 assert.equal(parseWorkflowRecordFocus(new URLSearchParams(),'continuity'),null);
 assert.deepEqual(parseWorkflowRecordFocus(new URLSearchParams('focusKind=continuity-gap&focusId=BCG-1'),'continuity'),{kind:'continuity-gap',ref:'BCG-1'});
 for(const query of ['focusKind=regulatory-impact&focusId=RI-1','focusKind=continuity-gap','focusId=BCG-1','focusKind=continuity-gap&focusId=../x','focusKind=continuity-gap&focusId=x&focusId=y']) {
  assert.equal(parseWorkflowRecordFocus(new URLSearchParams(query),'continuity'),false);
  const f=fixture('continuity');try{assert.equal((await f.get(query)).status,400)}finally{f.sqlite.close()}
 }
 const actor={role:'Viewer',moduleAccess:{mode:'scoped' as const,modules:{Kanıtlar:'read' as const}}};
 assert.equal(scopedApiAllowed(actor,'/api/continuity','GET'),false);assert.equal(scopedApiAllowed(actor,'/api/regulatory-intelligence','GET'),false);
});
test('continuity GET brings an exact old exercise/gap and parent into bounded lists without mutation',async()=>{
 const f=fixture('continuity');try {
  await f.post({});
  for(let i=0;i<2001;i++) {
   seed(f.sqlite,'enterprise_continuity_plans',{id:'BCP-'+i,code:'BCP-'+i,name:'Plan '+i,updated_at:'2026-10-27'});
   seed(f.sqlite,'enterprise_continuity_exercises',{id:'BCE-'+i,code:'BCE-'+i,plan_id:'BCP-'+i,scheduled_date:'2026-10-27'});
   seed(f.sqlite,'enterprise_continuity_gaps',{id:'BCG-'+i,plan_id:'BCP-'+i,exercise_id:'BCE-'+i,due_date:'2026-10-27'});
  }
  seed(f.sqlite,'enterprise_continuity_plans',{id:'BCP-target',code:'BCP-target',name:'Old recovery',updated_at:'2000-01-01'});
  seed(f.sqlite,'enterprise_continuity_exercises',{id:'BCE-target',code:'BCE-target',plan_id:'BCP-target',scheduled_date:'2000-01-01'});
  seed(f.sqlite,'enterprise_continuity_gaps',{id:'BCG-target',plan_id:'BCP-target',exercise_id:'BCE-target',due_date:'2099-01-01'});
  const ordinary=await f.get();const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  assert.equal((ordinary.body.exercises as {id:string}[]).some(r=>r.id==='BCE-target'),false);
  assert.equal((ordinary.body.gaps as {id:string}[]).some(r=>r.id==='BCG-target'),false);
  for(const [kind,id] of [['continuity-exercise','BCE-target'],['continuity-gap','BCG-target']]) {
   const result=await f.get(new URLSearchParams({focusKind:kind,focusId:id}).toString());assert.equal(result.status,200);
   assert.equal((result.body.plans as {id:string}[])[0].id,'BCP-target');assert.equal((result.body.exercises as {id:string}[])[0].id,'BCE-target');
   if(kind==='continuity-gap')assert.equal((result.body.gaps as {id:string}[])[0].id,'BCG-target');
   assert.equal((result.body.exercises as unknown[]).length,2000);
  }
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  const missing=await f.get('focusKind=continuity-gap&focusId=missing');assert.equal(missing.status,200);assert.ok(!(missing.body.gaps as {id:string}[]).some(r=>r.id==='missing'));
 }finally{f.sqlite.close()}
});
test('regulatory GET locates an old impact with its change and source beyond every list boundary',async()=>{
 const f=fixture('regulatory-intelligence');try {
  await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);
  for(let i=0;i<501;i++)seed(f.sqlite,'regulatory_intelligence_sources',{id:'SRC-'+i,name:'A '+i,authority:'A',url:'https://fixture.test/'+i});
  seed(f.sqlite,'regulatory_intelligence_sources',{id:'SRC-target',name:'Z old source',authority:'Z',url:'https://fixture.test/target'});
  for(let i=0;i<1001;i++)seed(f.sqlite,'regulatory_changes',{id:'RC-'+i,source_id:'SRC-0',external_ref:'ref-'+i,severity:'high',effective_date:'2026-10-27'});
  seed(f.sqlite,'regulatory_changes',{id:'RC-target',source_id:'SRC-target',external_ref:'target',severity:'low',effective_date:'2099-01-01'});
  for(let i=0;i<2001;i++)seed(f.sqlite,'regulatory_change_impacts',{id:'RI-'+i,change_id:'RC-0',target_type:'control',target_ref:'target-'+i,impact_level:'high',due_date:'2026-10-27'});
  seed(f.sqlite,'regulatory_change_impacts',{id:'RI-target',change_id:'RC-target',target_type:'control',target_ref:'old',impact_level:'low',due_date:'2099-01-01'});
  const ordinary=await f.get();assert.equal((ordinary.body.impacts as {id:string}[]).some(r=>r.id==='RI-target'),false);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const result=await f.get('focusKind=regulatory-impact&focusId=RI-target');assert.equal(result.status,200);
  assert.equal((result.body.sources as {id:string}[])[0].id,'SRC-target');assert.equal((result.body.changes as {id:string}[])[0].id,'RC-target');assert.equal((result.body.impacts as {id:string}[])[0].id,'RI-target');
  assert.equal((result.body.impacts as unknown[]).length,2000);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{f.sqlite.close()}
});

test('TPRM exact links recover old assessments, findings and their vendor beyond all list boundaries',async()=>{
 const f=fixture('third-party-risk');try{
  await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);
  for(let i=0;i<1001;i++)seed(f.sqlite,'third_party_profiles',{vendor_id:'VEN-'+i,name:'Supplier '+i,criticality:'critical',next_review:'2026-10-27'});
  seed(f.sqlite,'third_party_profiles',{vendor_id:'VEN-target',name:'Old supplier',criticality:'low',next_review:'2099-01-01'});
  for(let i=0;i<2001;i++)seed(f.sqlite,'third_party_assessments',{id:'TPA-'+i,vendor_id:'VEN-0',cycle_number:i,updated_at:'2026-10-27'});
  seed(f.sqlite,'third_party_assessments',{id:'TPA-target',vendor_id:'VEN-target',cycle_number:1,updated_at:'2000-01-01'});
  for(let i=0;i<3001;i++)seed(f.sqlite,'third_party_findings',{id:'TPF-'+i,vendor_id:'VEN-0',assessment_id:'TPA-0',severity:'critical',due_date:'2026-10-27'});
  seed(f.sqlite,'third_party_findings',{id:'TPF-target',vendor_id:'VEN-target',assessment_id:'TPA-target',severity:'low',due_date:'2099-01-01'});
  const ordinary=await f.get();assert.equal((ordinary.body.assessments as {id:string}[]).some(r=>r.id==='TPA-target'),false);assert.equal((ordinary.body.findings as {id:string}[]).some(r=>r.id==='TPF-target'),false);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  for(const [kind,id] of [['vendor-review','VEN-target'],['vendor-assessment','TPA-target'],['vendor-finding','TPF-target']]){
   const result=await f.get(new URLSearchParams({focusKind:kind,focusId:id}).toString());assert.equal(result.status,200);assert.equal((result.body.profiles as {vendorId:string}[])[0].vendorId,'VEN-target');
   if(kind!=='vendor-review')assert.equal((result.body.assessments as {id:string}[])[0].id,'TPA-target');
   if(kind==='vendor-finding')assert.equal((result.body.findings as {id:string}[])[0].id,'TPF-target');
   assert.equal((result.body.assessments as unknown[]).length,2000);assert.equal((result.body.findings as unknown[]).length,3000);
  }
  for(const query of ['focusKind=vendor-finding','focusKind=vendor-finding&focusId=../x','focusKind=continuity-plan&focusId=BCP-1','focusKind=vendor-review&focusId=x&focusId=y'])assert.equal((await f.get(query)).status,400);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  assert.equal(scopedApiAllowed({role:'Viewer',moduleAccess:{mode:'scoped',modules:{Kanıtlar:'read'}}},'/api/third-party-risk','GET'),false);
 }finally{f.sqlite.close()}
});
