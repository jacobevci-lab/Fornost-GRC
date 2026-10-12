import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as writes from '../app/enterprise-lifecycle-write';
import * as incidents from '../app/incidents/domain';
import * as continuity from '../app/continuity/domain';

// Execute actual route handlers and SQL against transactional SQLite; substitute only platform/auth adapters.
function fixture(module:'incidents'|'continuity') {
 const sqlite=new DatabaseSync(':memory:'); let beforeBatch:(()=>void)|undefined;
 type Value=string|number|null;
 function prepare(sql:string,values:Value[]=[]){return{
  bind(...args:Value[]){return prepare(sql,args);},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async all(){return{results:sqlite.prepare(sql).all(...values)};},
  async run(){return this.exec();},
  exec(){const result=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}};}
 };}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const source=readFileSync(`app/api/${module}/route.ts`,'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:Record<string,unknown>={};
 const require=(name:string)=>{
  if(name==='next/server')return{NextResponse:{json:(body:unknown,options:{status:number})=>({body,status:options.status})}};
  if(name==='cloudflare:workers')return{env:{DB:db}};
  if(name==='../auth/security')return{requireRole:async()=>({actor:{role:'Admin',email:'reviewer@example.com'}})};
  if(name==='../integrations/security')return{clean:(x:unknown,n:number)=>String(x??'').trim().slice(0,n)};
  if(name==='../../enterprise-lifecycle-write')return writes;
  if(name==='../../incidents/domain')return incidents;
  if(name==='../../continuity/domain')return continuity;
  throw new Error(name);
 };
 new Function('require','exports',compiled)(require,exports);
 const post=(body:Record<string,unknown>)=>(exports.POST as (req:unknown)=>Promise<{status:number;body:Record<string,unknown>}> )({headers:new Headers(),json:async()=>body});
 return{sqlite,post,before:(hook:()=>void)=>{beforeBatch=hook;}};
}
const plan={action:'create-plan',name:'Payment continuity plan',process:'Payment processing',biaRef:'BIA-1',criticality:'critical',owner:'owner@example.com',reviewer:'reviewer@example.com',crisisLead:'lead@example.com',rtoHours:4,rpoHours:1,mtpdHours:12,dependencies:'Identity and database services',recoveryStrategy:'Controlled failover to secondary site with validation.',communicationPlan:'Notify crisis team and affected customers.',minimumStaff:4,reviewDate:'2027-10-12'};
async function continuityFixture(){const f=fixture('continuity');const created=await f.post(plan);assert.equal(created.status,201);const id=String(created.body.id);f.sqlite.prepare("UPDATE enterprise_continuity_plans SET status='active' WHERE id=?").run(id);f.sqlite.prepare("INSERT INTO enterprise_continuity_exercises(id,code,plan_id,type,scheduled_date,scenario,facilitator,status,created_by,created_at) VALUES('EX-1','EX-1',?,'tabletop','2026-10-12','Recovery scenario','facilitator@example.com','planned','creator@example.com','2026-10-12')").run(id);return{...f,id};}
const completion={action:'complete-exercise',exerciseId:'EX-1',outcome:'failed',actualRecoveryHours:5,actualDataLossHours:2,observations:'Recovery objectives were exceeded during exercise.',rootCause:'Secondary database recovery required manual intervention.',evidenceReference:'EVD-1',evidenceSha256:'a'.repeat(64)};
const count=(db:DatabaseSync,table:string)=>Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);

