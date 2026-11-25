import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {loadContinuousAssuranceOperationsHealth} from '../app/evidence/operations-health';
import {buildContinuousAssuranceOperationsInsights} from '../app/evidence/operations-insights';
import {evidenceFreshness,controlHealth,validateContinuousControl} from '../app/evidence/continuous-controls';

const now=new Date('2026-10-15T12:00:00Z'),stamp=now.toISOString();
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE evidence_automation_sources(id TEXT PRIMARY KEY,name TEXT,vendor TEXT,category TEXT,enabled INTEGER);
    CREATE TABLE evidence_automation_rules(id TEXT PRIMARY KEY,name TEXT,source_id TEXT,enabled INTEGER,last_status TEXT,last_run_at TEXT,last_evidence_at TEXT,next_run_at TEXT,freshness_hours INTEGER,consecutive_failures INTEGER);
    CREATE TABLE evidence_automation_runs(id TEXT PRIMARY KEY,rule_id TEXT,status TEXT,duration_ms INTEGER,created_at TEXT);
    INSERT INTO evidence_automation_sources VALUES('ON','Enabled','Custom','Custom',1),('OFF','Disabled','Custom','Custom',0);`);
  function prepare(sql:string,values:(string|number|null)[]=[]){return{bind(...args:(string|number|null)[]){return prepare(sql,args)},all(){return{results:sqlite.prepare(sql).all(...values)}}};}
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.all());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}} as unknown as D1Database;
  function rule(id:string,status:string|null='pass',evidence:string|null=stamp,policy=24,source='ON',enabled=1,lastRun:string|null=stamp){sqlite.prepare('INSERT INTO evidence_automation_rules VALUES(?,?,?,?,?,?,?,?,?,0)').run(id,id,source,enabled,status,lastRun,evidence,'2026-10-16T12:00:00Z',policy);}
  function run(id:string,ruleId:string,status='pass',duration:number|null=20,at=stamp){sqlite.prepare('INSERT INTO evidence_automation_runs VALUES(?,?,?,?,?)').run(id,ruleId,status,duration,at);}
  return{sqlite,db,rule,run};
}
test('freshness rejects invalid policies, future dates, and unverified pass states',()=>{
  for(const policy of [NaN,Infinity,0,-1,1.5,8761])assert.equal(evidenceFreshness(stamp,policy,now),'unknown');
  assert.equal(evidenceFreshness('invalid',24,now),'unknown');assert.equal(evidenceFreshness('2026-10-16T12:00:00Z',24,now),'unknown');
  assert.equal(evidenceFreshness('2026-10-14T12:00:00Z',24,now),'stale');
  for(const status of [null,'unknown','success'])assert.equal(controlHealth({enabled:true,lastStatus:status,lastEvidenceAt:stamp,freshnessHours:24,consecutiveFailures:0},now),'unknown');
  assert.throws(()=>validateContinuousControl({schedule:'daily',freshnessHours:0,failureThreshold:1,remediationDueDays:7,autoFinding:true}));
});
test('operational health requires current passing evidence and a valid completed run',async()=>{
  const f=fixture();try{
    f.rule('fresh');f.rule('expiring','pass','2026-10-14T15:00:00Z');f.rule('stale','pass','2026-10-13T12:00:00Z');f.rule('missing','pass',null);f.rule('future','pass','2026-10-16T12:00:00Z');f.rule('bad-date','pass','invalid');f.rule('bad-policy','pass',stamp,0);f.rule('unverified',null);f.rule('fail','fail');f.rule('error','error');f.rule('missing-run','pass',stamp,24,'ON',1,null);f.rule('future-run','pass',stamp,24,'ON',1,'2026-10-16T12:00:00Z');
    const health=await loadContinuousAssuranceOperationsHealth(f.db,now);
    assert.equal(health.summary.operationalRules,12);assert.equal(health.summary.healthyRules,1);assert.equal(health.summary.unhealthyRules,11);assert.equal(health.summary.evidenceReadyRules,2);assert.equal(health.summary.controlFailingRules,1);assert.equal(health.summary.collectionErrorRules,1);
    assert.equal(buildContinuousAssuranceOperationsInsights(health).state,'critical');
  }finally{f.sqlite.close();}
});
test('telemetry filters inactive, orphan, future and out-of-window runs before bounding and ignores absent durations',async()=>{
  const f=fixture();try{
    f.rule('active');f.rule('off-source','pass',stamp,24,'OFF');f.rule('off-rule','pass',stamp,24,'ON',0);
    f.run('pass','active','pass',null);f.run('fail','active','fail',100);f.run('error','active','error',300);f.run('future','active','pass',1,'2026-10-16T12:00:00Z');f.run('old','active','pass',1,'2026-10-14T11:59:59Z');f.run('invalid','active','pass',1,'bad');
    for(let i=0;i<5001;i++)f.run(`inactive-${i}`,i%2?'off-rule':'off-source');f.run('orphan','missing');
    const health=await loadContinuousAssuranceOperationsHealth(f.db,now);assert.equal(health.summary.runs24h,3);assert.equal(health.summary.successRate24h,33.3);assert.equal(health.summary.averageDurationMs24h,200);assert.equal(health.summary.p95DurationMs24h,300);assert.equal(health.connectors.length,1);
  }finally{f.sqlite.close();}
});
test('an exceeded telemetry window fails closed instead of publishing an incomplete success rate',async()=>{
  const f=fixture();try{f.rule('active');for(let i=0;i<5001;i++)f.run(`run-${i}`,'active');await assert.rejects(loadContinuousAssuranceOperationsHealth(f.db,now),/no partial health/);}finally{f.sqlite.close();}
});
test('an empty operations population is idle rather than healthy',async()=>{
  const f=fixture();try{f.sqlite.exec('DELETE FROM evidence_automation_sources');assert.equal(buildContinuousAssuranceOperationsInsights(await loadContinuousAssuranceOperationsHealth(f.db,now)).state,'idle');}finally{f.sqlite.close();}
});
