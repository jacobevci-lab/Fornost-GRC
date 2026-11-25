import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureEvidenceAutomationSchema} from '../app/api/evidence-automation/core';
import {insertAutomationRule} from '../app/evidence/rule-write';
import {CoreReferenceUnavailable} from '../app/core-reference-write';
import {deleteCoreRecord,CoreRecordLinked} from '../app/core-record-delete';

async function fixture(){
 const sqlite=new DatabaseSync(':memory:');let hook:(()=>void)|undefined;
 type Value=string|number|null;
 function prepare(sql:string,values:Value[]=[]){return{
  bind(...args:Value[]){return prepare(sql,args)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},
  async run(){if(sql.startsWith('INSERT INTO evidence_automation_rules')){const next=hook;hook=undefined;next?.()}return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}},
 };}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}} as unknown as D1Database;
 await ensureEvidenceAutomationSchema(db);
 const now='2026-10-14T00:00:00.000Z',id='CTL-11111111-1111-4111-8111-111111111111';
 function target(moduleName='Kontroller'){sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,moduleName,'{}',now,now);sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run(id,moduleName,'CTL-001',now)}
 const write=(controlRefs:string,template=false)=>insertAutomationRule(db,{id:'rule',name:'Test',sourceId:'source',controlRefs,jsonPath:'$',operator:template?'template':'exists',expected:'',schedule:'daily',now,actor:'qa@example.com',freshnessHours:24,failureThreshold:1,autoFinding:false,owner:'qa@example.com',remediationDueDays:7,nextRunAt:null,...(template?{templateId:'template',templateVersion:1}:{})});
 return{sqlite,db,id,now,target,write,race:(fn:()=>void)=>{hook=fn},count:()=>sqlite.prepare('SELECT count(*) n FROM evidence_automation_rules').get()!.n};
}
test('normal and ready rules accept exact canonical IDs/codes in controls and compliance',async()=>{for(const template of [false,true])for(const moduleName of ['Kontroller','Uyum']){const f=await fixture();try{f.target(moduleName);await f.write(`CTL-001; ${f.id.toUpperCase()}`,template);assert.equal(f.count(),1);assert.equal(f.sqlite.prepare('SELECT template_id FROM evidence_automation_rules').get()!.template_id,template?'template':null)}finally{f.sqlite.close()}}});
test('missing, wrong-module and orphan-code targets reject the entire rule',async()=>{for(const kind of ['missing','wrong-module','orphan'])for(const template of [false,true]){const f=await fixture();try{if(kind==='wrong-module')f.target('Risk Assessment');if(kind==='orphan')f.sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run(f.id,'Kontroller','CTL-001',f.now);await assert.rejects(f.write('ISO27001-A.5.1, CTL-001',template),CoreReferenceUnavailable);assert.equal(f.count(),0)}finally{f.sqlite.close()}}});
test('legacy framework labels remain compatible while a mixed missing canonical link fails',async()=>{const f=await fixture();try{await assert.rejects(f.write('A.5.1 | CTL-999'),CoreReferenceUnavailable);await f.write('A.5.1; ISO27001-A.8.1; Legacy control label');assert.equal(f.count(),1)}finally{f.sqlite.close()}});
test('target deletion immediately before insert cannot create a dangling rule',async()=>{for(const template of [false,true]){const f=await fixture();try{f.target();f.race(()=>f.sqlite.exec('DELETE FROM simple_grc_records'));await assert.rejects(f.write('CTL-001',template),CoreReferenceUnavailable);assert.equal(f.count(),0)}finally{f.sqlite.close()}}});
test('rule creation first blocks later core target deletion',async()=>{const f=await fixture();try{f.target();await f.write('CTL-001');await assert.rejects(deleteCoreRecord(f.db,f.id,{module:'Kontroller',data_json:'{}',updated_at:f.now},f.now),CoreRecordLinked);assert.equal(f.count(),1);assert.ok(f.sqlite.prepare('SELECT id FROM simple_grc_records').get())}finally{f.sqlite.close()}});
test('database failure leaves no partial automation rule',async()=>{const f=await fixture();try{f.target();f.sqlite.exec("CREATE TRIGGER fail_rule BEFORE INSERT ON evidence_automation_rules BEGIN SELECT RAISE(ABORT,'test failure'); END");await assert.rejects(f.write('CTL-001'));assert.equal(f.count(),0)}finally{f.sqlite.close()}});
