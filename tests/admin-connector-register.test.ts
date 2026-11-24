import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeConnectorRegister} from '../app/integrations/connector-register';
test('legacy Jira transport belongs to exactly one enterprise connector and keeps independent health semantics',()=>{
 const transport={provider:'jira',enabled:1,updated_at:'2026-11-24',updated_by:'admin'};
 const rows=mergeConnectorRegister([{kind:'tickets',enabled:0},{kind:'entra',enabled:1}],transport);
 assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.kind)).size,4);
 assert.equal(rows.find(r=>r.kind==='tickets')!.transport,transport);
 assert.equal(rows.find(r=>r.kind==='tickets')!.enabled,0);
 assert.equal(rows.some(r=>r.kind==='jira'),false);
 assert.equal(mergeConnectorRegister([],null).find(r=>r.kind==='tickets')!.transport,null);
});

test('a fresh on-prem connector workspace loads without visiting optional modules and shows real configuration/simulation receipts',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {init}=await import('../app/exchange/store');const {connectorView,configure,simulate}=await import('../app/exchange/connectors');
 const sql=new DatabaseSync(':memory:');type Value=string|number|null;function prepare(q:string,values:Value[]=[]):any{return {bind(...v:Value[]){return prepare(q,v)},async first(){return sql.prepare(q).get(...values)||null},async all(){return {results:sql.prepare(q).all(...values)}},run(){return {meta:{changes:Number(sql.prepare(q).run(...values).changes)}}}}};const db={prepare,async batch(steps:any[]){sql.exec('BEGIN');try{const result=steps.map(s=>s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 try{
  await init(db);let view=await connectorView(db);assert.equal(view.cards.length,4);assert.deepEqual(view.options,[]);assert.deepEqual(view.kris,[]);assert.deepEqual(view.tickets,[]);assert.deepEqual(view.history,[]);
  const env={DB:db,FORNOST_SETTINGS_ENCRYPTION_KEY:'unit-only-connector-key-32-characters'};
  const saved=await configure(env,{kind:'tickets',enabled:true,config:{}},'qa');assert(saved.hook);view=await connectorView(db);assert.equal(view.cards.find(c=>c.kind==='tickets')!.enabled,1);assert((view.history as any[]).some(e=>e.kind==='tickets'&&e.action==='connector-configured'));assert(!JSON.stringify(view).includes(saved.hook));
  await configure(env,{kind:'chat',enabled:true,config:{provider:'slack'},secret:'https://hooks.slack.com/services/TQA/BQA/synthetic-test-only'},'qa');const result=await simulate(env,'chat',{},'qa');assert.equal(result.mutated,false);view=await connectorView(db);assert((view.history as any[]).some(e=>e.kind==='chat'&&e.action==='connector-simulated'));assert(!JSON.stringify(view).includes('synthetic-test-only'));
 }finally{sql.close();}
});
