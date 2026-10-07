import test from 'node:test';
import assert from 'node:assert/strict';
import { findingReportRecord, parseCapaReport, CAPA_REPORT_MODULE } from '../app/findings/reporting';
import { reportMetrics, reportSnapshot, buildReportCsv, buildReportHtml } from '../app/report-export';
const finding = {id:'F-1',code:'CAPA-1',title:'<script>alert(1)</script>',status:'in-progress',severity:'critical',owner:'=EVIL()',risk_ref:'RISK-1',control_ref:'CTRL-1',evidence_sha256:'a'.repeat(64),corrective_action:'Install update',internal_secret:'never-export'};
test('CAPA projection preserves source references and evidence integrity without exporting unknown columns', () => {
 const row = findingReportRecord(finding);
 assert.equal(row.id,'capa:F-1'); assert.equal(row.data.riskRef,'RISK-1'); assert.equal(row.data.controlRef,'CTRL-1');
 assert.equal(row.data.evidenceSha256,'a'.repeat(64)); assert.equal(row.data.internal_secret,undefined);
 assert.deepEqual(parseCapaReport({complete:true,rows:[row]}),[row]);
 for(const body of [{rows:[row]},{complete:false,rows:[row]},{complete:true,rows:[row,row]},{complete:true,rows:[{...row,module:'Risk Assessment'}]}]) assert.throws(()=>parseCapaReport(body));
});
test('CAPA metrics and export formats use the same records, status and severity', () => {
 const rows=[findingReportRecord(finding),findingReportRecord({...finding,id:'F-2',status:'closed'})];
 const metrics=reportMetrics(CAPA_REPORT_MODULE,rows,false);
 assert.deepEqual(metrics.map(m=>m.value),[2,1,1,2]);
 const snapshot=reportSnapshot('CAPA',rows,metrics,false);
 assert.equal(snapshot.records[0].cells[6],'critical');
 const options={template:'detailed' as const};
 const csv=buildReportCsv('CAPA',rows,metrics,false,options),html=buildReportHtml('CAPA',rows,metrics,false,options);
 assert.match(csv,/RISK-1/);assert.match(csv,/CTRL-1/);assert.match(csv,/'=EVIL/);
 assert.match(html,/Install update/);assert.doesNotMatch(html,/<script>alert/);assert.doesNotMatch(html,/never-export/);
});

test('CAPA recovery identifies access, changed-source and unavailable failures without exposing server text', async () => {
 const {loadCapaReport,capaReportFailure,capaReportFailureMessage}=await import('../app/findings/reporting');
 for(const [status,reason] of [[401,'session'],[403,'permission'],[409,'changed'],[503,'unavailable']] as const){
  const fetcher=(async()=>new Response(JSON.stringify({error:'private server detail'}),{status})) as typeof fetch;
  await assert.rejects(loadCapaReport('/api/findings?format=report',new AbortController().signal,fetcher),error=>{
   assert.equal(capaReportFailure(error),reason);
   for(const tr of [true,false])assert.doesNotMatch(capaReportFailureMessage(reason,tr),/private server detail/);
   return true;
  });
 }
});
test('CAPA distinguishes invalid totals from a valid dataset over the browser budget',async()=>{
 const {loadCapaReport,capaReportFailure}=await import('../app/findings/reporting');
 for(const [total,reason] of [[100001,'limit'],[-1,'invalid'],['100001','invalid']] as const){
  const fetcher=(async()=>new Response(JSON.stringify({revision:'a'.repeat(32),complete:true,rows:[],nextCursor:null,total}))) as typeof fetch;
  await assert.rejects(loadCapaReport('/api/findings?format=report',new AbortController().signal,fetcher),error=>{assert.equal(capaReportFailure(error),reason);return true});
 }
});
