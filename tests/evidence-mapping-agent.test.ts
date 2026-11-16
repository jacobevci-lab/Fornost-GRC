import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {approveMapping,claimMappingRun,ensureMappingSchema,mappingAssessments,mappingControls,mappingHash,parseMappingResponse,type MappingReport,type MappingSource} from '../app/evidence/mapping-agent';
import {ensureEvidenceAutomationSchema,executeRule,requestSource} from '../app/api/evidence-automation/core';
import {providerConfiguration} from '../app/connectors/collector';
import {newConnectorDraft} from '../app/connectors/catalog';
import {encryptSecret} from '../app/api/integrations/security';
import type {RuleInput} from '../app/evidence/rule-write';

const now=new Date('2026-11-16T20:00:00Z'),actor='admin@example.test';
const proposal={templateId:'intune-encryption',controlId:'CTL-001',rationale:'Collected encryption state supports endpoint encryption assessment.',missingEvidence:'Does not establish recovery-key escrow or devices outside the credential scope.'};
async function fixture(){
 const sql=new DatabaseSync(':memory:');let queue=Promise.resolve(),beforeBatch:(()=>void)|undefined;
 function prepare(query:string,values:SQLInputValue[]=[]){return{bind(...args:SQLInputValue[]){return prepare(query,args)},async first(){return sql.prepare(query).get(...values)||null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){return{meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}};}
 const db={prepare,batch(statements:ReturnType<typeof prepare>[]){const op=queue.then(async()=>{beforeBatch?.();beforeBatch=undefined;sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}});queue=op.then(()=>{},()=>{});return op;}} as unknown as D1Database;
 await ensureEvidenceAutomationSchema(db);await ensureMappingSchema(db);
 const guid='11111111-1111-4111-8111-111111111111',key=crypto.randomUUID(),cfg=providerConfiguration({...newConnectorDraft('intune'),providerConfig:{tenantId:guid,clientId:guid}}).config;
 const source:MappingSource={id:'source',name:'Intune',vendor:'Microsoft',category:'Cloud',driver:'provider-v1',enabled:1,config_json:JSON.stringify(cfg),secret_ciphertext:await encryptSecret(JSON.stringify({clientSecret:'synthetic-only-secret'}),key)};
 sql.prepare('INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,enabled,config_json,secret_ciphertext,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(source.id,source.name,source.vendor,source.category,source.driver,1,source.config_json,source.secret_ciphertext,now.toISOString(),now.toISOString(),actor);
 const data=JSON.stringify({controlId:'CTL-001',title:'Endpoint disk encryption',description:'Encrypt managed endpoints',dataClassification:'Internal'});
 sql.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run('CTL-001','Kontroller',data,now.toISOString(),now.toISOString());
 const controls=await mappingControls([{id:'CTL-001',data_json:data}],'Internal');
 let calls=0;
 const fetcher=async(url:string)=>{calls++;return new Response(JSON.stringify(url.includes('/token')?{access_token:'synthetic-token'}:{value:[{id:'private-device-id',deviceName:'private-device-name',complianceState:'compliant',isEncrypted:false,lastSyncDateTime:now.toISOString(),unexpectedSecret:'never forward this'}]}),{headers:{'content-type':'application/json'}})};
 const env={DB:db,FORNOST_SETTINGS_ENCRYPTION_KEY:key};
 const payload=await requestSource(source,env,true,fetcher),assessments=mappingAssessments(source,payload,'en',now);
 const parsed=parseMappingResponse(JSON.stringify({summary:'Negative encryption evidence.',proposals:[proposal]}),controls,assessments);
 const report:MappingReport={sourceId:source.id,collectedAt:now.toISOString(),payloadHash:await mappingHash(payload),assessments,controls,...parsed,catalogTruncated:false};
 const claim=await claimMappingRun(db,source,actor,now);
 sql.prepare("UPDATE evidence_mapping_runs SET status='completed',report_json=? WHERE id=?").run(JSON.stringify(report),claim.id);
 const input=(patch:Partial<RuleInput>={}):RuleInput=>({id:crypto.randomUUID(),name:'Encryption',sourceId:source.id,controlRefs:'CTL-001',jsonPath:'$',operator:'template',expected:'',schedule:'daily',now:now.toISOString(),actor,freshnessHours:48,failureThreshold:1,autoFinding:false,owner:actor,remediationDueDays:7,nextRunAt:now.toISOString(),templateId:'intune-encryption',templateVersion:1,...patch});
 const count=()=>Number(sql.prepare('SELECT count(*) n FROM evidence_automation_rules').get()!.n);
 return{sql,db,env,source,report,claim,input,count,fetcher,calls:()=>calls,race:(fn:()=>void)=>{beforeBatch=fn;}};
}
test('native collection -> aggregate analysis -> explicit approval -> durable mapped evidence',async()=>{
 const f=await fixture();try{
  assert.equal(f.calls(),2);assert.equal(f.report.assessments.find(a=>a.templateId==='intune-encryption')?.status,'fail');
  for(const secret of ['private-device-id','private-device-name','synthetic-only-secret','synthetic-token','unexpectedSecret'])assert.ok(!JSON.stringify(f.report).includes(secret));
  assert.equal(f.count(),0);
  const saved=await approveMapping(f.db,f.claim.id,0,f.input(),f.source);assert.equal(f.count(),1);
  const run=await executeRule(f.env,saved.ruleId,actor,'manual',{fetcher:f.fetcher,now});assert.equal(run.status,'fail');assert.ok(run.evidenceId);
  const evidence=JSON.parse(String(f.sql.prepare('SELECT data_json FROM simple_grc_records WHERE id=?').get(run.evidenceId!)!.data_json));
  assert.equal(evidence.controlRef,'CTL-001');assert.equal(evidence.automationRuleId,saved.ruleId);
  const receipt=f.sql.prepare('SELECT approved_rule_id,approved_by FROM evidence_mapping_runs').get()!;assert.equal(receipt.approved_rule_id,saved.ruleId);assert.equal(receipt.approved_by,actor);
 }finally{f.sql.close()}
});
test('invalid model references, incomplete tests, duplicates and missing limitations fail closed',async()=>{
 const f=await fixture();try{
  const parse=(p:unknown)=>parseMappingResponse(JSON.stringify({summary:'Assessment',proposals:p}),f.report.controls,f.report.assessments);
  for(const p of [[{...proposal,controlId:'invented'}],[{...proposal,templateId:'arbitrary-script'}],[{...proposal,missingEvidence:''}],[proposal,proposal],[null],Array(9).fill(proposal)])assert.throws(()=>parse(p),/MAPPING_INVALID_RESPONSE/);
  assert.throws(()=>parseMappingResponse(JSON.stringify({summary:'x',proposals:[proposal]}),f.report.controls,f.report.assessments.map(a=>({...a,status:'error'}))),/MAPPING_INVALID_RESPONSE/);
  assert.deepEqual(parse([]).proposals,[]);
 }finally{f.sql.close()}
});
test('classification filtering and ambiguous control references do not enter model candidates',async()=>{
 const rows=['Internal','Confidential','Restricted','unknown'].map((classification,i)=>({id:`c${i}`,data_json:JSON.stringify({controlId:`REF${i}`,title:'T',classification})}));
 assert.deepEqual((await mappingControls(rows,'Internal')).map(c=>c.id),['c0']);
 assert.equal((await mappingControls([...rows,rows[0]],'Internal')).length,0);
});
test('canonical control identity wins over shared framework labels; template version changes require a new analysis',async()=>{
 const controls=await mappingControls([{id:'record-a',code:'CTL-001',data_json:'{"controlId":"A.8.24"}'},{id:'record-b',code:'CTL-002',data_json:'{"controlId":"A.8.24"}'}],'Internal');
 assert.deepEqual(controls.map(c=>c.ref),['CTL-001','CTL-002']);
 const f=await fixture();try{await assert.rejects(approveMapping(f.db,f.claim.id,0,f.input({templateVersion:2}),f.source),/MAPPING_CHANGED/);assert.equal(f.count(),0);}finally{f.sql.close()}
});
test('source changes, expired collections and edited controls reject approval',async()=>{
 for(const change of ['source','expiry','control','deleted'] as const){const f=await fixture();try{
  const source={...f.source},input=f.input();
  if(change==='source')source.config_json=JSON.stringify({different:true});
  if(change==='expiry')input.now=new Date(now.getTime()+31*60000).toISOString();
  if(change==='control')f.sql.prepare("UPDATE simple_grc_records SET data_json='{}' WHERE id='CTL-001'").run();
  if(change==='deleted')f.sql.prepare("DELETE FROM simple_grc_records WHERE id='CTL-001'").run();
  await assert.rejects(approveMapping(f.db,f.claim.id,0,input,source),/MAPPING_STALE/);assert.equal(f.count(),0);
 }finally{f.sql.close()}}
});
test('source or control edits racing the insert cannot bind stale analysis',async()=>{
 for(const kind of ['source','control']){const f=await fixture();try{
  f.race(()=>f.sql.exec(kind==='source'?"UPDATE evidence_automation_sources SET name='changed'":"UPDATE simple_grc_records SET data_json='{}' WHERE id='CTL-001'"));
  await assert.rejects(approveMapping(f.db,f.claim.id,0,f.input(),f.source),/MAPPING_STALE/);assert.equal(f.count(),0);
 }finally{f.sql.close()}}
});
test('replaying an approved mapping returns the original rule; removed rules are never resurrected',async()=>{
 const f=await fixture();try{
  const first=await approveMapping(f.db,f.claim.id,0,f.input(),f.source),again=await approveMapping(f.db,f.claim.id,0,f.input(),f.source);assert.equal(first.ruleId,again.ruleId);assert.equal(again.reused,true);assert.equal(f.count(),1);
  f.sql.prepare('DELETE FROM evidence_automation_rules WHERE id=?').run(first.ruleId);
  await assert.rejects(approveMapping(f.db,f.claim.id,0,f.input(),f.source),/MAPPING_ALREADY_USED/);assert.equal(f.count(),0);
 }finally{f.sql.close()}
});
test('approval write failure rolls back the entire rule transaction',async()=>{
 const f=await fixture();try{
  f.sql.exec("CREATE TRIGGER fail_mapping BEFORE UPDATE OF approved_rule_id ON evidence_mapping_runs BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  await assert.rejects(approveMapping(f.db,f.claim.id,0,f.input(),f.source),/test rollback/);assert.equal(f.count(),0);
 }finally{f.sql.close()}
});
test('concurrent approvals of the same proposal create one monitor and return its ID',async()=>{
 const f=await fixture();try{
  const results=await Promise.all(Array.from({length:6},()=>approveMapping(f.db,f.claim.id,0,f.input(),f.source)));
  assert.equal(new Set(results.map(r=>r.ruleId)).size,1);assert.equal(f.count(),1);
 }finally{f.sql.close()}
});
test('atomic analysis rate gate permits at most three requests per actor and minute',async()=>{
 const f=await fixture();try{
  const claims=await Promise.allSettled(Array.from({length:8},()=>claimMappingRun(f.db,f.source,actor,now)));
  assert.equal(claims.filter(r=>r.status==='fulfilled').length,2);
  assert.equal(claims.filter(r=>r.status==='rejected').length,6);
  await claimMappingRun(f.db,f.source,'other@example.test',now);
 }finally{f.sql.close()}
});
test('changed approval settings reject replay and competing requests without replacing the saved monitor',async()=>{
 const f=await fixture();try{
  const requests=await Promise.allSettled([approveMapping(f.db,f.claim.id,0,f.input(),f.source),approveMapping(f.db,f.claim.id,0,f.input({schedule:'weekly'}),f.source)]);
  assert.equal(requests.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.count(),1);
  assert.equal(requests.filter(r=>r.status==='rejected'&&String(r.reason).includes('MAPPING_CHANGED')).length,1);
  await assert.rejects(approveMapping(f.db,f.claim.id,0,f.input({autoFinding:true,owner:'changed@example.test'}),f.source),/MAPPING_CHANGED/);
  assert.equal(f.count(),1);
 }finally{f.sql.close()}
});
test('mapping receipt schema upgrades preserve existing rows and repeat safely',async()=>{
 const f=await fixture();try{
  f.sql.exec('ALTER TABLE evidence_mapping_runs DROP COLUMN approval_input_hash');
  await ensureMappingSchema(f.db);await ensureMappingSchema(f.db);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM evidence_mapping_runs').get()!.n,1);
  await approveMapping(f.db,f.claim.id,0,f.input(),f.source);assert.equal(f.count(),1);
 }finally{f.sql.close()}
});
