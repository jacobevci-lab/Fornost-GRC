import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { aiRecordQueryId,aiWorkStateQuery,readAiRecords } from '../app/ai/record-reads';
test('exact record query rejects empty duplicate oversized padded and control-character IDs',()=>{
 assert.equal(aiRecordQueryId(new URLSearchParams()),null);
 assert.equal(aiRecordQueryId(new URLSearchParams({id:'AIM-1'})),'AIM-1');
 for(const query of ['id=','id=one&id=two',new URLSearchParams({id:'x'.repeat(101)}).toString(),'id=%20AIM-1','id=AIM-1%0A'])assert.throws(()=>aiRecordQueryId(new URLSearchParams(query)));
});
test('native exact reads find records outside all three 500-row lists and never fall back',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 function prepare(sql:string,values:string[]=[]){return {bind(...args:string[]){return prepare(sql,args);},async all(){return {results:sqlite.prepare(sql).all(...values)};}};}
 const db={prepare} as unknown as D1Database;
 try{for(const [kind,table] of [['models','ai_model_inventory'],['alerts','ai_assurance_alerts'],['findings','ai_findings']] as const){
  sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,risk_tier TEXT,severity TEXT,review_date TEXT,last_seen_at TEXT,due_date TEXT,updated_at TEXT)`);
  const insert=sqlite.prepare(`INSERT INTO ${table} VALUES(?,?,?,'2026-01-01','2026-01-01','2026-01-01','2026-01-01')`);
  for(let i=0;i<500;i++)insert.run(`first-${i}`,'Critical','Critical');insert.run('last-record','Low','Low');
  const list=(await readAiRecords(db,kind,null)).results!;assert.equal(list.length,500);assert.ok(!list.some(row=>row.id==='last-record'));
  const exact=(await readAiRecords(db,kind,'last-record')).results!;assert.equal(exact.length,1);assert.equal(exact[0].id,'last-record');
  for(const id of ['missing',"' OR 1=1 --"]){assert.deepEqual((await readAiRecords(db,kind,id)).results,[]);}
 }}finally{sqlite.close();}
});
test('model filter is strict and scopes child reads before the cap with exact parent matching',async()=>{
 assert.equal(aiRecordQueryId(new URLSearchParams('modelId=AIM-1'),'modelId'),'AIM-1');
 for(const query of ['modelId=','modelId=a&modelId=b','modelId=%20a','modelId=a%0A'])assert.throws(()=>aiRecordQueryId(new URLSearchParams(query),'modelId'));
 const sqlite=new DatabaseSync(':memory:');
 function prepare(sql:string,values:string[]=[]){return {bind(...args:string[]){return prepare(sql,args);},async all(){return {results:sqlite.prepare(sql).all(...values)};}};}
 const db={prepare} as unknown as D1Database;
 try{for(const[kind,table]of [['alerts','ai_assurance_alerts'],['findings','ai_findings']]as const){
 sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,model_id TEXT,severity TEXT,last_seen_at TEXT,due_date TEXT,updated_at TEXT)`);
 const insert=sqlite.prepare(`INSERT INTO ${table} VALUES(?,?,?,'2026-01-01','2026-01-01','2026-01-01')`);
 for(let i=0;i<501;i++)insert.run(`other-${i}`,'AIM-10','Critical');insert.run('target','AIM-1','Low');
 assert.deepEqual((await readAiRecords(db,kind,null,'AIM-1')).results?.map(r=>r.id),['target']);
 assert.deepEqual((await readAiRecords(db,kind,'target','AIM-10')).results,[]);
 assert.equal((await readAiRecords(db,kind,'target','AIM-1')).results?.length,1);
 for(const parent of ['missing',"' OR 1=1 --"])assert.deepEqual((await readAiRecords(db,kind,null,parent)).results,[]);
 assert.equal((await readAiRecords(db,kind,null,'AIM-10')).results?.length,500);
 }assert.throws(()=>readAiRecords(db,'models',null,'AIM-1'));}finally{sqlite.close();}
});

test('work state query is strict and defaults to the existing all-record view',()=>{
 assert.equal(aiWorkStateQuery(new URLSearchParams()),'all');
 for(const state of ['all','open','closed'])assert.equal(aiWorkStateQuery(new URLSearchParams({workState:state})),state);
 for(const query of ['workState=','workState=open&workState=closed','workState=Open','workState=%20open','workState=resolved'])assert.throws(()=>aiWorkStateQuery(new URLSearchParams(query)));
});
test('open and closed states are filtered before the cap and intersect parent and record identity',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 function prepare(sql:string,values:string[]=[]){return {bind(...args:string[]){return prepare(sql,args);},async all(){return {results:sqlite.prepare(sql).all(...values)};}};}
 const db={prepare} as unknown as D1Database;
 try{for(const[kind,table]of [['alerts','ai_assurance_alerts'],['findings','ai_findings']]as const){
 sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,model_id TEXT,status TEXT,severity TEXT,last_seen_at TEXT,due_date TEXT,updated_at TEXT)`);
 const insert=sqlite.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,'2026-01-01','2026-01-01','2026-01-01')`);
 for(let i=0;i<501;i++)insert.run(`closed-${i}`,'AIM-1','resolved','Critical');
 const active=kind==='alerts'?['open','acknowledged','escalated']:['open','in-progress','verification'];
 for(const status of active)insert.run(status,'AIM-1',status,'Low');
 insert.run('other-parent','AIM-10','open','High');
 if(kind==='findings')insert.run('dismissed','AIM-1','dismissed','Critical');
 assert.deepEqual((await readAiRecords(db,kind,null,'AIM-1','open')).results?.map(r=>r.id).sort(),[...active].sort());
 assert.equal((await readAiRecords(db,kind,null,'AIM-1','closed')).results?.length,500);
 assert.deepEqual((await readAiRecords(db,kind,'open','AIM-1','closed')).results,[]);
 assert.deepEqual((await readAiRecords(db,kind,'closed-0','AIM-1','open')).results,[]);
 assert.deepEqual((await readAiRecords(db,kind,null,'missing','open')).results,[]);
 if(kind==='findings')assert.equal((await readAiRecords(db,kind,'dismissed','AIM-1','closed')).results?.length,1);
 }}finally{sqlite.close();}
});
