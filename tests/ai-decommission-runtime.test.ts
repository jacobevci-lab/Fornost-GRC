import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { transitionAiDecommission } from '../app/ai/decommission-runtime';
const stamp='2026-10-01T00:00:00.000Z',clock=new Date('2026-10-05T00:00:00.000Z');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('drizzle/0043_fornost_ai_model_inventory.sql','utf8'));sqlite.exec(readFileSync('drizzle/0062_fornost_ai_decommission.sql','utf8'));
 sqlite.exec('CREATE TABLE ai_activity_logs(id TEXT PRIMARY KEY,actor TEXT,action TEXT,provider TEXT,model TEXT,prompt_hash TEXT,context_refs_json TEXT,status TEXT,latency_ms INTEGER,detail TEXT,created_at TEXT)');
 function seed(table:string,values:Record<string,string|number>){const cols=sqlite.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.notnull||c.pk);sqlite.prepare(`INSERT INTO ${table}(${cols.map(c=>c.name).join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>values[String(c.name)]??(String(c.type).includes('INTEGER')?1:'fixture')));}
 seed('ai_model_inventory',{id:'MODEL',status:'approved',updated_at:stamp});
 seed('ai_decommission_plans',{id:'PLAN',model_id:'MODEL',status:'draft',planned_at:'2026-10-05',created_by:'maker@example.test',updated_at:stamp});
 let beforeBatch:(()=>void)|undefined;
 function prepare(sql:string,args:(string|number|null)[]=[]){return{bind(...values:(string|number|null)[]){return prepare(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},exec(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const row=()=>sqlite.prepare("SELECT * FROM ai_decommission_plans WHERE id='PLAN'").get()!;
 const model=()=>sqlite.prepare("SELECT * FROM ai_model_inventory WHERE id='MODEL'").get()!;
 const run=(action:string,actor='reviewer@example.test',overrides:Record<string,unknown>={})=>transitionAiDecommission(db,'PLAN',{action,expectedUpdatedAt:row().updated_at,note:'Reviewed retirement evidence',confirmation:{approve:'PLANI ONAYLA',reject:'PLANI REDDET',start:'EMEKLİLİĞİ BAŞLAT',verify:'İMHAYI DOĞRULA'}[action],evidenceReference:'EVD-retirement',evidenceSha256:'a'.repeat(64),trafficDisabled:true,accessRevoked:true,secretsRevoked:true,dependenciesMigrated:true,dataDispositioned:true,artifactsDispositioned:true,monitoringClosed:true,...overrides},actor,clock);
 return{sqlite,run,row,model,beforeBatch:(hook:()=>void)=>{beforeBatch=hook;}};
}
test('independent approval, execution and verification atomically retire the model with one audit event per step',async()=>{
 const f=fixture();try{assert.equal((await f.run('approve')).code,200);assert.equal((await f.run('start','executor@example.test')).code,200);assert.equal((await f.run('verify')).code,200);assert.equal(f.row().status,'completed');assert.equal(f.model().status,'retired');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,3);assert.equal((await f.run('verify')).code,409);}finally{f.sqlite.close();}
});
test('maker-checker and planned date guards cannot be bypassed by email case or whitespace',async()=>{
 const f=fixture();try{assert.equal((await f.run('approve',' MAKER@EXAMPLE.TEST ')).code,409);await f.run('approve');f.sqlite.exec("UPDATE ai_decommission_plans SET planned_at='2027-01-01'");assert.equal((await f.run('start')).code,409);f.sqlite.exec("UPDATE ai_decommission_plans SET planned_at='2026-10-05'");await f.run('start','executor@example.test');assert.equal((await f.run('verify',' EXECUTOR@EXAMPLE.TEST ')).code,409);}finally{f.sqlite.close();}
});
test('missing and stale client versions leave the plan and audit untouched',async()=>{
 const f=fixture();try{for(const version of ['', 'old'])assert.equal((await f.run('approve',undefined,{expectedUpdatedAt:version})).code,409);assert.equal(f.row().status,'draft');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}
});
test('a concurrent plan change defeats every dependent write',async()=>{
 const f=fixture();try{await f.run('approve');await f.run('start','executor@example.test');f.beforeBatch(()=>f.sqlite.exec("UPDATE ai_decommission_plans SET reason='changed'"));assert.equal((await f.run('verify')).code,409);assert.equal(f.model().status,'approved');assert.equal(f.row().status,'executing');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,2);}finally{f.sqlite.close();}
});
test('a concurrent model change or invalid replacement prevents plan advancement',async()=>{
 for(const change of ["UPDATE ai_model_inventory SET status='suspended'","UPDATE ai_decommission_plans SET replacement_model_id='missing'"]){const f=fixture();try{f.beforeBatch(()=>f.sqlite.exec(change));assert.equal((await f.run('approve')).code,409);assert.equal(f.row().status,'draft');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}}
});
test('model write failure rolls back plan completion and audit',async()=>{
 const f=fixture();try{await f.run('approve');await f.run('start','executor@example.test');f.sqlite.exec("CREATE TRIGGER fail_model BEFORE UPDATE ON ai_model_inventory BEGIN SELECT RAISE(ABORT,'injected model failure'); END");await assert.rejects(f.run('verify'),/injected model failure/);assert.equal(f.row().status,'executing');assert.equal(f.model().status,'approved');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,2);}finally{f.sqlite.close();}
});
test('audit failure rolls back both model retirement and plan completion',async()=>{
 const f=fixture();try{await f.run('approve');await f.run('start','executor@example.test');f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ai_activity_logs BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");await assert.rejects(f.run('verify'),/injected audit failure/);assert.equal(f.row().status,'executing');assert.equal(f.model().status,'approved');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,2);}finally{f.sqlite.close();}
});
