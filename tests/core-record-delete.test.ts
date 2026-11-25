import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {deleteCoreRecord,CoreRecordLinked} from '../app/core-record-delete';
import {LifecycleConflict} from '../app/enterprise-lifecycle-write';
import type {CoreRecordSnapshot} from '../app/core-record-write';
function fixture(module='Varlık Envanteri'){
 const sqlite=new DatabaseSync(':memory:');let hook:(()=>void)|undefined;
 sqlite.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT); CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT)');
 const add=(id:string,mod:string,data:unknown)=>sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?)').run(id,mod,JSON.stringify(data),'2026-10-13T00:00:00.000Z');
 add('target',module,{title:'Legacy title'});sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?)').run('target','AST-001');
 type Value=string|number|null;
 function prepare(sql:string,values:Value[]=[]){return{bind(...args:Value[]){return prepare(sql,args)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},exec(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}};}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){hook?.();hook=undefined;sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}} as unknown as D1Database;
 const read=()=>sqlite.prepare('SELECT module,data_json,updated_at FROM simple_grc_records WHERE id=?').get('target') as unknown as CoreRecordSnapshot&{module:string};
 const before=read(),remove=(version:unknown=before.updated_at)=>deleteCoreRecord(db,'target',before,version);
 const retained=()=>{assert.ok(read());assert.ok(sqlite.prepare('SELECT * FROM simple_grc_record_codes WHERE record_id=?').get('target'))};
 return{sqlite,db,add,read,before,remove,retained,race:(fn:()=>void)=>{hook=fn}};
}
test('unlinked deletion removes record and code together, including legacy unversioned clients',async()=>{for(const legacy of [false,true]){const f=fixture();try{await deleteCoreRecord(f.db,'target',f.before,legacy?undefined:f.before.updated_at);assert.equal(f.read(),undefined);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM simple_grc_record_codes').get()!.n,0);}finally{f.sqlite.close()}}});
test('stale and malformed versions preserve record and code',async()=>{const f=fixture();try{await assert.rejects(f.remove('2000-01-01'),LifecycleConflict);for(const version of [null,'',123,{},'x'.repeat(65)])await assert.rejects(f.remove(version));f.retained();}finally{f.sqlite.close()}});
test('server snapshot races preserve edited record and code even without client version',async()=>{for(const field of ['data_json','updated_at','module']){const f=fixture();try{f.race(()=>f.sqlite.prepare(`UPDATE simple_grc_records SET ${field}=? WHERE id='target'`).run(field==='data_json'?'{}':'changed'));await assert.rejects(deleteCoreRecord(f.db,'target',f.before,undefined),LifecycleConflict);f.retained();}finally{f.sqlite.close()}}});
test('incoming IDs and codes block deletion for strings, arrays, delimiters and case',async()=>{for(const value of ['target','AST-001','other, target','other; AST-001','other|target','other\nAST-001','other\r\ntarget',['other','target'],['other, AST-001'],' ast-001 ']){const f=fixture();try{f.add('risk','Risk Assessment',{asset:value});await assert.rejects(f.remove(),CoreRecordLinked);f.retained();}finally{f.sqlite.close()}}});
test('incoming link inserted just before DELETE is checked atomically',async()=>{const f=fixture();try{f.race(()=>f.add('risk','Risk Assessment',{asset:'target'}));await assert.rejects(f.remove(),CoreRecordLinked);f.retained();}finally{f.sqlite.close()}});
test('source and target modules and reference fields define the relationship',async()=>{for(const [target,source,field] of [['BIA','Risk Assessment','processLink'],['BIA','Kontroller','processLink'],['Tedarikçiler','Varlık Envanteri','vendor'],['Kontroller','Kanıtlar','controlRef'],['Uyum','Denetim Yönetimi','requirementRef'],['Risk Assessment','Denetim Yönetimi','riskRef'],['Kanıtlar','Denetim Yönetimi','evidenceRef']]){const f=fixture(target);try{f.add('source',source,{[field]:'target'});await assert.rejects(f.remove(),CoreRecordLinked);f.retained();}finally{f.sqlite.close()}}});
test('unrelated fields/modules, substrings, self references and legacy labels do not falsely block',async()=>{for(const [module,data] of [['Risk Assessment',{notes:'target',asset:'target-extra'}],['Tedarikçiler',{asset:'target'}],['Risk Assessment',{asset:'Legacy title'}],['Risk Assessment',{asset:{note:'target'}}]] as [string,unknown][]){const f=fixture();try{f.add('source',module,data);await f.remove();assert.equal(f.read(),undefined);}finally{f.sqlite.close()}}});
test('removing an incoming reference permits deletion on retry',async()=>{const f=fixture();try{f.add('risk','Risk Assessment',{asset:'target'});await assert.rejects(f.remove(),CoreRecordLinked);f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run('{}','risk');await f.remove();assert.equal(f.read(),undefined);}finally{f.sqlite.close()}});
test('code cleanup failure rolls back record deletion',async()=>{const f=fixture();try{f.sqlite.exec("CREATE TRIGGER fail_code BEFORE DELETE ON simple_grc_record_codes BEGIN SELECT RAISE(ABORT,'injected failure'); END");await assert.rejects(f.remove());f.retained();}finally{f.sqlite.close()}});
test('no-op deletion cannot remove a code left by another transaction',async()=>{const f=fixture();try{f.race(()=>f.sqlite.exec("DELETE FROM simple_grc_records WHERE id='target'"));await assert.rejects(f.remove(),LifecycleConflict);assert.ok(f.sqlite.prepare('SELECT * FROM simple_grc_record_codes').get());}finally{f.sqlite.close()}});

const enterpriseSchema:Record<string,string>={
 evidence_automation_rules:'control_refs TEXT,status TEXT',
 evidence_automation_runs:'evidence_id TEXT,status TEXT',
 evidence_automation_findings:'evidence_id TEXT,closure_evidence_ref TEXT,status TEXT',
 continuous_assurance_exceptions:'control_ref TEXT,risk_ref TEXT,evidence_reference TEXT,status TEXT',
 enterprise_continuity_plans:'bia_ref TEXT,status TEXT',
 enterprise_incidents:'asset_refs TEXT,risk_ref TEXT,bia_ref TEXT,status TEXT',
 policy_versions:'control_refs_json TEXT,risk_refs_json TEXT,status TEXT',
 third_party_profiles:'vendor_id TEXT,status TEXT',third_party_assessments:'vendor_id TEXT,status TEXT',third_party_findings:'vendor_id TEXT,status TEXT',
 enterprise_findings:'risk_ref TEXT,control_ref TEXT,source_ref TEXT,source_type TEXT,status TEXT',
 regulatory_change_impacts:'target_ref TEXT,target_type TEXT,status TEXT',
};
function enterpriseTable(sqlite:DatabaseSync,table:string){sqlite.exec(`CREATE TABLE ${table} (${enterpriseSchema[table]})`)}
test('enterprise references protect core targets including closed historical records',async()=>{
 const cases:[string,string,string,unknown,string?,string?][]=[
  ['Kontroller','evidence_automation_rules','control_refs','other; target'],
  ['Uyum','evidence_automation_rules','control_refs','other\nAST-001'],
  ['Kanıtlar','evidence_automation_runs','evidence_id','target'],
  ['Kanıtlar','evidence_automation_findings','evidence_id','target'],
  ['Kanıtlar','evidence_automation_findings','closure_evidence_ref','AST-001'],
  ['Kontroller','continuous_assurance_exceptions','control_ref','target'],
  ['Uyum','continuous_assurance_exceptions','control_ref','target'],
  ['Risk Assessment','continuous_assurance_exceptions','risk_ref','target'],
  ['Kanıtlar','continuous_assurance_exceptions','evidence_reference','target'],
  ['BIA','enterprise_continuity_plans','bia_ref','target'],
  ['Varlık Envanteri','enterprise_incidents','asset_refs','other, AST-001'],
  ['Risk Assessment','enterprise_incidents','risk_ref','target'],['BIA','enterprise_incidents','bia_ref','target'],
  ['Kontroller','policy_versions','control_refs_json','["target"]'],['Uyum','policy_versions','control_refs_json','["AST-001"]'],['Risk Assessment','policy_versions','risk_refs_json','["other","target"]'],
  ...['third_party_profiles','third_party_assessments','third_party_findings'].map(table=>['Tedarikçiler',table,'vendor_id','target'] as [string,string,string,unknown]),
  ['Risk Assessment','enterprise_findings','risk_ref','target'],['Kontroller','enterprise_findings','control_ref','target'],
  ...Object.entries({audit:'Denetim Yönetimi',control:'Kontroller',risk:'Risk Assessment',vendor:'Tedarikçiler'}).map(([kind,module])=>[module,'enterprise_findings','source_ref','target','source_type',kind] as [string,string,string,unknown,string,string]),
  ...Object.entries({control:'Kontroller',risk:'Risk Assessment',asset:'Varlık Envanteri',vendor:'Tedarikçiler',process:'BIA',audit:'Denetim Yönetimi',evidence:'Kanıtlar'}).map(([kind,module])=>[module,'regulatory_change_impacts','target_ref','target','target_type',kind] as [string,string,string,unknown,string,string]),
 ];
 for(const [module,table,column,value,typeColumn,type] of cases){const f=fixture(module);try{enterpriseTable(f.sqlite,table);f.sqlite.prepare(`INSERT INTO ${table}(${column},status${typeColumn?','+typeColumn:''}) VALUES(?,'closed'${typeColumn?',?':''})`).run(...(typeColumn?[value,type]:[value]) as string[]);await assert.rejects(f.remove(),CoreRecordLinked,`${table}.${column}`);f.retained();}finally{f.sqlite.close()}}
});
test('optional module discovery does not create module tables',async()=>{const f=fixture('BIA');try{const before=f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();await f.remove();assert.deepEqual(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),before);}finally{f.sqlite.close()}});
test('enterprise link added between discovery and delete blocks removal',async()=>{const f=fixture('BIA');try{enterpriseTable(f.sqlite,'enterprise_continuity_plans');f.race(()=>f.sqlite.exec("INSERT INTO enterprise_continuity_plans VALUES('target','draft')"));await assert.rejects(f.remove(),CoreRecordLinked);f.retained();}finally{f.sqlite.close()}});
test('optional table first initialized during deletion forces retry and then detects its reference',async()=>{const f=fixture('BIA');try{f.race(()=>{enterpriseTable(f.sqlite,'enterprise_continuity_plans');f.sqlite.exec("INSERT INTO enterprise_continuity_plans VALUES('target','draft')")});await assert.rejects(f.remove(),LifecycleConflict);f.retained();await assert.rejects(f.remove(),CoreRecordLinked);f.retained();}finally{f.sqlite.close()}});
test('target type prevents unrelated regulatory and finding references from blocking',async()=>{for(const [table,column,typeColumn] of [['regulatory_change_impacts','target_ref','target_type'],['enterprise_findings','source_ref','source_type']]){const f=fixture('Kontroller');try{enterpriseTable(f.sqlite,table);f.sqlite.prepare(`INSERT INTO ${table}(${column},${typeColumn}) VALUES('target','risk')`).run();await f.remove();assert.equal(f.read(),undefined);}finally{f.sqlite.close()}}});
test('legacy scalar policy references are parsed safely, without substring matches',async()=>{for(const reference of ['target','["target"]','["other; AST-001"]','target-extra','{broken json']){const f=fixture('Kontroller');try{enterpriseTable(f.sqlite,'policy_versions');f.sqlite.prepare('INSERT INTO policy_versions(control_refs_json) VALUES(?)').run(reference);if(reference.includes('extra')||reference.includes('broken')){await f.remove();assert.equal(f.read(),undefined)}else{await assert.rejects(f.remove(),CoreRecordLinked);f.retained()}}finally{f.sqlite.close()}}});
test('removing an optional table during the write fails closed and preserves code',async()=>{const f=fixture('BIA');try{enterpriseTable(f.sqlite,'enterprise_continuity_plans');f.race(()=>f.sqlite.exec('DROP TABLE enterprise_continuity_plans'));await assert.rejects(f.remove());f.retained();}finally{f.sqlite.close()}});

test('all enterprise schemas initialized together allow unlinked deletion across core modules',async()=>{for(const moduleName of ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Tedarikçiler','Kontroller','Kanıtlar','Denetim Yönetimi']){const f=fixture(moduleName);try{for(const table of Object.keys(enterpriseSchema))enterpriseTable(f.sqlite,table);await f.remove();assert.equal(f.read(),undefined);}finally{f.sqlite.close()}}});

test('assurance reference races preserve both target and allocated code',async()=>{
 for(const [moduleName,table,column] of [['Kontroller','evidence_automation_rules','control_refs'],['Kanıtlar','evidence_automation_runs','evidence_id'],['Kanıtlar','evidence_automation_findings','closure_evidence_ref'],['Risk Assessment','continuous_assurance_exceptions','risk_ref']]){
  const f=fixture(moduleName);try{enterpriseTable(f.sqlite,table);f.race(()=>f.sqlite.prepare(`INSERT INTO ${table}(${column},status) VALUES(?,'closed')`).run('target'));await assert.rejects(f.remove(),CoreRecordLinked);f.retained();}finally{f.sqlite.close()}
 }
});
test('assurance proof locations and similar identifiers do not falsely match core evidence',async()=>{
 for(const value of ['https://example.com/target','evidence/target','target-extra','AST-0010',null,'']){
  const f=fixture('Kanıtlar');try{enterpriseTable(f.sqlite,'continuous_assurance_exceptions');enterpriseTable(f.sqlite,'evidence_automation_findings');f.sqlite.prepare('INSERT INTO continuous_assurance_exceptions(evidence_reference) VALUES(?)').run(value);f.sqlite.prepare('INSERT INTO evidence_automation_findings(closure_evidence_ref) VALUES(?)').run(value);await f.remove();assert.equal(f.read(),undefined);}finally{f.sqlite.close()}
 }
});
test('assurance links are scoped to their declared target modules',async()=>{
 for(const [table,column] of [['evidence_automation_rules','control_refs'],['evidence_automation_runs','evidence_id'],['continuous_assurance_exceptions','risk_ref']]){
  const f=fixture('BIA');try{enterpriseTable(f.sqlite,table);f.sqlite.prepare(`INSERT INTO ${table}(${column}) VALUES('target')`).run();await f.remove();assert.equal(f.read(),undefined);}finally{f.sqlite.close()}
 }
});
