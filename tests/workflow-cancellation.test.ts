import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';

const definitions=[
 {route:'policy-lifecycle',table:'policy_documents',key:'id',state:'draft',event:'policy_events',children:'policy_versions',childKey:'policy_id'},
 {route:'risk-appetite',table:'risk_appetite_statements',key:'id',state:'draft',event:'risk_appetite_events'},
 {route:'third-party-risk',table:'third_party_profiles',key:'vendor_id',state:'onboarding',event:'third_party_events',children:'third_party_assessments',childKey:'vendor_id'},
 {route:'findings',table:'enterprise_findings',key:'id',state:'in-progress',event:'enterprise_finding_events'},
 {route:'incidents',table:'enterprise_incidents',key:'id',state:'triage',event:'enterprise_incident_events'},
] as const;
const stamp='2026-11-12T00:00:00.000Z';
// Explicit defaults avoid hiding cancellation's interaction with real module schemas.
async function prepared(d:typeof definitions[number]){
 const f=fixture(d.route,true);await f.post({});
 const insert=(table:string,patch:Record<string,string|number|null>)=>{
  const columns=f.sqlite.prepare(`PRAGMA table_info(${table})`).all() as {name:string;notnull:number;dflt_value:unknown;type:string}[];
  const row:Record<string,string|number|null>={};
  for(const c of columns)if(c.notnull&&c.dflt_value===null)row[c.name]=/INT|REAL/.test(c.type)?1:c.name.endsWith('_at')?stamp:c.name.endsWith('_json')?'[]':c.name.includes('owner')?'owner@example.com':c.name==='reviewer'?'reviewer@example.com':'Synthetic '+c.name;
  Object.assign(row,patch);f.sqlite.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
 };
 insert(d.table,{[d.key]:'target',status:d.state,updated_at:stamp,...d.route==='findings'?{source_type:'manual'}:{}});
 if('children' in d)insert(d.children,{id:'child',[d.childKey]:'target',status:'draft',updated_at:stamp});
 if(d.route==='third-party-risk'){
  f.sqlite.exec("CREATE TABLE IF NOT EXISTS simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT)");
  f.sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run('target','Tedarikçiler','{"status":"Aktif","vendorName":"Synthetic"}',stamp,stamp);
 }
 const current=()=>f.sqlite.prepare(`SELECT * FROM ${d.table} WHERE ${d.key}='target'`).get()!;
 const request=(patch:Record<string,unknown>={})=>f.post({action:'cancel-record',recordId:'target',expectedUpdatedAt:stamp,reason:'test',note:'Synthetic QA intake is no longer needed.',confirmation:'İPTAL ET',...patch});
 return {...f,insert,current,request};
}
for(const d of definitions){
 test(`${d.route}: cancellation retains history and children without marking approval or verification`,async()=>{
  const f=await prepared(d);try{
   const before=f.current(),result=await f.request();assert.equal(result.status,200,JSON.stringify(result));assert.equal(f.current().status,'cancelled');
   for(const [key,value] of Object.entries(before))if(!['status','updated_by','updated_at'].includes(key))assert.equal(f.current()[key],value,key);
   assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ${d.event} WHERE action='cancel'`).get()!.n,1);
   if('children' in d)assert.equal(f.sqlite.prepare(`SELECT status FROM ${d.children}`).get()!.status,'cancelled');
   assert.equal((await f.request()).status,409,'stale retry must not add a second event');
   if(d.route==='third-party-risk')assert.equal(JSON.parse(String(f.sqlite.prepare('SELECT data_json FROM simple_grc_records').get()!.data_json)).status,'İptal Edildi');
  }finally{f.sqlite.close()}
 });
 test(`${d.route}: read-only access, stale state, ineligible states and audit-write failure cannot cancel`,async()=>{
  for(const problem of ['viewer','editor','stale','state','history','race','reason']){
   const f=await prepared(d);try{
    if(problem==='viewer'||problem==='editor')f.setActor({id:'other',email:'other@example.com',name:'Other',role:problem==='viewer'?'Viewer':'Editor',source:'local'});
    if(problem==='state')f.sqlite.prepare(`UPDATE ${d.table} SET status='approved'`).run();
    if(problem==='history')f.sqlite.exec(`CREATE TRIGGER fail_cancel BEFORE INSERT ON ${d.event} BEGIN SELECT RAISE(ABORT,'injected');END`);
    if(problem==='race')f.before(()=>f.sqlite.prepare(`UPDATE ${d.table} SET updated_at='changed'`).run());
    const before=f.current().status,res=await f.request(problem==='stale'?{expectedUpdatedAt:'old'}:problem==='reason'?{note:'Short'}:{});
    assert.ok(res.status>=400,JSON.stringify(res));assert.equal(f.current().status,before);assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ${d.event} WHERE action='cancel'`).get()!.n,0);
   }finally{f.sqlite.close()}
  }
 });
}
test('cancellation cannot silently discard a submitted child or a concurrently edited draft',async()=>{
 for(const d of [definitions[0],definitions[2]])for(const race of [false,true]){
  const f=await prepared(d);try{if(race)f.before(()=>f.sqlite.prepare(`UPDATE ${d.children} SET updated_at='changed'`).run());else f.sqlite.prepare(`UPDATE ${d.children} SET status='submitted'`).run();assert.equal((await f.request()).status,409);assert.equal(f.current().status,d.state);}finally{f.sqlite.close()}
 }
});
