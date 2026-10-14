import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureEvidenceAutomationSchema} from '../app/api/evidence-automation/core';
import {ensureAssuranceExceptionSchema} from '../app/assurance-exception-schema';
import {insertAssuranceException} from '../app/assurance-exception-write';
import {type AssuranceExceptionProposal} from '../app/assurance-governance';
import {CoreReferenceUnavailable} from '../app/core-reference-write';
import {deleteCoreRecord,CoreRecordLinked} from '../app/core-record-delete';

async function fixture(){
 const sqlite=new DatabaseSync(':memory:');let hook:(()=>void)|undefined;
 type Value=string|number|null;
 function prepare(sql:string,values:Value[]=[]){return{
  bind(...args:Value[]){return prepare(sql,args)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},
  async run(){if(sql.startsWith('INSERT INTO continuous_assurance_exceptions')){const next=hook;hook=undefined;next?.()}return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}},
 };}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}} as unknown as D1Database;
 await ensureEvidenceAutomationSchema(db);await ensureAssuranceExceptionSchema(db);
 const now='2026-10-14T00:00:00.000Z',id='CTL-11111111-1111-4111-8111-111111111111';
 function target(moduleName='Kontroller'){sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,moduleName,'{}',now,now);sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run(id,moduleName,'CTL-001',now)}
 const write=(patch:Partial<AssuranceExceptionProposal>={})=>insertAssuranceException(db,'exception',{
 findingId:'',ruleId:'',controlRef:'CTL-001',riskRef:'',reason:'Documented temporary exception rationale',expiresAt:'2026-10-15',evidenceReference:'https://proof.example/document',evidenceSha256:'a'.repeat(64),...patch,
 },'maker@example.com',now);
 return{sqlite,db,id,now,target,write,race:(fn:()=>void)=>{hook=fn},count:()=>sqlite.prepare('SELECT count(*) n FROM continuous_assurance_exceptions').get()!.n};
}
const mappings=[['controlRef','Kontroller'],['controlRef','Uyum'],['riskRef','Risk Assessment'],['evidenceReference','Kanıtlar']] as const;
test('exception intake accepts canonical IDs and codes only in the allowed target modules',async()=>{
 for(const [field,moduleName] of mappings)for(const useId of [false,true]){const f=await fixture();try{
 f.target(moduleName);await f.write({controlRef:'legacy clause', [field]:useId?f.id.toUpperCase():'ctl-001'});
 const row=f.sqlite.prepare('SELECT * FROM continuous_assurance_exceptions').get()!;
 assert.equal(row.status,'pending-review');assert.equal(row.submitted_by,'maker@example.com');assert.equal(row.retest_required,0);assert.equal(row.evidence_sha256,'a'.repeat(64));assert.equal(row.lifecycle_updated_at,f.now);
 }finally{f.sqlite.close()}}
});
test('missing, wrong-module, orphan-code and mixed-list links reject the whole exception',async()=>{
 for(const [field] of mappings)for(const kind of ['missing','wrong-module','orphan','mixed']){const f=await fixture();try{
 if(kind==='wrong-module')f.target('Varlık Envanteri');
 if(kind==='orphan')f.sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,?)').run(f.id,'Kontroller','CTL-001',f.now);
 await assert.rejects(f.write({controlRef:'legacy clause',[field]:kind==='mixed'?'legacy clause; CTL-001':'CTL-001'}),CoreReferenceUnavailable);assert.equal(f.count(),0);
 }finally{f.sqlite.close()}}
});
test('legacy labels and external proof paths are preserved without substring matching',async()=>{
 const f=await fixture();try{await f.write({controlRef:'ISO27001-A.5.1',riskRef:'Legacy risk',evidenceReference:'https://proof.example/EVD-999?ref=CTL-001'});assert.equal(f.count(),1)}finally{f.sqlite.close()}
});
test('deletion immediately before exception insertion cannot leave a canonical dangling link',async()=>{
 for(const [field,moduleName] of mappings){const f=await fixture();try{f.target(moduleName);f.race(()=>f.sqlite.exec('DELETE FROM simple_grc_records'));await assert.rejects(f.write({controlRef:'legacy clause',[field]:'CTL-001'}),CoreReferenceUnavailable);assert.equal(f.count(),0)}finally{f.sqlite.close()}}
});
test('exception insertion first protects every linked core module from deletion',async()=>{
 for(const [field,moduleName] of mappings){const f=await fixture();try{f.target(moduleName);await f.write({controlRef:'legacy clause',[field]:'CTL-001'});await assert.rejects(deleteCoreRecord(f.db,f.id,{module:moduleName,data_json:'{}',updated_at:f.now},f.now),CoreRecordLinked);assert.equal(f.count(),1);assert.ok(f.sqlite.prepare('SELECT id FROM simple_grc_records').get())}finally{f.sqlite.close()}}
});
test('database failure leaves no request and a corrected reference can be resubmitted',async()=>{
 const f=await fixture();try{await assert.rejects(f.write(),CoreReferenceUnavailable);f.target();f.sqlite.exec("CREATE TRIGGER fail_exception BEFORE INSERT ON continuous_assurance_exceptions BEGIN SELECT RAISE(ABORT,'test failure'); END");await assert.rejects(f.write(),/test failure/);assert.equal(f.count(),0);f.sqlite.exec('DROP TRIGGER fail_exception');await f.write();assert.equal(f.count(),1)}finally{f.sqlite.close()}
});
