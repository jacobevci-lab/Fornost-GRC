import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {parseTraceabilityWorkIds,readCapaTraceability} from '../app/capa-traceability-store';
import {loadCapaTraceability} from '../app/capa-traceability-loader';
const work=(id:string)=>({id,findingId:`F-${id}`,resultRef:`C-${id}`,action:'capa-promotion',status:'completed'});
const item=(id:string)=>({workItemId:id,findingId:`F-${id}`,resultRef:`C-${id}`,completedAt:'2026-10-09T00:00:00Z',enterpriseFinding:{id:`C-${id}`,code:`CAPA-${id}`,status:'closed',evidenceReference:'E1',verificationEvidenceReference:'E2',recurrenceCount:0}});
const payload=(items:unknown[])=>({available:true,items,coverage:{loaded:items.length,complete:true}});

test('targeted traceability validates bounded unique identities',()=>{
 assert.equal(parseTraceabilityWorkIds(null),undefined);
 assert.deepEqual(parseTraceabilityWorkIds('["W1","W2"]'),['W1','W2']);
 for(const raw of ['null','{}','[]','["W","W"]','[1]','[" "]','["W\\n"]','[" W"]',JSON.stringify(['x'.repeat(121)]),JSON.stringify(Array.from({length:51},(_,i)=>String(i)))])assert.throws(()=>parseTraceabilityWorkIds(raw));
});

test('targeted reads reach older promotions beyond 500 while keeping governed filters',async()=>{
 const sql=new DatabaseSync(':memory:');
 const db={prepare(query:string){let values:SQLInputValue[]=[];return {bind(...args:SQLInputValue[]){values=args;return this;},async all(){return {results:sql.prepare(query).all(...values)};}};}} as unknown as D1Database;
 try{
  sql.exec(`CREATE TABLE continuous_assurance_work_items(id TEXT PRIMARY KEY,finding_id TEXT,result_ref TEXT,completed_at TEXT,updated_at TEXT,action TEXT,status TEXT);
  CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT,status TEXT,evidence_reference TEXT,verification_evidence_reference TEXT,recurrence_count INTEGER);`);
  const insert=sql.prepare('INSERT INTO continuous_assurance_work_items VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<502;i++)insert.run(`W${String(i).padStart(4,'0')}`,`F${i}`,`C${i}`,'2026-10-09','2026-10-09','capa-promotion','completed');
  sql.exec("INSERT INTO enterprise_findings VALUES('C0','CAPA-0','closed','E1','E2',2)");
  const legacy=await readCapaTraceability(db);assert.equal(legacy.items.length,500);assert.equal(legacy.coverage.complete,false);assert.ok(!legacy.items.some(i=>i.workItemId==='W0000'));
  const exact=await readCapaTraceability(db,['W0000','W0001']);assert.deepEqual(exact.coverage,{loaded:2,complete:true});assert.equal(exact.items.find(i=>i.workItemId==='W0000')?.enterpriseFinding?.status,'closed');assert.equal(exact.items.find(i=>i.workItemId==='W0001')?.enterpriseFinding,null);
  insert.run("W' OR 1=1 --",'F','C0','2026-10-09','2026-10-09','capa-promotion','pending-review');
  assert.equal((await readCapaTraceability(db,["W' OR 1=1 --"])).items.length,0);
  sql.exec("DELETE FROM continuous_assurance_work_items WHERE id IN ('W0501','W0500', 'W'' OR 1=1 --')");assert.deepEqual((await readCapaTraceability(db)).coverage,{loaded:500,complete:true});
 }finally{sql.close();}
});

test('loader resolves 121 exact work identities in bounded batches',async()=>{
 const calls:string[][]=[];
 const fetcher=(async(url:RequestInfo|URL)=>{const ids=JSON.parse(new URL(String(url),'https://test.invalid').searchParams.get('workIds')!);calls.push(ids);return Response.json(payload(ids.map(item)));}) as typeof fetch;
 const rows=await loadCapaTraceability(Array.from({length:121},(_,i)=>work(String(i))),fetcher);
 assert.equal(rows.length,121);assert.deepEqual(calls.map(ids=>ids.length),[50,50,21]);assert.equal(new Set(rows.map(row=>row.workItemId)).size,121);
 assert.deepEqual(await loadCapaTraceability([],async()=>{throw new Error('No request expected');}),[]);
});

test('loader rejects missing, duplicate, foreign, changed and malformed lifecycle results',async()=>{
 const valid=item('W');
 const bad=[payload([]),payload([valid,valid]),payload([{...valid,workItemId:'OTHER'}]),payload([{...valid,findingId:'OTHER'}]),payload([{...valid,resultRef:'OTHER'}]),payload([{...valid,enterpriseFinding:{...valid.enterpriseFinding,id:'OTHER'}}]),payload([{...valid,enterpriseFinding:{...valid.enterpriseFinding,status:'invented'}}]),payload([{...valid,enterpriseFinding:{...valid.enterpriseFinding,recurrenceCount:-1}}]),{...payload([valid]),coverage:{loaded:1,complete:false}},{...payload([valid]),available:false}];
 for(const body of bad)await assert.rejects(()=>loadCapaTraceability([work('W')],async()=>Response.json(body)));
 await assert.rejects(()=>loadCapaTraceability([work('W')],async()=>Response.json({}, {status:503})));
 const missing=await loadCapaTraceability([work('W')],async()=>Response.json(payload([{...valid,enterpriseFinding:null}])));assert.equal(missing[0].enterpriseFinding,null,'an explicit missing link remains distinct from an incomplete response');
});
