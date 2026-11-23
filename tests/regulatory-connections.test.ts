import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
import {effectiveLabel} from '../app/regulatory-intelligence/domain';
const change={action:'create-change',sourceMode:'independent',externalRef:'SEC-1',title:'Access requirements',summary:'Review privileged access controls across the business.',publishedDate:'2026-01-01',effectiveDate:'2099-01-01',severity:'high',changeType:'amendment',owner:'owner@example.com',reviewer:'reviewer@example.com'};
const source={action:'save-source',name:'Official source',authority:'Authority',jurisdiction:'EU',sourceType:'regulator',url:'https://example.com/news',owner:'owner@example.com',reviewFrequencyDays:30};
const seeds=[['control','Kontroller','CTL-010'],['risk','Risk Assessment','RSK-007'],['process','BIA','BIA-004']] as const;
type Row=Record<string,unknown>;
async function setup(){
 const f=fixture('regulatory-intelligence');
 await f.get('view=overview');
 for(const [,module,id] of seeds){
  f.sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(id,module,JSON.stringify({title:'Sample '+module}));
  f.sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,CURRENT_TIMESTAMP)').run(id,module,id);
 }
 f.sqlite.exec("CREATE TABLE policy_documents(id TEXT PRIMARY KEY,code TEXT,title TEXT,status TEXT); INSERT INTO policy_documents VALUES('policy-uuid','OLD-HEX','Access policy','draft'); INSERT INTO simple_grc_record_codes VALUES('policy-uuid','Politika Merkezi','POL-003',CURRENT_TIMESTAMP)");
 return f;
}
test('source-independent intake keeps all four real targets, separate from assigned work',async()=>{
 const f=await setup();try{
  f.setActor({id:'editor',role:'Editor',email:'owner@example.com',name:'Owner',source:'local'});
  const preliminary=[...seeds.map(([type,,id])=>({type,id})),{type:'policy',id:'policy-uuid'}];
  const r=await f.post({...change,preliminary:[...preliminary,preliminary[0]]});assert.equal(r.status,201,JSON.stringify(r));
  const changeId=String(r.body.id);
  assert.equal((await f.post({...change,preliminary})).status,409);
  const list=await f.get('view=changes');assert.equal((list.body.changes as Row[]).length,1);assert.equal((list.body.summary as Row).sources,0);
  let detail=await f.get('detail='+changeId);let links=(detail.body.change as Row).preliminary as Row[];
  assert.equal(links.length,4);assert.match(String(links.find(t=>t.type==='policy')?.title),/^POL-003 · Access policy/);assert.deepEqual(detail.body.impacts,[]);
  const choices=await f.get('targets=policy&q=POL-003');assert.equal((choices.body.records as Row[])[0].id,'policy-uuid');
  const assign={action:'add-impact',fromPreliminary:true,targetMode:'record',changeId,targetType:'control',targetRef:'CTL-010',targetTitle:'forged label',impactLevel:'high',requiredAction:'Review access quarterly',actionOwner:'owner@example.com',dueDate:'2098-01-01'};
  assert.equal((await f.post(assign)).status,201);assert.equal((await f.post(assign)).status,409);
  detail=await f.get('detail='+changeId);links=(detail.body.change as Row).preliminary as Row[];assert.equal(links.length,3);assert.match(String((detail.body.impacts as Row[])[0].targetTitle),/^CTL-010 · Sample/);
  assert.equal(((await f.get('view=impacts')).body.impacts as Row[]).length,1);
  const remove={action:'remove-preliminary',changeId,targetType:'policy',targetRef:'policy-uuid'};
  f.setActor({id:'other',role:'Editor',email:'other@example.com',name:'Other',source:'local'});
  assert.equal((await f.post(remove)).status,403);
  f.setActor({id:'editor',role:'Editor',email:'owner@example.com',name:'Owner',source:'local'});
  assert.equal((await f.post(remove)).status,200);assert.equal((await f.post(remove)).status,409);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM regulatory_change_events WHERE action='preliminary-remove'").get()!.n,1);
  f.sqlite.exec("UPDATE regulatory_changes SET status='verification';UPDATE regulatory_change_impacts SET status='completed'");
  assert.equal((await f.post({action:'change-action',changeId,operation:'close',confirmation:'DEĞİŞİKLİĞİ KAPAT',note:'Assessment completed.'})).status,409);
 }finally{f.sqlite.close()}
});
test('invalid dates, independent role conflicts and stale impact targets cannot leave partial intake',async()=>{
 const f=await setup();try{
  for(const body of [{effectiveDate:'2025-12-31'},{reviewer:'OWNER@example.com'},{sourceMode:''},{sourceId:'conflicting'}])
   assert.equal((await f.post({...change,...body})).status,400);
  assert.equal((await f.post({...change,preliminary:[{type:'risk',id:'CTL-010'}]})).status,422);
  f.before(()=>f.sqlite.exec("UPDATE policy_documents SET status='retired'"));
  assert.equal((await f.post({...change,preliminary:[{type:'control',id:'CTL-010'},{type:'policy',id:'policy-uuid'}]})).status,422);
  for(const table of ['regulatory_changes','regulatory_preliminary_impacts','regulatory_change_events'])assert.equal(f.sqlite.prepare('SELECT count(*) n FROM '+table).get()!.n,0);
 }finally{f.sqlite.close()}
});
test('registered source framework links follow compliance enrollment and survive legacy edits',async()=>{
 const f=await setup();try{
  f.sqlite.exec("CREATE TABLE framework_programs(name TEXT PRIMARY KEY);INSERT INTO framework_programs VALUES('ISO'),('DORA')");
  const choices=await f.get('targets=framework&q=do');assert.deepEqual(choices.body.records,[{id:'DORA',title:'DORA'}]);
  assert.equal((await f.post({...source,frameworks:['missing']})).status,422);
  const r=await f.post({...source,frameworks:['ISO','DORA','ISO']});assert.equal(r.status,201);const id=r.body.id;
  async function read(){return ((await f.get('view=sources')).body.sources as Row[])[0]}
  let s=await read();assert.deepEqual(s.frameworks,['ISO','DORA']);
  const update={...source,action:'update-source',sourceId:id};
  assert.equal((await f.post({...update,expectedUpdatedAt:s.updatedAt})).status,200);s=await read();assert.deepEqual(s.frameworks,['ISO','DORA']);
  assert.equal((await f.post({...update,expectedUpdatedAt:s.updatedAt,frameworks:[]})).status,200);s=await read();assert.deepEqual(s.frameworks,[]);
  f.before(()=>f.sqlite.exec("DELETE FROM framework_programs WHERE name='ISO'"));const failed=await f.post({...update,expectedUpdatedAt:s.updatedAt,frameworks:['ISO']});assert.equal(failed.status,409);assert.deepEqual((await read()).frameworks,[]);
  assert.equal((await f.post({action:'delete-source',sourceId:id,expectedUpdatedAt:s.updatedAt})).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM regulatory_source_frameworks').get()!.n,0);
 }finally{f.sqlite.close()}
});
test('effective badges use calendar days including publication day and month changes',()=>{
 assert.equal(effectiveLabel('2028-03-01','2028-02-28',true),'Yürürlüğe 2 gün kaldı');
 assert.equal(effectiveLabel('2028-03-01','2028-02-29',false),'Effective in 1 day');
 assert.equal(effectiveLabel('2028-03-01','2028-03-01',true),'Yürürlükte');
 assert.equal(effectiveLabel('2028-03-01','2028-03-02',false),'In effect');
});
