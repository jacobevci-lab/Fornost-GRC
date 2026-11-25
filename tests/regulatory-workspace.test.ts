import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
type Row=Record<string,unknown>;
async function setup(){
 const f=fixture('regulatory-intelligence');
 const sourceBody={action:'save-source',name:'Official source',authority:'Regulator',jurisdiction:'Türkiye',sourceType:'regulator',url:'https://example.com/regulations',owner:'owner@example.com',reviewFrequencyDays:30};
 const created=await f.post(sourceBody);assert.equal(created.status,201);
 const sourceId=String(created.body.id);
 const changeBody={action:'create-change',sourceId,externalRef:'REF-1',title:'Access review requirement',summary:'An updated access review requirement with retained evidence.',publishedDate:'2026-01-01',effectiveDate:'2099-01-01',severity:'high',changeType:'amendment',owner:'owner@example.com',reviewer:'reviewer@example.com'};
 const createdChange=await f.post(changeBody);assert.equal(createdChange.status,201);
 const changeId=String(createdChange.body.id);
 const source=()=>f.sqlite.prepare('SELECT * FROM regulatory_intelligence_sources WHERE id=?').get(sourceId)!;
 return {...f,sourceId,changeId,sourceBody,changeBody,source};
}
test('workspace counts, search, scope and pagination include records beyond the legacy cap',async()=>{
 const f=await setup();try{
  const template=f.sqlite.prepare('SELECT * FROM regulatory_changes').get()!;
  const keys=Object.keys(template),insert=f.sqlite.prepare(`INSERT INTO regulatory_changes(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`);
  f.sqlite.exec('BEGIN');for(let n=2;n<=1042;n++){const row={...template,id:'page-'+String(n).padStart(4,'0'),external_ref:'REF-'+n,title:n===1042?'Unique İNCELEME 100%':'Requirement '+n,owner:'other@example.com',reviewer:'other-reviewer@example.com'};insert.run(...keys.map(k=>(row as typeof template)[k]));}f.sqlite.exec('COMMIT');
  let r=await f.get('view=changes&scope=team&page=53');assert.equal(r.status,200);assert.equal((r.body.summary as Row).unassessed,1042);assert.equal((r.body.pagination as Row).total,1042);assert.equal((r.body.changes as Row[]).length,2);
  r=await f.get('view=changes&q='+encodeURIComponent('inceleme 100%'));assert.equal((r.body.pagination as Row).total,1);assert.equal((r.body.changes as Row[])[0].id,'page-1042');
  r=await f.get('view=changes&q='+encodeURIComponent('%_'));assert.equal((r.body.pagination as Row).total,0);
  r=await f.get('view=changes&scope=mine');assert.equal((r.body.pagination as Row).total,1);
  r=await f.get('view=changes&focusId=page-1042&focusKind=regulatory-change&scope=mine&q=does-not-match');assert.equal((r.body.changes as Row[])[0].id,'page-1042');
  r=await f.get('detail=page-1042');assert.equal((r.body.change as Row).id,'page-1042');
 }finally{f.sqlite.close();}
});
test('overdue actions and stage are separate and completed child records remain discoverable',async()=>{
 const f=await setup();try{
  const r=await f.post({action:'add-impact',changeId:f.changeId,targetType:'control',targetRef:'A.5.18',targetTitle:'Access control',impactLevel:'high',requiredAction:'Review and record access evidence.',actionOwner:'owner@example.com',dueDate:'2098-01-01'});assert.equal(r.status,201);
  f.sqlite.exec("UPDATE regulatory_change_impacts SET due_date='2020-01-01'");
  let list=await f.get('view=overview&filter=overdue');assert.equal((list.body.summary as Row).overdueImpacts,1);const change=(list.body.changes as Row[])[0];assert.equal(change.status,'impact-assessment');assert.equal(change.nextOwner,'owner@example.com');assert.equal(change.nextDue,'2020-01-01');
  f.sqlite.exec("UPDATE regulatory_change_impacts SET status='completed';UPDATE regulatory_changes SET status='closed'");
  list=await f.get('view=impacts&filter=completed');assert.equal((list.body.pagination as Row).total,1);assert.equal((list.body.summary as Row).overdueImpacts,0);
 }finally{f.sqlite.close();}
});
test('source edit, archive and restore preserve history and reject stale or unauthorized changes',async()=>{
 const f=await setup();try{
  const revision=f.source().updated_at;
  let r=await f.post({...f.sourceBody,action:'update-source',sourceId:f.sourceId,expectedUpdatedAt:revision,name:'Renamed official source',reviewFrequencyDays:7});assert.equal(r.status,200,JSON.stringify(r));assert.equal(f.source().name,'Renamed official source');
  r=await f.post({action:'archive-source',sourceId:f.sourceId,expectedUpdatedAt:revision});assert.equal(r.status,409);
  r=await f.post({action:'archive-source',sourceId:f.sourceId,expectedUpdatedAt:f.source().updated_at});assert.equal(r.status,200);assert.equal(f.source().enabled,0);
  assert.equal((await f.post({...f.changeBody,externalRef:'REF-2'})).status,404);
  const list=await f.get('view=sources&filter=archived');assert.equal((list.body.sources as Row[]).length,1);assert.equal((list.body.summary as Row).sources,0);
  assert.equal((await f.post({action:'restore-source',sourceId:f.sourceId,expectedUpdatedAt:f.source().updated_at})).status,200);
  f.setActor({id:'editor',role:'Editor',email:'owner@example.com',name:'Owner',source:'local'});
  assert.equal((await f.post({action:'archive-source',sourceId:f.sourceId,expectedUpdatedAt:f.source().updated_at})).status,403);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM regulatory_change_events WHERE action IN ('update-source','archive-source','restore-source')").get()!.n,3);
 }finally{f.sqlite.close();}
});
test('source deletion protects linked changes and leaves retained history for an unused source',async()=>{
 const f=await setup();try{
  assert.equal((await f.post({action:'delete-source',sourceId:f.sourceId,expectedUpdatedAt:f.source().updated_at})).status,400);
  const fresh=await f.post({...f.sourceBody,url:'https://example.com/unused'}),id=String(fresh.body.id);
  const read=()=>f.sqlite.prepare('SELECT * FROM regulatory_intelligence_sources WHERE id=?').get(id)!;
  const before=read().updated_at;
  f.before(()=>f.sqlite.prepare('UPDATE regulatory_intelligence_sources SET name=? WHERE id=?').run('Concurrent edit',id));
  // Deletion must bind the whole source snapshot, not only the timestamp.
  const result=await f.post({action:'delete-source',sourceId:id,expectedUpdatedAt:before});assert.equal(result.status,409);
  assert.ok(read());
  assert.equal((await f.post({action:'delete-source',sourceId:id,expectedUpdatedAt:read().updated_at})).status,200);
  assert.equal(read(),undefined);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM regulatory_change_events WHERE source_id=? AND action='delete-source'").get(id)!.n,1);
 }finally{f.sqlite.close();}
});
test('source edit audit failure rolls back the update',async()=>{
 const f=await setup();try{
  const before={...f.source()};f.sqlite.exec("CREATE TRIGGER fail_source_event BEFORE INSERT ON regulatory_change_events BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  assert.equal((await f.post({...f.sourceBody,action:'update-source',sourceId:f.sourceId,expectedUpdatedAt:before.updated_at,name:'Must roll back'})).status,400);assert.deepEqual({...f.source()},before);
 }finally{f.sqlite.close();}
});
test('canonical policy selection requires an existing non-retired policy at commit',async()=>{
 for(const mode of ['valid','missing','retire-race']){const f=await setup();try{
  f.sqlite.exec("CREATE TABLE policy_documents(id TEXT PRIMARY KEY,code TEXT,title TEXT,status TEXT);INSERT INTO policy_documents VALUES('POL-test','POL-01','Access policy','draft')");
  const targets=await f.get('targets=policy&q=Access');assert.equal((targets.body.records as Row[])[0].id,'POL-test');
  if(mode==='retire-race')f.before(()=>f.sqlite.exec("UPDATE policy_documents SET status='retired'"));
  const r=await f.post({action:'add-impact',changeId:f.changeId,targetType:'policy',targetMode:'record',targetRef:mode==='missing'?'POL-missing':'POL-test',targetTitle:'Access policy',impactLevel:'high',requiredAction:'Update policy scope and independent review.',actionOwner:'owner@example.com',dueDate:'2098-01-01'});
  assert.equal(r.status,mode==='valid'?201:422,JSON.stringify(r));
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM regulatory_change_impacts').get()!.n,mode==='valid'?1:0);
 }finally{f.sqlite.close();}}
});
