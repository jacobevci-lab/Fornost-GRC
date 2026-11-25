import assert from 'node:assert/strict';
import test from 'node:test';
import {findingListPage,findingsRequest,validFindingsPayload,validFindingPagination} from '../app/findings/workspace';
import {findingCsvCell} from '../app/findings/export';

test('finding pages expose every record, search all pages and clamp after filtering',()=>{
 const rows=Array.from({length:65},(_,i)=>({code:`FND-${i}`,title:`Finding ${i}`,sourceRef:`AUD-${i}`,owner:'owner@test.invalid',status:'open',attention:i===64?'overdue':'priority'}));
 assert.deepEqual([1,2,3,4].flatMap(page=>findingListPage(rows,'all','',page,'en').rows),rows);
 assert.equal(findingListPage(rows,'overdue','',4,'en').page,1);
 assert.equal(findingListPage(rows,'all',' AUD-64 ',1,'en').rows[0].code,'FND-64');
 assert.equal(findingListPage(rows,'closed','',NaN,'en').start,0);
});
test('request deadline bounds stalled headers and stalled response bodies without retrying',async()=>{
 let calls=0;
 const headers=(async()=>{calls++;return new Promise(()=>{});}) as typeof fetch;
 await assert.rejects(findingsRequest('/fixture',{},headers,10),/interrupted/);
 const body=(async()=>{calls++;return {json:()=>new Promise(()=>{})};}) as unknown as typeof fetch;
 await assert.rejects(findingsRequest('/fixture',{method:'POST'},body,10),/interrupted/);
 assert.equal(calls,2);
});
test('cancelled requests never start and invalid payloads cannot become a healthy empty list',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(findingsRequest('/fixture',{signal:controller.signal},(async()=>{calls++;return Response.json({});}) as typeof fetch),/interrupted/);
 assert.equal(calls,0);
 assert.equal(validFindingsPayload({}),false);
 const empty={findings:[],events:[],sourceSignals:[],summary:{total:0,open:0,critical:0,overdue:0,verification:0,accepted:0,closed:0,recurring:0}};
 assert.equal(validFindingsPayload(empty),true);
 assert.equal(validFindingsPayload({...empty,findings:[{id:'broken'}]}),false);
 assert.equal(validFindingsPayload({...empty,sourceSignals:[{source:'risk',count:'unknown'}]}),false);
});
test('CAPA CSV neutralizes whitespace-prefixed formula cells while preserving quotes and text',()=>{
 for(const prefix of ['',' ','\t','\r\n'])for(const marker of ['=','+','-','@'])assert.equal(findingCsvCell(`${prefix}${marker}1`),`"'${prefix}${marker}1"`);
 assert.equal(findingCsvCell('Evidence "accepted"'),'"Evidence ""accepted"""');
 assert.equal(findingCsvCell(null),'""');
});

test('server pagination rejects partial pages and malformed counts',()=>{
 assert.equal(validFindingPagination({page:2,pages:2,total:21,start:21,end:21},1),true);
 assert.equal(validFindingPagination({page:1,pages:1,total:0,start:0,end:0},0),true);
 assert.equal(validFindingPagination({page:1,pages:2,total:21,start:1,end:20},19),false);
 assert.equal(validFindingPagination({page:1,pages:1,total:-1,start:0,end:0},0),false);
 assert.equal(validFindingPagination(null,0),false);
});
