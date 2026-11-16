import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {ensureEvidenceAutomationSchema} from '../app/api/evidence-automation/core';
import {insertEvidenceSource,SourceCreationConflict,type SourceCreationInput} from '../app/evidence/source-create';

async function fixture(){
 const sql=new DatabaseSync(':memory:');let queue=Promise.resolve();
 function prepare(query:string,values:SQLInputValue[]=[]){return {
  bind(...args:SQLInputValue[]){return prepare(query,args)},
  async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}},
 };}
 const db={prepare,batch(statements:ReturnType<typeof prepare>[]){
  const operation=queue.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}});
  queue=operation.then(()=>{},()=>{});return operation;
 }} as unknown as D1Database;
 await ensureEvidenceAutomationSchema(db);
 const input=(patch:Partial<SourceCreationInput>={}):SourceCreationInput=>({id:crypto.randomUUID(),name:'QA source',vendor:'QA',category:'Work & Custom',driver:'rest-json',config_json:'{"baseUrl":"https://example.com/data","authType":"bearer"}',secret_ciphertext:`encrypted-${crypto.randomUUID()}`,secret:'synthetic-fixture-credential',encryptionKey:'synthetic-fixture-encryption-key',now:'2026-11-16T10:00:00.000Z',actor:'admin@example.test',...patch});
 const save=(key?:string,patch:Partial<SourceCreationInput>={})=>insertEvidenceSource(db,input(patch),key);
 const count=(table:string)=>Number(sql.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
 return {sql,db,save,count};
}
test('lost source acknowledgement returns the original source without overwriting configuration, credentials or assessments',async()=>{
 const f=await fixture();try{
  const key=crypto.randomUUID(),first=await f.save(key);assert.equal(first.reused,false);
  f.sql.prepare("UPDATE evidence_automation_sources SET enabled=0,last_test_status='success',last_test_at='later',name='Reviewed source' WHERE id=?").run(first.sourceId);
  f.sql.prepare("INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by,last_status,last_run_id,next_run_at) VALUES('rule','Rule',?,'CTL-1','$.healthy','exists','','daily','then','then','admin','pass','run','tomorrow')").run(first.sourceId);
  const before=f.sql.prepare('SELECT * FROM evidence_automation_sources').get(),rule=f.sql.prepare('SELECT * FROM evidence_automation_rules').get();
  assert.deepEqual(await f.save(key,{now:'2026-11-17T10:00:00.000Z',config_json:'{"authType":"bearer","baseUrl":"https://example.com/data"}'}),{sourceId:first.sourceId,reused:true});
  assert.deepEqual(f.sql.prepare('SELECT * FROM evidence_automation_sources').get(),before);assert.deepEqual(f.sql.prepare('SELECT * FROM evidence_automation_rules').get(),rule);
  assert.equal(f.count('evidence_automation_sources'),1);assert.equal(f.count('evidence_source_creation_requests'),1);
 }finally{f.sql.close()}
});
test('eight concurrent identical creates commit one source and receipt',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),results=await Promise.all(Array.from({length:8},()=>f.save(key)));
 assert.equal(new Set(results.map(r=>r.sourceId)).size,1);assert.equal(results.filter(r=>!r.reused).length,1);assert.equal(f.count('evidence_automation_sources'),1);assert.equal(f.count('evidence_source_creation_requests'),1);
}finally{f.sql.close()}});
test('different credentials/configuration and competing requests conflict without overwriting the winner',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),results=await Promise.allSettled([f.save(key),f.save(key,{secret:'competing-credential'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.ok(rejected.reason instanceof SourceCreationConflict);assert.ok(rejected.reason.sourceId);
 const original=f.sql.prepare('SELECT * FROM evidence_automation_sources').get();
 for(const patch of [{name:'Changed'},{secret:'another-credential'},{config_json:'{"baseUrl":"https://example.com/other"}'},{driver:'https-bridge'},{encryptionKey:'rotated-server-key'}])await assert.rejects(f.save(key,patch),SourceCreationConflict);
 assert.deepEqual(f.sql.prepare('SELECT * FROM evidence_automation_sources').get(),original);assert.equal(f.count('evidence_automation_sources'),1);
}finally{f.sql.close()}});
test('actor and new-request scopes remain separate; malformed keys never write',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),a=await f.save(key),replay=await f.save(key,{actor:'ADMIN@EXAMPLE.TEST'}),b=await f.save(key,{actor:'other@example.test'}),c=await f.save(crypto.randomUUID());
 assert.equal(replay.sourceId,a.sourceId);assert.equal(new Set([a.sourceId,b.sourceId,c.sourceId]).size,3);
 for(const key of ['',null,12,{},'not-a-uuid'])await assert.rejects(f.save(key as string));assert.equal(f.count('evidence_automation_sources'),3);
}finally{f.sql.close()}});
test('credential receipts contain keyed fingerprints and never plaintext or reusable ciphertext',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID();await f.save(key,{secret:'fixture-secret-not-a-real-account',secret_ciphertext:'fixture-encrypted-value'});
 const receipt=f.sql.prepare('SELECT * FROM evidence_source_creation_requests').get()!;assert.match(String(receipt.payload_hash),/^hmac-v1:[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(receipt),/fixture-secret|fixture-encrypted/);
 const before=f.count('evidence_automation_sources');await assert.rejects(f.save(crypto.randomUUID(),{encryptionKey:''}));assert.equal(f.count('evidence_automation_sources'),before);
}finally{f.sql.close()}});
test('public sources work without a settings key and replay safely',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),patch={secret:'',secret_ciphertext:null,encryptionKey:''},first=await f.save(key,patch);assert.equal((await f.save(key,patch)).sourceId,first.sourceId);
 assert.match(String(f.sql.prepare('SELECT payload_hash FROM evidence_source_creation_requests').get()!.payload_hash),/^public-v1:/);
}finally{f.sql.close()}});
test('a removed source is not resurrected and no stale source ID is disclosed',async()=>{const f=await fixture();try{
 const key=crypto.randomUUID(),first=await f.save(key);f.sql.prepare('DELETE FROM evidence_automation_sources WHERE id=?').run(first.sourceId);
 await assert.rejects(f.save(key),(e:unknown)=>e instanceof SourceCreationConflict&&e.sourceId==='');assert.equal(f.count('evidence_automation_sources'),0);assert.equal(f.count('evidence_source_creation_requests'),1);
}finally{f.sql.close()}});
test('receipt failures roll back the source; legacy creation and repeated schema setup still work',async()=>{const f=await fixture();try{
 f.sql.exec("CREATE TRIGGER reject_source_receipt BEFORE INSERT ON evidence_source_creation_requests BEGIN SELECT RAISE(ABORT,'receipt-failed'); END");
 await assert.rejects(f.save(crypto.randomUUID()));assert.equal(f.count('evidence_automation_sources'),0);assert.equal(f.count('evidence_source_creation_requests'),0);
 await ensureEvidenceAutomationSchema(f.db);await f.save();await f.save();assert.equal(f.count('evidence_automation_sources'),2);
}finally{f.sql.close()}});
