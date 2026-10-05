import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { editAiModelDraft,deleteAiModelDraft } from '../app/ai/model-drafts';
import { validateAiModel } from '../app/ai/model-inventory';
const stamp='2090-01-01T00:00:00.000Z';
const value=validateAiModel({systemName:'Test system',modelName:'Model',vendor:'Internal',purpose:'A sufficiently described model purpose',owner:'Owner',deployment:'On-Prem',region:'TR',dataClassification:'Internal',autonomy:'Advisory',affectedUsers:2,impact:3,likelihood:3,dataSensitivity:3,autonomyRisk:2,controlMaturity:3,controls:'Human review',reviewDate:'2027-01-01'});
function fixture(status='draft'){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE ai_model_inventory(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,updated_by TEXT,system_name TEXT,model_name TEXT,vendor TEXT,purpose TEXT,owner TEXT,deployment TEXT,region TEXT,data_classification TEXT,autonomy TEXT,affected_users INTEGER,impact INTEGER,likelihood INTEGER,data_sensitivity INTEGER,autonomy_risk INTEGER,control_maturity INTEGER,inherent_score INTEGER,residual_score INTEGER,risk_tier TEXT,controls TEXT,review_date TEXT)');
 sqlite.prepare('INSERT INTO ai_model_inventory(id,status,updated_at,system_name) VALUES(?,?,?,?)').run('AIM-1',status,stamp,'Original');
 function prepare(sql:string,values:(string|number|null)[]=[]){return {bind(...args:(string|number|null)[]){return prepare(sql,args);},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}
 const db={prepare} as unknown as D1Database;
 return {sqlite,row:()=>sqlite.prepare('SELECT * FROM ai_model_inventory').get(),edit:(version=stamp)=>editAiModelDraft(db,{id:'AIM-1',expectedUpdatedAt:version,value,actor:'admin@test.example'}),remove:(version=stamp)=>deleteAiModelDraft(db,{id:'AIM-1',expectedUpdatedAt:version})};
}
test('draft edits persist scored fields and monotonically advance a future version',async()=>{const f=fixture();try{const result=await f.edit();assert.equal(result.status,200);assert.ok(result.updatedAt!>stamp);assert.equal(f.row()!.system_name,value.systemName);assert.equal(f.row()!.residual_score,value.residualScore);assert.equal(f.row()!.updated_by,'admin@test.example');assert.equal((await f.remove(result.updatedAt)).status,200);assert.equal(f.row(),undefined);}finally{f.sqlite.close();}});
test('missing invalid stale and replayed draft versions cannot overwrite or delete current data',async()=>{const f=fixture();try{for(const version of ['', 'invalid','2026-01-01T00:00:00.000Z']){assert.equal((await f.edit(version)).status,409);assert.equal((await f.remove(version)).status,409);}assert.equal((await f.edit()).status,200);const current=f.row();assert.equal((await f.edit()).status,409);assert.equal((await f.remove()).status,409);assert.deepEqual(f.row(),current);}finally{f.sqlite.close();}});
test('approval suspension retirement and missing records defeat draft writes even with a matching version',async()=>{for(const status of ['approved','suspended','retired','unknown']){const f=fixture(status);try{const before=f.row();assert.equal((await f.edit()).status,409);assert.equal((await f.remove()).status,409);assert.deepEqual(f.row(),before);f.sqlite.exec('DELETE FROM ai_model_inventory');assert.equal((await f.edit()).status,409);assert.equal((await f.remove()).status,409);}finally{f.sqlite.close();}}});
