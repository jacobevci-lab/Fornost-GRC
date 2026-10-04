import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkQueueCsv } from '../app/work-queue-export';
import { findingWorkDisposition, findingWorkRows, workSourcesComplete } from '../app/work-queue';
const now=Date.parse('2026-10-04T12:00:00Z');
const context={scope:'mine' as const,filter:'all',query:'team',evaluatedAt:new Date(now).toISOString(),refreshedAt:'2026-10-04T11:59:00Z'};
test('acceptance is paused through its final UTC day, then returns to active work',()=>{
 assert.equal(findingWorkDisposition({status:'accepted',acceptUntil:'2026-10-04'},now),'accepted');
 assert.equal(findingWorkDisposition({status:'accepted',acceptUntil:'2026-10-03'},now),'acceptance-expired');
 for(const acceptUntil of ['', 'bad', '2026-02-30'])assert.equal(findingWorkDisposition({status:'accepted',acceptUntil},now),'acceptance-review');
 assert.equal(findingWorkDisposition({status:'closed',acceptUntil:'2026-01-01'},now),'closed');
 assert.equal(findingWorkDisposition({status:'verification'},now),'open');
 const [row]=findingWorkRows({findings:[{id:'f',status:'accepted',acceptUntil:'2026-10-04'}]});assert.equal(row.data.acceptUntil,'2026-10-04');
});
test('CSV exports every supplied filtered row with scope and original source timestamp',()=>{
 const rows=Array.from({length:53},(_,i)=>({reference:`REF-${i}`,module:'Control',title:`Task ${i}`,owner:'owner',status:'open',due:'2026-10-04',reason:'Due today',updatedAt:'2026-10-03'}));
 const csv=buildWorkQueueCsv(rows,context);assert.ok(csv.startsWith('\ufeff'));assert.equal(csv.trimEnd().split('\r\n').length,54);assert.ok(csv.includes('REF-52'));assert.ok(csv.includes(context.refreshedAt));assert.ok(csv.includes('"mine","all","team"'));
 assert.throws(()=>buildWorkQueueCsv(rows,{...context,refreshedAt:''}));
});
test('CSV preserves quotes and line breaks while neutralizing spreadsheet formulas',()=>{
 const csv=buildWorkQueueCsv([{reference:'@SUM(A1)',module:'Control',title:'  =HYPERLINK("https://example.test")',owner:'Person, Name',status:'open',due:'',reason:'line1\nline2',updatedAt:''}],context);
 assert.ok(csv.includes('"\'@SUM(A1)"'));assert.ok(csv.includes('"\'  =HYPERLINK(""https://example.test"")"'));assert.ok(csv.includes('"Person, Name"'));assert.ok(csv.includes('"line1\nline2"'));
});
test('source bounds and malformed records disable verified exports',()=>{
 const row={id:'r1',module:'Risk Assessment',data_json:'{}'},finding={id:'f1',status:'open'};
 assert.equal(workSourcesComplete({rows:[row]},{findings:[finding]}),true);
 assert.equal(workSourcesComplete({rows:[]},{findings:[]}),true);
 for(const rows of [null,[{...row,data_json:'broken'}],[{...row,data:[]}],Array.from({length:5000},()=>row)])assert.equal(workSourcesComplete({rows},{findings:[]}),false);
 assert.equal(workSourcesComplete({rows:[]},{findings:Array.from({length:3000},()=>finding)}),false);
 assert.equal(workSourcesComplete({},{}),false);
});