test('exercise completion and gap/event commit once; replay cannot create duplicates',async()=>{const f=await continuityFixture();try{
 const before=count(f.sqlite,'enterprise_continuity_events');assert.equal((await f.post(completion)).status,200);assert.equal(count(f.sqlite,'enterprise_continuity_gaps'),1);assert.equal(count(f.sqlite,'enterprise_continuity_events'),before+1);assert.equal((await f.post(completion)).status,409);assert.equal(count(f.sqlite,'enterprise_continuity_gaps'),1);
}finally{f.sqlite.close();}});
test('passing exercise commits event without manufacturing a gap',async()=>{const f=await continuityFixture();try{assert.equal((await f.post({...completion,outcome:'passed',actualRecoveryHours:2,actualDataLossHours:0})).status,200);assert.equal(count(f.sqlite,'enterprise_continuity_gaps'),0);}finally{f.sqlite.close();}});
test('gap or audit failure rolls back completion and every dependent write',async()=>{for(const table of ['enterprise_continuity_gaps','enterprise_continuity_events']){const f=await continuityFixture();try{
 const before=count(f.sqlite,'enterprise_continuity_events');f.sqlite.exec(`CREATE TRIGGER injected_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected failure'); END`);assert.notEqual((await f.post(completion)).status,200);assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_continuity_exercises').get()!.status,'planned');assert.equal(count(f.sqlite,'enterprise_continuity_gaps'),0);assert.equal(count(f.sqlite,'enterprise_continuity_events'),before);
}finally{f.sqlite.close();}}});
test('parent retirement/target/ownership changes and competing completion reject the stale exercise claim',async()=>{for(const mutation of ["UPDATE enterprise_continuity_plans SET status='retired'","UPDATE enterprise_continuity_plans SET rto_hours=2","UPDATE enterprise_continuity_plans SET reviewer='other@example.com'","UPDATE enterprise_continuity_exercises SET status='completed'"]){const f=await continuityFixture();try{const before=count(f.sqlite,'enterprise_continuity_events');f.before(()=>f.sqlite.exec(mutation));assert.equal((await f.post(completion)).status,409);assert.equal(count(f.sqlite,'enterprise_continuity_gaps'),0);assert.equal(count(f.sqlite,'enterprise_continuity_events'),before);}finally{f.sqlite.close();}}});
test('plan decision detects reassignment and audit failure preserves draft',async()=>{for(const failure of ['reassignment','audit']){const f=fixture('continuity');try{const result=await f.post(plan),id=String(result.body.id);f.sqlite.exec("UPDATE enterprise_continuity_plans SET created_by='creator@example.com'");const before=count(f.sqlite,'enterprise_continuity_events');if(failure==='reassignment')f.before(()=>f.sqlite.prepare("UPDATE enterprise_continuity_plans SET reviewer='other@example.com' WHERE id=?").run(id));else f.sqlite.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON enterprise_continuity_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");const response=await f.post({action:'approve-plan',planId:id,note:'Independently reviewed plan.',confirmation:'PLANI ONAYLA'});assert.equal(response.status,failure==='reassignment'?409:400);assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_continuity_plans').get()!.status,'draft');assert.equal(count(f.sqlite,'enterprise_continuity_events'),before);}finally{f.sqlite.close();}}});
test('incident transitions claim current ownership/state and roll back on audit failure',async()=>{for(const mode of ['success','state','owner','audit']){const f=fixture('incidents');try{const created=await f.post({action:'create',title:'Identity compromise incident',category:'account-compromise',severity:'critical',detectedDate:'2026-10-01',description:'Confirmed anomalous privileged access activity.',businessImpact:'Production services and restricted records affected.',owner:'owner@example.com',commander:'commander@example.com',reviewer:'reviewer@example.com',assetRefs:'AST-1',dataClassification:'Restricted',personalData:true});assert.equal(created.status,201);const id=String(created.body.id),before=count(f.sqlite,'enterprise_incident_events');if(mode==='state')f.before(()=>f.sqlite.exec("UPDATE enterprise_incidents SET status='triage'"));if(mode==='owner')f.before(()=>f.sqlite.exec("UPDATE enterprise_incidents SET owner='other@example.com'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON enterprise_incident_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");const result=await f.post({action:'transition',incidentId:id,operation:'triage',note:'Triage investigation started.',evidenceReference:'EVD-1',evidenceSha256:'a'.repeat(64),confirmation:'OLAY TRİAJINI BAŞLAT'});assert.equal(result.status,mode==='success'?200:mode==='audit'?400:409);assert.equal(count(f.sqlite,'enterprise_incident_events'),before+(mode==='success'?1:0));if(mode==='audit')assert.equal(f.sqlite.prepare('SELECT status FROM enterprise_incidents').get()!.status,'declared');}finally{f.sqlite.close();}}});
test('gap close is independently authorized, atomic and cannot overwrite a competing close',async()=>{for(const mode of ['success','race','audit']){const f=await continuityFixture();try{assert.equal((await f.post(completion)).status,200);const gap=f.sqlite.prepare('SELECT id FROM enterprise_continuity_gaps').get()!;const before=count(f.sqlite,'enterprise_continuity_events');if(mode==='race')f.before(()=>f.sqlite.exec("UPDATE enterprise_continuity_gaps SET status='closed',closed_by='other@example.com'"));if(mode==='audit')f.sqlite.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON enterprise_continuity_events BEGIN SELECT RAISE(ABORT,'injected failure'); END");const result=await f.post({action:'close-gap',gapId:gap.id,note:'Independent recovery evidence verified.',confirmation:'AÇIĞI KAPAT',evidenceReference:'EVD-2',evidenceSha256:'b'.repeat(64)});assert.equal(result.status,mode==='success'?200:mode==='race'?409:400);assert.equal(count(f.sqlite,'enterprise_continuity_events'),before+(mode==='success'?1:0));const row=f.sqlite.prepare('SELECT status,closed_by FROM enterprise_continuity_gaps').get()!;assert.equal(row.status,mode==='audit'?'open':'closed');if(mode==='race')assert.equal(row.closed_by,'other@example.com');}finally{f.sqlite.close();}}});
