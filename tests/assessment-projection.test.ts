import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureEvidenceAutomationSchema, executeRule } from '../app/api/evidence-automation/core';
import { ensureAssuranceWorkSchema } from '../app/continuous-assurance-runtime';
import { loadContinuousAssuranceSnapshots } from '../app/continuous-assurance-store';
import { buildContinuousAssuranceDashboard } from '../app/continuous-assurance-dashboard';
import { loadAuditReadiness } from '../app/audit-readiness-runtime';
import { loadControlAssuranceSnapshot } from '../app/control-assurance-runtime';
import { buildControlAssurance } from '../app/control-assurance';
import { projectAutomatedEvidence } from '../app/evidence/assessment-projection';
import { updateEvidenceSource } from '../app/evidence/source-write';
import { buildAuditReadinessReportHtml, buildAuditReadinessReportCsv } from '../app/audit-readiness-export';

const now=new Date('2026-10-15T12:00:00Z');
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');let queryHook:((sql:string)=>void)|undefined;
  const bindingCounts:number[]=[];
  function prepare(sql:string,values:(string|number|null)[]=[]){return{
    bind(...args:(string|number|null)[]){return prepare(sql,args)},
    async first(){queryHook?.(sql);return sqlite.prepare(sql).get(...values)||null},
    async all(){queryHook?.(sql);bindingCounts.push(values.length);assert.ok(values.length<=100);return{results:sqlite.prepare(sql).all(...values)}},
    exec(){const before=Number(sqlite.prepare('SELECT total_changes() n').get()!.n);const results=sqlite.prepare(sql).all(...values);return{results,meta:{changes:Number(sqlite.prepare('SELECT total_changes() n').get()!.n)-before}}},
    async run(){return this.exec()},
  }}
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}} as unknown as D1Database;
  await ensureEvidenceAutomationSchema(db);await ensureAssuranceWorkSchema(db);
  for(const migration of ['0072_enterprise_findings_capa.sql','0079_evidence_lineage_storage.sql'])sqlite.exec(readFileSync(`drizzle/${migration}`,'utf8'));
  sqlite.exec(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('SRC','Fixture','Custom','Custom','rest-json','{"baseUrl":"https://fixture.example/data"}','now','now','qa');
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,auto_finding,created_at,updated_at,updated_by) VALUES('RULE','Coverage','SRC','A.8.1','percent','gte','90','daily',0,'now','now','qa');`);
  const record=(id:string,module:string,data:Record<string,unknown>)=>sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,module,JSON.stringify(data),now.toISOString(),now.toISOString());
  record('CONTROL','Kontroller',{controlRef:'A.8.1',controlTitle:'Access',owner:'QA',testOwner:'QA',nextTestDate:'2099-01-01'});
  record('AUDIT','Denetim Yönetimi',{auditName:'Projection',controlRef:'A.8.1',requirementRef:'A.8.1'});
  const run=(percent=95)=>executeRule({DB:db},'RULE','qa','manual',{now,fetcher:async()=>new Response(JSON.stringify({percent}),{headers:{'content-type':'application/json'}})});
  const initial=await run();assert.equal(initial.status,'pass');const evidenceId=initial.evidenceId!;
  const evidence=(id=evidenceId)=>({id,data:JSON.parse(String(sqlite.prepare('SELECT data_json FROM simple_grc_records WHERE id=?').get(id)!.data_json)) as Record<string,unknown>});
  const changeEvidence=(patch:Record<string,unknown>)=>sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify({...evidence().data,...patch}),evidenceId);
  const projected=async(at=now)=>(await projectAutomatedEvidence(db,[evidence()],at)).rows[0].data.automationAssessment;
  const sources=(at=now)=>loadContinuousAssuranceSnapshots(db,{now:at});
  const dashboard=async(at=now)=>buildContinuousAssuranceDashboard({...await sources(at),now:at});
  const audit=(at=now)=>loadAuditReadiness(db,'Projection',at);
  const control=async(at=now)=>{const snapshot=await loadControlAssuranceSnapshot(db,at);return buildControlAssurance(snapshot.rows,snapshot.generatedAt).items[0]};
  const history=()=>JSON.stringify({evidence:sqlite.prepare("SELECT * FROM simple_grc_records WHERE module='Kanıtlar' ORDER BY id").all(),runs:sqlite.prepare('SELECT * FROM evidence_automation_runs ORDER BY id').all(),work:sqlite.prepare('SELECT * FROM continuous_assurance_work_items ORDER BY id').all()});
  const work=(id:string,status:string,at:string,decision:Record<string,unknown>={})=>sqlite.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,actor,created_at,updated_at,result_ref) VALUES(?,'F','RULE','control-retest',?,?,'qa',?,?,?)").run(id,status,JSON.stringify({targetControlRef:'A.8.1',...decision}),at,at,initial.runId!);
  return{sqlite,db,run,evidenceId,initial,record,evidence,changeEvidence,projected,sources,dashboard,audit,control,history,work,bindingCounts,setHook(hook?:typeof queryHook){queryHook=hook}};
}

test('real execution receipts certify the same current evidence in audit, control and dashboard without changing history',async()=>{
  const f=await fixture();try{
    const before=f.history();assert.equal(f.evidence().data.automationRunId,f.initial.runId);assert.equal(f.evidence().data.automationRuleId,'RULE');
    assert.equal(await f.projected(),'current');assert.equal((await f.audit()).gate,'ready');assert.equal((await f.control()).state,'healthy');assert.equal((await f.control()).currentEvidenceCount,1);assert.equal((await f.dashboard()).summary.healthy,1);assert.equal(f.history(),before);
    const serialized=JSON.stringify(await f.sources());assert.ok(!serialized.includes('secret_ciphertext'));assert.ok(!serialized.includes('fixture.example'));assert.ok(!serialized.includes('assessment_rule'));
  }finally{f.sqlite.close()}
});
test('source settings, credentials, policy, mapping and A-B-A invalidate otherwise fresh proof across both projections',async()=>{
  for(const mutation of ["UPDATE evidence_automation_sources SET config_json='{}'","UPDATE evidence_automation_sources SET secret_ciphertext='opaque-rotated-credential'","UPDATE evidence_automation_rules SET expected='99'","UPDATE evidence_automation_rules SET freshness_hours=48","UPDATE evidence_automation_rules SET control_refs='A.8.2'","UPDATE evidence_automation_rules SET expected='99'; UPDATE evidence_automation_rules SET expected='90'"]){
    const f=await fixture();try{
      const before=f.history();f.sqlite.exec(mutation);assert.equal(await f.projected(),'configuration-changed',mutation);assert.notEqual((await f.audit()).gate,'ready');assert.notEqual((await f.control()).state,'healthy');assert.equal((await f.control()).currentEvidenceCount,0);assert.equal((await f.dashboard()).summary.healthy,0);assert.equal(f.history(),before);
    }finally{f.sqlite.close()}
  }
});
test('disabled or deleted collectors and rules never leave their old proof current',async()=>{
  for(const mutation of ["UPDATE evidence_automation_sources SET enabled=0","UPDATE evidence_automation_rules SET enabled=0","DELETE FROM evidence_automation_sources","DELETE FROM evidence_automation_rules"]){const f=await fixture();try{f.sqlite.exec(mutation);assert.equal(await f.projected(),'source-unavailable');assert.notEqual((await f.audit()).gate,'ready');assert.equal((await f.control()).currentEvidenceCount,0)}finally{f.sqlite.close()}}
});
test('no-op edits, display names and connection diagnostics preserve assessment, but a source edit requires new proof',async()=>{
  const f=await fixture();try{
    f.sqlite.exec("UPDATE evidence_automation_rules SET expected=expected,name='Renamed'; UPDATE evidence_automation_sources SET name='Renamed',last_test_status='success',last_test_at='now'");assert.equal(await f.projected(),'current');
    const source=f.sqlite.prepare("SELECT * FROM evidence_automation_sources WHERE id='SRC'").get()! as unknown as Parameters<typeof updateEvidenceSource>[1];
    await updateEvidenceSource(f.db,source,{...source,config_json:'{"baseUrl":"https://fixture.example/new"}'},now.toISOString(),'qa');
    assert.notEqual((await f.audit()).gate,'ready');const old=f.evidence().data;await f.run();assert.deepEqual(f.evidence().data,old);assert.equal((await f.audit()).gate,'ready');assert.equal((await f.control()).currentEvidenceCount,1);assert.equal((await f.control()).state,'healthy');
  }finally{f.sqlite.close()}
});
test('missing lineage, altered links, rejected review, invalid expiry and edited control mapping fail closed',async()=>{
  for(const patch of [{assessmentFingerprint:null},{responseHash:'b'.repeat(64)},{automationRunId:'OTHER'},{automationRuleId:'OTHER'},{collectedAt:'bad'},{controlRef:'A.8.2'},{requirementRef:'A.8.2'},{status:'Rejected'},{reviewStatus:'pending-review'},{expiresAt:'2026-02-30'},{freshUntil:now.toISOString()}]){const f=await fixture();try{f.changeEvidence(patch);assert.notEqual(await f.projected(),'current',JSON.stringify(patch));assert.equal((await f.control()).currentEvidenceCount,0);assert.notEqual((await f.audit()).gate,'ready')}finally{f.sqlite.close()}}
  const f=await fixture();try{f.sqlite.exec('UPDATE evidence_automation_runs SET assessment_fingerprint=NULL');assert.equal(await f.projected(),'configuration-unverified')}finally{f.sqlite.close()}
});
test('deleted receipts, deleted evidence and multiple receipts cannot certify one proof',async()=>{
  for(const mode of ['run','evidence','duplicate']){const f=await fixture();try{
    if(mode==='run')f.sqlite.exec('DELETE FROM evidence_automation_runs');
    if(mode==='evidence')f.sqlite.prepare('DELETE FROM simple_grc_records WHERE id=?').run(f.evidenceId);
    if(mode==='duplicate')f.sqlite.exec("INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor,assessment_fingerprint) SELECT 'DUPLICATE',rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor,assessment_fingerprint FROM evidence_automation_runs");
    assert.notEqual((await f.audit()).gate,'ready');assert.equal((await f.control()).currentEvidenceCount,0);assert.equal((await f.dashboard()).summary.healthy,0);
  }finally{f.sqlite.close()}}
});
test('historical retest recovery is current only while its own evidence and configuration remain valid',async()=>{
  for(const mutation of ["UPDATE evidence_automation_rules SET expected='99'","UPDATE simple_grc_records SET data_json=json_set(data_json,'$.reviewStatus','Rejected') WHERE module='Kanıtlar'","DELETE FROM evidence_automation_runs","UPDATE continuous_assurance_work_items SET decision_json=json_set(decision_json,'$.targetControlRef','A.8.2') WHERE id='PASS'","UPDATE continuous_assurance_work_items SET rule_id='OTHER' WHERE id='PASS'"]){const f=await fixture();try{
    f.work('ERROR','retest-error','2026-10-15T10:00:00Z');f.work('PASS','completed','2026-10-15T12:01:00Z',{retestOutcome:{status:'pass',runId:f.initial.runId}});
    assert.equal((await f.dashboard()).summary.failedRetest,0);f.sqlite.exec(mutation);const before=f.history();assert.equal((await f.dashboard()).summary.failedRetest,1,mutation);assert.equal(f.history(),before);
  }finally{f.sqlite.close()}}
});
test('proof expires exactly and a completed work item remains historical without resolving current errors',async()=>{
  const f=await fixture();try{f.work('ERROR','retest-error','2026-10-15T10:00:00Z');f.work('PASS','completed','2026-10-15T12:01:00Z',{retestOutcome:{status:'pass',runId:f.initial.runId}});const at=new Date(now.getTime()+86400000);assert.equal(await f.projected(at),'evidence-stale');assert.equal((await f.dashboard(at)).summary.failedRetest,1);assert.notEqual((await f.audit(at)).gate,'ready')}finally{f.sqlite.close()}
});
test('metadata changes between record and lineage reads are detected and read failures do not certify readiness',async()=>{
  const f=await fixture();try{
    const original=f.evidence();f.changeEvidence({reviewStatus:'Rejected'});assert.equal((await projectAutomatedEvidence(f.db,[original],now)).rows[0].data.automationAssessment,'evidence-mismatch');
    f.setHook(sql=>{if(sql.includes('GROUP BY e.id'))throw Error('unavailable')});assert.equal((await f.audit()).gate,'unverified');assert.ok((await f.audit()).issues.includes('assessment-unavailable'));assert.equal((await loadControlAssuranceSnapshot(f.db,now)).verified,false);
  }finally{f.sqlite.close()}
});
test('out-of-scope legacy automation does not contaminate an audit and approved manual proof keeps its policy',async()=>{
  const f=await fixture();try{
    f.record('EVD-AUTO-OUTSIDE','Kanıtlar',{controlRef:'OUTSIDE',status:'Approved'});assert.equal((await f.audit()).gate,'ready');
    f.record('MANUAL','Kanıtlar',{controlRef:'A.8.1',status:'Approved'});f.sqlite.exec('DELETE FROM evidence_automation_rules');assert.equal((await f.audit()).gate,'ready');assert.equal((await f.control()).currentEvidenceCount,1);
  }finally{f.sqlite.close()}
});
test('projection chunks at 80 IDs, leaves raw snapshots untouched and uses the migrated evidence lookup index',async()=>{
  const f=await fixture();try{
    const rows=Array.from({length:161},(_,i)=>({id:`EVD-AUTO-ORPHAN-${i}`,data:{controlRef:'OUTSIDE',status:'Approved',rawSnapshot:'not-returned-by-join'}}));for(const row of rows)f.record(row.id,'Kanıtlar',row.data);
    f.bindingCounts.length=0;const result=await projectAutomatedEvidence(f.db,rows,now);assert.deepEqual(f.bindingCounts,[80,80,1]);assert.ok(result.rows.every(row=>row.data.automationAssessment==='configuration-unverified'));assert.ok(rows.every(row=>!('automationAssessment' in row.data)));
    f.sqlite.exec('DROP INDEX evidence_automation_runs_evidence_idx');f.sqlite.exec(readFileSync('drizzle/0090_assessment_evidence_lookup.sql','utf8'));await ensureEvidenceAutomationSchema(f.db);
    const plan=f.sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM evidence_automation_runs WHERE evidence_id=?').all(f.evidenceId);assert.match(JSON.stringify(plan),/evidence_automation_runs_evidence_idx/);
  }finally{f.sqlite.close()}
});
test('a failed current run is a blocker and its evidence never adds successful assurance coverage',async()=>{
  const f=await fixture();try{await f.run(40);const dashboard=await f.dashboard();assert.equal(dashboard.summary.healthy,0);assert.equal(dashboard.summary.failing,1);assert.equal(dashboard.summary.assuranceCoverage,50);assert.notEqual((await f.audit()).gate,'ready')}finally{f.sqlite.close()}
});
test('exported evaluations retain their timestamp and localized explanation after a later recovery',async()=>{
  const f=await fixture();try{f.sqlite.exec("UPDATE evidence_automation_rules SET expected='91'");const snapshot=await f.audit();const before=f.history();
    const report={...snapshot.evidence,missing:snapshot.evidence.missing.length,auditName:snapshot.auditName,lang:'en' as const,generatedAt:snapshot.generatedAt,gateLabel:snapshot.gate,assuranceSignals:snapshot.signals};
    const html=buildAuditReadinessReportHtml(report),csv=buildAuditReadinessReportCsv(report);assert.match(html,/Source or control settings changed/);assert.ok(html.includes(snapshot.generatedAt));assert.ok(csv.includes('configuration-changed'));assert.equal(f.history(),before);
    await f.run();assert.equal((await f.audit()).gate,'ready');assert.equal(buildAuditReadinessReportHtml(report),html);
  }finally{f.sqlite.close()}
});

test('expiring evidence remains current until expiry while governed recovery keeps its stricter fresh-proof requirement',async()=>{
  const f=await fixture();try{
    f.work('ERROR','retest-error','2026-10-15T10:00:00Z');f.work('PASS','completed','2026-10-15T12:01:00Z',{retestOutcome:{status:'pass',runId:f.initial.runId}});
    const at=new Date(now.getTime()+21*3600000);assert.equal(await f.projected(at),'current');assert.equal((await f.control(at)).currentEvidenceCount,1);const dashboard=await f.dashboard(at);assert.equal(dashboard.summary.expiring,1);assert.equal(dashboard.summary.failedRetest,1);
  }finally{f.sqlite.close()}
});
