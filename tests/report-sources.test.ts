import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {collectReportSources,reportSources,REPORT_SOURCE_LIMIT} from '../app/report-sources';
import {scopeRoute} from '../app/enterprise/scope';
import {scopedApiAllowed} from '../app/module-access';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of ['0043_fornost_ai_model_inventory.sql','0070_policy_lifecycle_management.sql','0073_enterprise_incident_crisis.sql','0074_business_continuity_resilience.sql','0068_regulatory_change_intelligence.sql','0085_audit_request_workflow.sql'])sql.exec(readFileSync(`drizzle/${file}`,'utf8'));
 sql.exec(`CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT,code TEXT);
 CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE risk_appetite_statements(id TEXT PRIMARY KEY,code TEXT,kri_name TEXT,statement TEXT,owner TEXT,reviewer TEXT,status TEXT,next_measurement TEXT,created_at TEXT,updated_at TEXT);`);
 const now='2026-11-25T12:00:00Z';
 function insert(table:string,overrides:Record<string,unknown>={}){
  const columns=sql.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{name:string;type:string;notnull:number;dflt_value:unknown}>;
  const defaults:Record<string,unknown>={id:table,code:`NATIVE-${table}`,title:'Yetki Yönetimi',name:'Denetim',owner:'owner@test.test',reviewer:'reviewer@test.test',status:'draft',created_at:now,updated_at:now,data_json:'{}',revision:now};
  const fields=Object.fromEntries(columns.filter(c=>c.notnull||c.name in defaults||c.name in overrides).map(c=>[c.name,overrides[c.name]??defaults[c.name]??(/INT|REAL/.test(c.type)?1:'fixture')]));
  const keys=Object.keys(fields);sql.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(fields) as (string|number|null)[]);
 }
 for(const s of reportSources){insert(s.table,s.type==='pbc-request'?{audit_id:'simple_audits',data_json:JSON.stringify({title:'PBC',owner:'owner',reviewer:'reviewer',status:'submitted',requirementId:'requirement',dueDate:'2026-12-01',evidence:[{evidenceId:'evidence',versionNo:2,period:'2026',fileKey:'SECRET-OBJECT-KEY'}],instructions:'PRIVATE INSTRUCTIONS'})}:{});}
 const code=sql.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?)');
 for(const [key,value] of [['ai_model_inventory','AIS-001'],['policy_documents','POL-001'],['enterprise:audit:simple_audits','AUD-001'],['enterprise:incident:enterprise_incidents','INC-001'],['enterprise:continuity-plan:enterprise_continuity_plans','BCP-001'],['enterprise:regulatory-source:regulatory_intelligence_sources','RGS-001'],['work:regulatory-change:regulatory_changes','RGC-001'],['work:audit-request:audit_requests','ARQ-001'],['enterprise:risk-appetite:risk_appetite_statements','RAP-001'],['evidence','EVD-001'],['requirement','AUD-002']])code.run(key,'test',value);
 function prepare(query:string,args:(string|number|null)[]=[]){return{bind(...values:(string|number|null)[]){return prepare(query,values);},async all(){return {success:true,results:sql.prepare(query).all(...args)};}};}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sql.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.all()));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 return {sql,db,insert};
}
test('all seven workflow modules use real code registry and PBC version links without secrets or mutations',async()=>{
 const {sql,db}=fixture();try{
  const before=sql.prepare('SELECT total_changes() n').get()?.n,result=await collectReportSources(db,true);
  assert.equal(result.complete,true);assert.equal(result.records.length,9);assert.equal(new Set(result.records.map(r=>r.module)).size,7);
  for(const code of ['AIS-001','POL-001','AUD-001','INC-001','BCP-001','RGC-001','RGS-001','ARQ-001','RAP-001'])assert.ok(result.records.some(r=>r.code===code),code);
  const pbc=result.records.find(r=>r.code==='ARQ-001')!;assert.equal(pbc.data.auditRef,'AUD-001');assert.equal(pbc.data.requirementRef,'AUD-002');assert.equal(pbc.data.evidenceRefs,'EVD-001 · v2 · 2026');
  assert.doesNotMatch(JSON.stringify(result),/SECRET-OBJECT-KEY|PRIVATE INSTRUCTIONS|fileKey/);assert.equal(sql.prepare('SELECT total_changes() n').get()?.n,before);
 }finally{sql.close();}
});
test('non-admin report projection never queries or returns admin-only AI inventory',async()=>{
 const {sql,db}=fixture();try{sql.exec('ALTER TABLE ai_model_inventory RENAME COLUMN system_name TO inaccessible');const result=await collectReportSources(db,false);assert.equal(result.records.length,8);assert.ok(!result.modules.includes('AI Yönetişimi'));assert.ok(result.records.every(r=>r.module!=='AI Yönetişimi'));}finally{sql.close();}
});
test('uninitialized sources are explicit; SQL errors and limits reject instead of publishing a partial report',async()=>{
 const {sql,db,insert}=fixture();try{
  sql.exec('DROP TABLE policy_documents');const result=await collectReportSources(db,true);assert.ok(result.uninitialized.includes('Politika Merkezi'));
  sql.exec('ALTER TABLE simple_audits RENAME COLUMN name TO broken');await assert.rejects(collectReportSources(db,true));sql.exec('ALTER TABLE simple_audits RENAME COLUMN broken TO name');
  sql.exec('BEGIN');for(let i=0;i<REPORT_SOURCE_LIMIT;i++)insert('simple_audits',{id:`extra-${i}`});sql.exec('COMMIT');await assert.rejects(collectReportSources(db,true),/limit/);
 }finally{sql.close();}
});
test('new report route does not broaden entity or module scope permissions',()=>{
 assert.equal(scopeRoute({role:'contributor',group:false,selected:'entity',restricted:true},'/api/reports/sources','GET'),false);
 assert.equal(scopeRoute({role:'group-admin',group:true,selected:'entity',restricted:true},'/api/reports/sources','GET'),false);
 assert.equal(scopedApiAllowed({role:'Editor',moduleAccess:{mode:'scoped',modules:{'Kanıtlar':'read'}}},'/api/reports/sources','GET'),false);
});
