import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyAiModelDecision } from '../app/ai/model-decisions';

const stamp='2026-10-01T00:00:00.000Z';
function fixture(status='draft',risk='Medium',maturity=3){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE ai_model_inventory(id TEXT PRIMARY KEY,status TEXT,risk_tier TEXT,control_maturity INTEGER,updated_at TEXT,approved_by TEXT,approved_at TEXT,decision_note TEXT,updated_by TEXT)');
 sqlite.prepare('INSERT INTO ai_model_inventory(id,status,risk_tier,control_maturity,updated_at) VALUES(?,?,?,?,?)').run('AIM-1',status,risk,maturity,stamp);
 let beforeWrite:(()=>void)|undefined;
 function prepare(sql:string,values:(string|number|null)[]=[]){return{
  bind(...args:(string|number|null)[]){return prepare(sql,args);},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  exec(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};},
 };}
 sqlite.exec('CREATE TABLE ai_activity_logs(id TEXT PRIMARY KEY,actor TEXT,action TEXT,provider TEXT,model TEXT,prompt_hash TEXT,context_refs_json TEXT,status TEXT,latency_ms INTEGER,detail TEXT,created_at TEXT)');
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeWrite;beforeWrite=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const decide=(status:'approved'|'suspended',expectedUpdatedAt=stamp)=>applyAiModelDecision(db,{id:'AIM-1',status,expectedUpdatedAt,note:'Reviewed current model',actor:'reviewer@test.example'});
 return{sqlite,decide,row:()=>sqlite.prepare('SELECT * FROM ai_model_inventory').get()!,beforeWrite:(hook:()=>void)=>{beforeWrite=hook;}};
}
test('retired and invalid-state models cannot be resurrected by either decision',async()=>{
 for(const state of ['retired','unknown'])for(const target of ['approved','suspended'] as const){const f=fixture(state);try{
  const before=f.row();assert.equal((await f.decide(target)).status,409);assert.deepEqual(f.row(),before);
 }finally{f.sqlite.close();}}
});
test('valid approval, suspension and reapproval update ownership and monotonically advance the version',async()=>{
 const f=fixture();try{
  const first=await f.decide('approved');assert.equal(first.status,200);assert.equal(f.row().approved_by,'reviewer@test.example');
  assert.equal((await f.decide('suspended',first.updatedAt)).status,200);assert.equal(f.row().approved_by,null);
  const second=String(f.row().updated_at);assert.ok(second>String(first.updatedAt));
  assert.equal((await f.decide('approved',second)).status,200);assert.ok(String(f.row().updated_at)>second);
 }finally{f.sqlite.close();}
});
test('missing, stale and replayed decision versions cannot modify the model',async()=>{
 const f=fixture();try{
  for(const version of ['', '2026-09-01T00:00:00.000Z'])assert.equal((await f.decide('approved',version)).status,409);
  assert.equal((await f.decide('approved')).status,200);const approved=f.row();
  assert.equal((await f.decide('suspended')).status,409);assert.deepEqual(f.row(),approved);
  assert.equal((await f.decide('approved',String(approved.updated_at))).status,409);
 }finally{f.sqlite.close();}
});
test('critical risk approval requires sufficient controls while suspension remains available',async()=>{
 for(const maturity of [1,3,4,5]){const f=fixture('draft','Critical',maturity);try{
  assert.equal((await f.decide('approved')).status,maturity>=4?200:409);
  if(maturity<4)assert.equal((await f.decide('suspended')).status,200);
 }finally{f.sqlite.close();}}
});
test('retirement, concurrent edits and policy changes between read and write defeat the conditional update',async()=>{
 for(const change of ["status='retired'","updated_at='2026-10-02T00:00:00.000Z'","risk_tier='Critical',control_maturity=1","status='suspended'"]){const f=fixture();try{
  let changed:unknown;f.beforeWrite(()=>{f.sqlite.exec(`UPDATE ai_model_inventory SET ${change}`);changed=f.row();});
  assert.equal((await f.decide('approved')).status,409);assert.deepEqual(f.row(),changed);
 }finally{f.sqlite.close();}}
});
test('missing models return not found without inserting a replacement',async()=>{
 const f=fixture();try{f.sqlite.exec('DELETE FROM ai_model_inventory');assert.equal((await f.decide('approved')).status,404);}finally{f.sqlite.close();}
});

test('audit failure rolls back model approval and suspension without losing prior approval metadata',async()=>{
 for(const state of ['draft','approved','suspended']){const f=fixture(state);try{const before=f.row();f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ai_activity_logs BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");await assert.rejects(f.decide(state==='approved'?'suspended':'approved'),/injected audit failure/);assert.deepEqual(f.row(),before);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}}
});
test('successful decisions record their model reference once and conflicts produce no success audit',async()=>{
 const f=fixture();try{await f.decide('approved');await f.decide('suspended');const logs=f.sqlite.prepare('SELECT * FROM ai_activity_logs').all();assert.equal(logs.length,1);assert.equal(logs[0].action,'model-inventory-approved');assert.equal(logs[0].actor,'reviewer@test.example');assert.deepEqual(JSON.parse(String(logs[0].context_refs_json)),['AIM-1']);}finally{f.sqlite.close();}
});
