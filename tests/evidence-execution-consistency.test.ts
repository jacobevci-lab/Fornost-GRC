import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureEvidenceAutomationSchema, executeRule, executeDueRules } from '../app/api/evidence-automation/core';
import { EvidenceExecutionConflict } from '../app/evidence/execution-guard';
import { recordEvidenceSourceTest, updateEvidenceSource } from '../app/evidence/source-write';

const now = new Date('2026-10-15T12:00:00Z');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, values: (string|number|null)[] = []) { return {
    bind(...args: (string|number|null)[]) { return prepare(sql,args); },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async all() { return {results:sqlite.prepare(sql).all(...values)}; },
    exec() {
      assert.ok(values.length <= 100, 'D1 binding limit');
      const before = Number(sqlite.prepare('SELECT total_changes() n').get()!.n);
      const results = sqlite.prepare(sql).all(...values);
      return {results,meta:{changes:Number(sqlite.prepare('SELECT total_changes() n').get()!.n)-before}};
    },
    async run() { return this.exec(); },
  }; }
  const db = {prepare,async batch(statements:ReturnType<typeof prepare>[]) {
    sqlite.exec('BEGIN'); try {const result=statements.map(s=>s.exec());sqlite.exec('COMMIT');return result;} catch(error){sqlite.exec('ROLLBACK');throw error;}
  }} as unknown as D1Database;
  await ensureEvidenceAutomationSchema(db);
  sqlite.exec(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('SRC','Fixture','Custom','Custom','rest-json','{"baseUrl":"https://fixture.example/data"}','now','now','qa');
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('RULE','Coverage','SRC','A.8.1','percent','gte','90','daily','now','now','qa');
    CREATE TABLE mutation_log(id INTEGER PRIMARY KEY);
    CREATE TRIGGER rule_log AFTER UPDATE ON evidence_automation_rules BEGIN INSERT INTO mutation_log DEFAULT VALUES; END;`.replace('INSERT INTO mutation_log DEFAULT VALUES','INSERT INTO mutation_log(id) VALUES(NULL)'));
  const run = (percent=95,id='RULE') => executeRule({DB:db},id,'qa','manual',{now,fetcher:async()=>response(percent)});
  const row = () => sqlite.prepare("SELECT * FROM evidence_automation_rules WHERE id='RULE'").get()!;
  const source = () => sqlite.prepare("SELECT * FROM evidence_automation_sources WHERE id='SRC'").get()! as unknown as Parameters<typeof updateEvidenceSource>[1];
  const count = (table:string) => Number(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
  return {sqlite,db,run,row,source,count};
}
const response = (percent:number) => new Response(JSON.stringify({percent}),{headers:{'content-type':'application/json'}});
async function heldRun(f:Awaited<ReturnType<typeof fixture>>,percent=95) {
  let entered!:()=>void, release!:()=>void;
  const ready=new Promise<void>(r=>{entered=r;}),barrier=new Promise<void>(r=>{release=r;});
  const pending=executeRule({DB:f.db},'RULE','qa','manual',{now,fetcher:async()=>{entered();await barrier;return response(percent);}});
  await ready;return{pending,release};
}

test('a late pass cannot overwrite a committed failure or create stale evidence; sequential retries remain valid',async()=>{
  const f=await fixture();try{
    const older=await heldRun(f);const newer=await f.run(40);older.release();await assert.rejects(older.pending,EvidenceExecutionConflict);
    assert.equal(f.row().last_run_id,newer.runId);assert.equal(f.row().last_status,'fail');assert.equal(f.row().consecutive_failures,1);
    assert.equal(f.count('evidence_automation_runs'),1);assert.equal(f.count('simple_grc_records'),2);assert.equal(f.count('evidence_automation_findings'),1);
    await f.run(40);assert.equal(f.row().consecutive_failures,2);assert.equal(f.sqlite.prepare('SELECT occurrence_count n FROM evidence_automation_findings').get()!.n,2);
  }finally{f.sqlite.close();}
});
test('overlapping failures increment a finding once, even when D1 metadata counts trigger writes',async()=>{
  const f=await fixture();try{const one=await heldRun(f,40),two=await heldRun(f,40);one.release();await one.pending;two.release();await assert.rejects(two.pending,EvidenceExecutionConflict);assert.equal(f.row().consecutive_failures,1);assert.equal(f.count('evidence_automation_runs'),1);}finally{f.sqlite.close();}
});
test('mapping, policy, enabled state and source changes discard in-flight results even with unchanged timestamps',async()=>{
  for(const sql of ["UPDATE evidence_automation_rules SET control_refs='A.8.2'","UPDATE evidence_automation_rules SET failure_threshold=2","UPDATE evidence_automation_rules SET enabled=0","UPDATE evidence_automation_sources SET config_json='{}'","UPDATE evidence_automation_sources SET secret_ciphertext='changed'","UPDATE evidence_automation_sources SET enabled=0","DELETE FROM evidence_automation_sources"]){
    const f=await fixture();try{const held=await heldRun(f);f.sqlite.exec(sql);held.release();await assert.rejects(held.pending,EvidenceExecutionConflict);assert.equal(f.count('evidence_automation_runs'),0);assert.equal(f.count('simple_grc_records'),0);assert.equal(f.count('evidence_automation_findings'),0);}finally{f.sqlite.close();}
  }
});
test('connection diagnostics do not invalidate collection, but an old test cannot certify edited credentials',async()=>{
  const f=await fixture();try{const observed=f.source(),held=await heldRun(f);await recordEvidenceSourceTest(f.db,observed,'success',now.toISOString());held.release();assert.equal((await held.pending).status,'pass');f.sqlite.exec("UPDATE evidence_automation_sources SET config_json='{}',last_test_status=NULL");await assert.rejects(recordEvidenceSourceTest(f.db,observed,'success',now.toISOString()),EvidenceExecutionConflict);assert.equal(f.sqlite.prepare('SELECT last_test_status FROM evidence_automation_sources').get()!.last_test_status,null);}finally{f.sqlite.close();}
});
test('changing a collector invalidates current assurance, preserves history and atomically rejects stale edits',async()=>{
  const f=await fixture();try{
    await f.run();const observed=f.source();const next={...observed,config_json:'{"baseUrl":"https://fixture.example/new"}'};
    assert.equal((await updateEvidenceSource(f.db,observed,next,now.toISOString(),'qa')).reassessmentRequired,true);
    assert.equal(f.row().last_status,null);assert.equal(f.row().last_evidence_at,null);assert.equal(f.row().last_run_id,null);assert.equal(f.row().next_run_at,now.toISOString());
    assert.equal(f.count('evidence_automation_runs'),1);assert.equal(f.count('simple_grc_records'),1);
    await assert.rejects(updateEvidenceSource(f.db,observed,{...observed,name:'stale'},now.toISOString(),'qa'),EvidenceExecutionConflict);assert.equal(f.source().config_json,next.config_json);
    await f.run();const current=f.source();await updateEvidenceSource(f.db,current,{...current,name:'Rename'},now.toISOString(),'qa');assert.equal(f.row().last_status,'pass');
  }finally{f.sqlite.close();}
});
test('a dependent write failure rolls back the execution receipt and permits a clean retry',async()=>{
  const f=await fixture();try{f.sqlite.exec("CREATE TRIGGER fail_evidence BEFORE INSERT ON simple_grc_records BEGIN SELECT RAISE(ABORT,'evidence write failed'); END");await assert.rejects(f.run(),/evidence write failed/);assert.equal(f.row().last_run_id,null);assert.equal(f.count('evidence_automation_runs'),0);f.sqlite.exec('DROP TRIGGER fail_evidence');await f.run();assert.equal(f.count('evidence_automation_runs'),1);}finally{f.sqlite.close();}
});
test('source reassessment reset failure rolls back the source edit too',async()=>{
  const f=await fixture();try{await f.run();const before=f.source();f.sqlite.exec("CREATE TRIGGER fail_reset BEFORE UPDATE ON evidence_automation_rules BEGIN SELECT RAISE(ABORT,'reset failed'); END");await assert.rejects(updateEvidenceSource(f.db,before,{...before,config_json:'{}'},now.toISOString(),'qa'),/reset failed/);assert.equal(f.source().config_json,before.config_json);assert.equal(f.row().last_status,'pass');}finally{f.sqlite.close();}
});
test('scheduler isolates failed writes and skips disabled sources while continuing other due rules',async()=>{
  const f=await fixture();try{
    f.sqlite.exec(`INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) SELECT 'SECOND',name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by FROM evidence_automation_rules;
      INSERT INTO evidence_automation_sources SELECT 'OFF',name,vendor,category,driver,0,config_json,secret_ciphertext,last_test_status,last_test_at,created_at,updated_at,updated_by FROM evidence_automation_sources;
      INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) SELECT 'DISABLED',name,'OFF',control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by FROM evidence_automation_rules WHERE id='RULE';
      CREATE TRIGGER fail_first BEFORE INSERT ON evidence_automation_runs WHEN NEW.rule_id='RULE' BEGIN SELECT RAISE(ABORT,'first failed'); END;`);
    const batch=await executeDueRules({DB:f.db},'qa',{now,fetcher:async()=>response(95)});assert.equal(batch.attempted,2);assert.equal(batch.recorded,1);assert.equal(batch.unrecorded,1);assert.equal(batch.results[0].errorCode,'EXECUTION_UNAVAILABLE');assert.equal(batch.results[1].status,'pass');assert.equal(f.row().last_run_id,null);
  }finally{f.sqlite.close();}
});
test('simultaneous cold schema initialization adds the execution receipt idempotently',async()=>{
  const f=await fixture();try{f.sqlite.exec('DROP TRIGGER rule_log; ALTER TABLE evidence_automation_rules DROP COLUMN last_run_id');await Promise.all([ensureEvidenceAutomationSchema(f.db),ensureEvidenceAutomationSchema(f.db)]);assert.equal(f.row().last_run_id,null);}finally{f.sqlite.close();}
});
