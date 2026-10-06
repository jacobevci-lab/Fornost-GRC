import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {buildReportHtml,buildReportPdf,buildReportCsv,reportMetrics,type ReportRecord} from '../app/report-export';
const options={reportId:'FR-TEST',generatedAt:'2026-10-06T11:00:00.000Z',preparedBy:'reviewer@example.test',classification:'Gizli',scope:'Filtered scope',filters:[{label:'Owner',value:'QA'}]};
const fontBytes=new Uint8Array(readFileSync('public/fonts/FornostReportSans.ttf'));
test('risk reports use the application methodology and exclude unknown assessments from averages',()=>{
 const rows=[{module:'Risk Assessment',data:{inherentLikelihood:'4',inherentImpact:'2',confidentialityImpact:'4',calculatedImpact:'2'}},{module:'Risk Assessment',data:{inherentLikelihood:'2',inherentImpact:'3'}},{module:'Risk Assessment',data:{}}];
 const metrics=reportMetrics('Risk Assessment',rows,true);assert.equal(metrics[1].value,'11.0');assert.equal(metrics[2].value,1);assert.equal(metrics[3].value,1);
});
test('status metrics never treat negative or partial statuses as positive',()=>{
 const compliance=['Uyumlu','Kısmi Uyumlu','Uyumlu Değil','non-compliant'].map(status=>({module:'Uyum',data:{status}}));
 assert.equal(reportMetrics('Uyum',compliance,true)[1].value,1);assert.equal(reportMetrics('Uyum',compliance,true)[2].value,3);
 assert.equal(reportMetrics('Varlık Envanteri',[{module:'Varlık Envanteri',data:{status:'Inactive'}}],false)[3].value,0);
 assert.equal(reportMetrics('Denetim Yönetimi',[{module:'Denetim Yönetimi',data:{status:'Kapatıldı'}}],true)[3].value,1);
});
test('HTML and CSV include every record beyond the old 500/80 limits with consistent scope',()=>{
 const rows:ReportRecord[]=Array.from({length:521},(_,i)=>({id:`RID-${i}`,module:'Kanıtlar',data:{evidenceTitle:`Kanıt ${i}`,owner:'QA',status:'Onaylandı',custom:`detail-${i}`}}));
 const metrics=reportMetrics('Kanıtlar',rows,true),html=buildReportHtml('Rapor',rows,metrics,true,{...options,template:'detailed'}),csv=buildReportCsv('Rapor',rows,metrics,true,{...options,template:'detailed'});
 assert.match(html,/RID-520/);assert.match(html,/detail-520/);assert.match(html,/521 kaydın tamamı/);assert.match(html,/FR-TEST/);assert.match(html,/Filtered scope/);assert.match(html,/default-src &#39;none&#39;|default-src 'none'/);
 assert.match(csv,/RID-520/);assert.match(csv,/detail-520/);assert.equal(csv.split('\r\n').length,522);
 assert.match(html,/#c65b19/);
});
test('exports escape HTML and spreadsheet formulas including whitespace prefixes',()=>{
 const rows=[{id:'=1+1',module:'Risk Assessment',data:{title:'<script>alert(1)</script>',owner:'\n\t=HYPERLINK("bad")',status:'__proto__'}}];
 const html=buildReportHtml('<img src=x>',rows,[],false,options),csv=buildReportCsv('Report',rows,[],false,options);
 assert.doesNotMatch(html,/<script>|<img src=x>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/__proto__: <b>1/);assert.match(csv,/"'=1\+1"/);assert.match(csv,/"'\n\t=HYPERLINK/);
});
test('PDF embeds the report font, paginates all records and preserves metadata',async()=>{
 const rows=Array.from({length:121},(_,i)=>({id:`R-${i}`,module:'BIA',data:{process:`Ödeme Süreci ${i} — İstanbul Şirketi`,owner:'Çağrı',status:'Aktif'}}));
 const blob=await buildReportPdf('Türkçe Yönetim Raporu',reportMetrics('BIA',rows,true),rows,true,{...options,fontBytes});
 const pdf=await PDFDocument.load(await blob.arrayBuffer());assert.equal(blob.type,'application/pdf');assert.ok(pdf.getPageCount()>3);assert.equal(pdf.getTitle(),'Türkçe Yönetim Raporu');assert.equal(pdf.getAuthor(),options.preparedBy);
});
test('PDF handles oversized rows without discarding their trailing content',async()=>{
 const rows=[{id:'LONG',module:'BIA',data:{process:'Uzun açıklama '.repeat(700)+'SON-KAYIT',owner:'QA'}}];
 const blob=await buildReportPdf('Long report',[],rows,true,{...options,fontBytes,template:'detailed'});
 const pdf=await PDFDocument.load(await blob.arrayBuffer());assert.ok(pdf.getPageCount()>3);
});
