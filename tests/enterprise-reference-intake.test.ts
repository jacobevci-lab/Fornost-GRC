import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
import {deleteCoreRecord,CoreRecordLinked} from '../app/core-record-delete';

const plan={action:'create-plan',name:'Payment continuity plan',process:'Payment processing',biaRef:'Legacy BIA',criticality:'critical',owner:'owner@example.com',reviewer:'reviewer@example.com',crisisLead:'lead@example.com',rtoHours:4,rpoHours:1,mtpdHours:12,dependencies:'Identity and database services',recoveryStrategy:'Controlled failover to secondary site with validation.',communicationPlan:'Notify crisis team and affected customers.',minimumStaff:4,reviewDate:'2027-10-12'};
const incident={action:'create',title:'Identity compromise incident',category:'account-compromise',severity:'critical',detectedDate:'2026-10-01',description:'Confirmed anomalous privileged access activity.',businessImpact:'Production services and restricted records affected.',owner:'owner@example.com',commander:'commander@example.com',reviewer:'reviewer@example.com',assetRefs:'Legacy asset',dataClassification:'Restricted',personalData:true};
const cases=[['incidents','assetRefs','Varlık Envanteri','AST'],['incidents','riskRef','Risk Assessment','RSK'],['incidents','biaRef','BIA','BIA'],['continuity','biaRef','BIA','BIA']] as const;
const stamp='2026-10-14T00:00:00.000Z';
function setup(kind:'incidents'|'continuity'){
 const f=fixture(kind),table=kind==='incidents'?'enterprise_incidents':'enterprise_continuity_plans',events=kind==='incidents'?'enterprise_incident_events':'enterprise_continuity_events';
 f.sqlite.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT,code TEXT UNIQUE,created_at TEXT);');
 const count=(name:string)=>Number(f.sqlite.prepare(`SELECT count(*) n FROM ${name}`).get()!.n);
 return{...f,table,events,count,body:kind==='incidents'?incident:plan,target(moduleName:string,prefix:string){const id=`${prefix}-11111111-1111-4111-8111-111111111111`;f.sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,moduleName,'{}',stamp,stamp);f.sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run(id,moduleName,`${prefix}-001`,stamp);return id}};
}
test('actual incident and continuity routes accept canonical targets and commit exactly one history entry',async()=>{
 for(const [kind,field,moduleName,prefix] of cases)for(const useId of [false,true]){const f=setup(kind);try{const id=f.target(moduleName,prefix),result=await f.post({...f.body,[field]:useId?id.toUpperCase():`${prefix.toLowerCase()}-001`});assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(f.count(f.table),1);assert.equal(f.count(f.events),1);const row=f.sqlite.prepare(`SELECT * FROM ${f.table}`).get()!;assert.equal(row.status,kind==='incidents'?'declared':'draft');assert.equal(row.owner,'owner@example.com');}finally{f.sqlite.close()}}
});
test('missing, wrong-module, orphan-code and mixed canonical links leave neither source nor history',async()=>{
 for(const [kind,field,,prefix] of cases)for(const failure of ['missing','wrong-module','orphan','mixed']){const f=setup(kind);try{if(failure==='wrong-module')f.target('Kanıtlar',prefix);if(failure==='orphan')f.sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run('orphan','BIA',`${prefix}-001`,stamp);const response=await f.post({...f.body,[field]:`${failure==='mixed'?'Legacy label; ':''}${prefix}-001`});assert.equal(response.status,422);assert.equal(response.body.code,'REFERENCE_UNAVAILABLE');assert.equal(f.count(f.table),0);assert.equal(f.count(f.events),0);}finally{f.sqlite.close()}}
});
test('target disappearance before the transaction rejects source and audit together',async()=>{
 for(const [kind,field,moduleName,prefix] of cases){const f=setup(kind);try{f.target(moduleName,prefix);f.before(()=>f.sqlite.exec('DELETE FROM simple_grc_records'));assert.equal((await f.post({...f.body,[field]:`${prefix}-001`})).status,422);assert.equal(f.count(f.table),0);assert.equal(f.count(f.events),0);}finally{f.sqlite.close()}}
});
test('source creation first blocks later protected core deletion for all four relationships',async()=>{
 for(const [kind,field,moduleName,prefix] of cases){const f=setup(kind);try{const id=f.target(moduleName,prefix);assert.equal((await f.post({...f.body,[field]:`${prefix}-001`})).status,201);await assert.rejects(deleteCoreRecord(f.db,id,{module:moduleName,data_json:'{}',updated_at:stamp},stamp),CoreRecordLinked);assert.equal(f.count('simple_grc_records'),1);assert.equal(f.count('simple_grc_record_codes'),1);}finally{f.sqlite.close()}}
});
test('history insertion failure rolls back source and allows a clean retry',async()=>{
 for(const kind of ['incidents','continuity'] as const){const f=setup(kind);try{await f.post({...f.body,biaRef:'BIA-999'});f.sqlite.exec(`CREATE TRIGGER fail_history BEFORE INSERT ON ${f.events} BEGIN SELECT RAISE(ABORT,'injected history failure'); END`);assert.equal((await f.post(f.body)).status,400);assert.equal(f.count(f.table),0);assert.equal(f.count(f.events),0);f.sqlite.exec('DROP TRIGGER fail_history');assert.equal((await f.post(f.body)).status,201);assert.equal(f.count(f.table),1);assert.equal(f.count(f.events),1);}finally{f.sqlite.close()}}
});
