import { aiModelRelations } from '../app/ai/model-relations';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createAiModel,editAiModelDraft,deleteAiModelDraft } from '../app/ai/model-drafts';
import { validateAiModel } from '../app/ai/model-inventory';
const stamp='2090-01-01T00:00:00.000Z';
const value=validateAiModel({systemName:'Test system',modelName:'Model',vendor:'Internal',purpose:'A sufficiently described model purpose',owner:'Owner',deployment:'On-Prem',region:'TR',dataClassification:'Internal',autonomy:'Advisory',affectedUsers:2,impact:3,likelihood:3,dataSensitivity:3,autonomyRisk:2,controlMaturity:3,controls:'Human review',reviewDate:'2027-01-01'});
function fixture(status='draft'){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('drizzle/0043_fornost_ai_model_inventory.sql','utf8'));
 const storage=readFileSync('app/ai/storage.ts','utf8');for(const match of storage.matchAll(/CREATE TABLE IF NOT EXISTS (ai_\w+) \([\s\S]*?\n\)/g))if(aiModelRelations.some(r=>r.table===match[1]))sqlite.exec(match[0]);
 const cols=sqlite.prepare('PRAGMA table_info(ai_model_inventory)').all().filter(c=>c.notnull||c.pk),seed:Record<string,string>={id:'AIM-1',status,updated_at:stamp,system_name:'Original'};
 sqlite.prepare(`INSERT INTO ai_model_inventory(${cols.map(c=>c.name).join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>seed[String(c.name)]??(String(c.type).includes('INTEGER')?1:'fixture')));
 function prepare(sql:string,values:(string|number|null)[]=[]){return {bind(...args:(string|number|null)[]){return prepare(sql,args);},exec(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}
 sqlite.exec('CREATE TABLE ai_activity_logs(id TEXT PRIMARY KEY,actor TEXT,action TEXT,provider TEXT,model TEXT,prompt_hash TEXT,context_refs_json TEXT,status TEXT,latency_ms INTEGER,detail TEXT,created_at TEXT)');
 let beforeBatch:(()=>void)|undefined;
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 return {sqlite,db,beforeBatch:(fn:()=>void)=>{beforeBatch=fn;},row:()=>sqlite.prepare('SELECT * FROM ai_model_inventory').get(),edit:(version=stamp)=>editAiModelDraft(db,{id:'AIM-1',expectedUpdatedAt:version,value,actor:'admin@test.example'}),remove:(version=stamp)=>deleteAiModelDraft(db,{id:'AIM-1',expectedUpdatedAt:version,actor:'admin@test.example'})};
}
test('draft edits persist scored fields and monotonically advance a future version',async()=>{const f=fixture();try{const result=await f.edit();assert.equal(result.status,200);assert.ok(result.updatedAt!>stamp);assert.equal(f.row()!.system_name,value.systemName);assert.equal(f.row()!.residual_score,value.residualScore);assert.equal(f.row()!.updated_by,'admin@test.example');assert.equal((await f.remove(result.updatedAt)).status,200);assert.equal(f.row(),undefined);}finally{f.sqlite.close();}});
test('missing invalid stale and replayed draft versions cannot overwrite or delete current data',async()=>{const f=fixture();try{for(const version of ['', 'invalid','2026-01-01T00:00:00.000Z']){assert.equal((await f.edit(version)).status,409);assert.equal((await f.remove(version)).status,409);}assert.equal((await f.edit()).status,200);const current=f.row();assert.equal((await f.edit()).status,409);assert.equal((await f.remove()).status,409);assert.deepEqual(f.row(),current);}finally{f.sqlite.close();}});
test('approval suspension retirement and missing records defeat draft writes even with a matching version',async()=>{for(const status of ['approved','suspended','retired','unknown']){const f=fixture(status);try{const before=f.row();assert.equal((await f.edit()).status,409);assert.equal((await f.remove()).status,409);assert.deepEqual(f.row(),before);f.sqlite.exec('DELETE FROM ai_model_inventory');assert.equal((await f.edit()).status,409);assert.equal((await f.remove()).status,409);}finally{f.sqlite.close();}}});

test('audit failures roll back draft creation edit and deletion',async()=>{
 for(const op of ['create','edit','delete']){const f=fixture();try{const original=f.row();f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ai_activity_logs BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");await assert.rejects(op==='create'?createAiModel(f.db,value,'admin@test.example'):op==='edit'?f.edit():f.remove(),/injected audit failure/);assert.deepEqual(f.row(),original);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_model_inventory').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}}
});
test('creation edit and deletion each record one authoritative model reference; stale writes record nothing',async()=>{
 const f=fixture();try{const created=await createAiModel(f.db,value,'admin@test.example');assert.ok(created.id);const edit=await f.edit();await f.edit();await f.remove();await f.remove(edit.updatedAt);const logs=f.sqlite.prepare('SELECT * FROM ai_activity_logs ORDER BY rowid').all();assert.deepEqual(logs.map(l=>l.action),['model-inventory-create','model-inventory-edit','model-inventory-delete']);assert.deepEqual(logs.map(l=>JSON.parse(String(l.context_refs_json))),[[created.id],['AIM-1'],['AIM-1']]);assert.ok(logs.every(l=>l.actor==='admin@test.example'));}finally{f.sqlite.close();}
});

function seedRelation(f:ReturnType<typeof fixture>,table:string,column:string){
 const cols=f.sqlite.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.notnull||c.pk||c.name===column);
 f.sqlite.prepare(`INSERT INTO ${table}(${cols.map(c=>c.name).join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>c.name===column?'AIM-1':/INTEGER|REAL/.test(String(c.type))?1:'fixture'));
}
test('every native model relation including replacement models blocks deletion and emits no deletion audit',async()=>{
 for(const {table,column} of aiModelRelations){const f=fixture();try{seedRelation(f,table,column);const original=f.row();assert.equal((await f.remove()).status,409,`${table}.${column}`);assert.deepEqual(f.row(),original);assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_activity_logs').get()!.n,0);}finally{f.sqlite.close();}}
});
test('a relation created immediately before the conditional delete protects both records',async()=>{
 const f=fixture();try{const original=f.row();f.beforeBatch(()=>seedRelation(f,'ai_findings','model_id'));assert.equal((await f.remove()).status,409);assert.deepEqual(f.row(),original);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_findings').get()!.n,1);}finally{f.sqlite.close();}
});
test('records belonging to another model and audit history do not block an otherwise unused draft',async()=>{
 const f=fixture();try{seedRelation(f,'ai_findings','model_id');f.sqlite.exec("UPDATE ai_findings SET model_id='OTHER'");const updated=await f.edit();assert.equal((await f.remove(updated.updatedAt)).status,200);assert.equal(f.row(),undefined);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM ai_findings').get()!.n,1);}finally{f.sqlite.close();}
});
test('the deletion registry covers every native model reference in the runtime schema',()=>{
 const storage=readFileSync('app/ai/storage.ts','utf8'),relations:string[]=[];
 for(const match of storage.matchAll(/CREATE TABLE IF NOT EXISTS (ai_\w+) \(([\s\S]*?)\n\)/g))for(const col of ['model_id','replacement_model_id'])if(new RegExp('\\b'+col+' TEXT').test(match[2]))relations.push(`${match[1]}.${col}`);
 assert.deepEqual(aiModelRelations.map(r=>`${r.table}.${r.column}`).sort(),relations.sort());
});
