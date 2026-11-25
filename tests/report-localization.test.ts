import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {buildReportHtml,buildReportCsv,buildReportPdf,reportSnapshot,reportMetrics,type ReportRecord} from '../app/report-export';
import {reportFieldValue,reportValueLabel} from '../app/report-labels';
import {wrapReportText} from '../app/report-text-layout';
import {emailSettingsForDisplay} from '../app/email-settings-display';
const rows:ReportRecord[]=[
 {id:'v',code:'VEN-001',module:'Tedarikçiler',data:{title:'Yetki ve Erişim Yönetimi (IAM / SSO)',status:'Onboarding',criticality:'critical'}},
 {id:'p',code:'POL-001',module:'Politika Merkezi',data:{title:'Türkçe Çıktısı: ı İ ş Ş ğ Ğ ü Ü ö Ö ç Ç',status:'published',classification:'internal'}},
 {id:'i',code:'INC-001',module:'Güvenlik Olayları',data:{title:'Yetki İncelemesi',status:'in-progress',severity:'high'}},
 {id:'b',code:'BCP-001',module:'İş Sürekliliği',data:{title:'İş Sürekliliği',status:'cancelled',criticality:'medium'}},
 {id:'a',code:'AIS-001',module:'AI Yönetişimi',data:{title:'Yapay Zekâ',status:'draft',riskTier:'high'}},
 {id:'r',code:'RGC-001',module:'Regülasyon Merkezi',data:{title:'Düzenleyici Değişiklik',status:'triage',severity:'low'}},
];
const options={reportId:'FR-TURKISH-QA',generatedAt:'2026-11-25T12:00:00Z',template:'detailed' as const,composer:true,hideFieldKeys:true,sections:['distribution','register'] as const};
test('typed status/severity values are localized in tables, details, distributions and CSV; narrative is untouched',()=>{
 const snapshot=reportSnapshot('Rapor',rows,[],true,{...options,sections:[...options.sections]});
 assert.equal(snapshot.records[0].cells[5],'Değerlendirmede');assert.equal(snapshot.records[0].cells[6],'Kritik');
 for(const output of [buildReportHtml('Rapor',rows,[],true,{...options,sections:[...options.sections]}),buildReportCsv('Rapor',rows,[],true,{...options,sections:[...options.sections]})]){
  assert.doesNotMatch(output,/>Onboarding<|"Onboarding"|>critical<|"critical"|>high<|"high"|>cancelled<|"cancelled"|in-progress/);
  for(const label of ['Değerlendirmede','Kritik','Yüksek','İptal Edildi','Devam Ediyor'])assert.ok(output.includes(label),label);
 }
 assert.equal(reportValueLabel('İptal Edildi',false),'Cancelled');assert.equal(reportFieldValue('title','high',true),'high');assert.equal(reportValueLabel('custom-state',true),'custom-state');
 assert.equal(reportSnapshot('Report',rows,[],false).records[1].cells[1],'Policy Center');
});
test('wrapping preserves words, Turkish graphemes and short parenthetical expressions',()=>{
 assert.deepEqual(wrapReportText('Yetki yönetimi (IAM / SSO)',15,s=>s.length),['Yetki yönetimi','(IAM / SSO)']);
 assert.deepEqual(wrapReportText('İş Sürekliliği\nÇıktısı',15,s=>s.length),['İş Sürekliliği','Çıktısı']);
 const token='https://'+ 'a'.repeat(300);const lines=wrapReportText(token,30,s=>s.length);assert.equal(lines.join(''),token);assert.ok(lines.every(l=>l.length<=30));
});
test('real embedded-font multi-module PDF round-trips every Turkish character and whole words',async()=>{
 const fontBytes=new Uint8Array(readFileSync('public/fonts/FornostReportSans.ttf'));
 const blob=await buildReportPdf('Çok Modüllü Rapor Çıktısı',[],rows,true,{...options,sections:[...options.sections],fontBytes});
 const bytes=new Uint8Array(await blob.arrayBuffer()),pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:bytes.slice(),useSystemFonts:false}).promise;const items:string[]=[];
 for(let p=1;p<=pdf.numPages;p++){const content=await(await pdf.getPage(p)).getTextContent();for(const item of content.items)if('str' in item)items.push(item.str);}
 const text=items.join('\n');assert.match(text,/Çıktısı/);assert.match(text,/ı İ ş Ş ğ Ğ ü Ü ö Ö ç Ç/);
 for(const word of ['Değerlendirmede','Kritik','Yüksek','İptal Edildi','Devam Ediyor','Yetki','(IAM / SSO)'])assert.ok(items.some(s=>s.includes(word)),word);
 assert.doesNotMatch(text,/\b(?:Onboarding|critical|high|cancelled|in-progress)\b|Çık tisi|\uFFFD/);
 assert.ok(!items.includes('Y')&&!items.includes('etki'));await pdf.destroy();
 if(process.env.REPORT_QA_ARTIFACTS){mkdirSync(process.env.REPORT_QA_ARTIFACTS,{recursive:true});writeFileSync(`${process.env.REPORT_QA_ARTIFACTS}/turkish-all-modules.pdf`,bytes);writeFileSync(`${process.env.REPORT_QA_ARTIFACTS}/turkish-all-modules.txt`,text);}
});
test('PBC index carries audit, requirement, evidence version, owner, reviewer, period and due date without claiming approval',()=>{
 const request:ReportRecord={code:'ARQ-001',module:'Denetim Yönetimi',data:{recordType:'pbc-request',title:'Erişim kanıtı',auditRef:'AUD-001',requirementRef:'AUD-002',evidenceRefs:'EVD-001 · v2',owner:'Owner',reviewer:'Reviewer',periodStart:'2026-01-01',periodEnd:'2026-12-31',dueDate:'2026-12-15',status:'submitted'}};
 const s=reportSnapshot('PBC',[request],[],true,{template:'pbc'}),joined=s.records[0].cells.join(' ');
 for(const v of ['ARQ-001','AUD-001','AUD-002','EVD-001 · v2','Owner','Reviewer','2026-01-01','2026-12-31','2026-12-15'])assert.ok(joined.includes(v),v);
 assert.ok(!joined.includes('Onaylandı'));assert.equal(s.labels[6],'Termin');
 assert.deepEqual(reportMetrics('__pbc__',[request],true).map(m=>m.value),[1,1,0,0]);
});
test('known email examples become empty display values while real settings and caller input are preserved',()=>{
 const config={applicationUrl:'https://grc.company.com/fornost-grc/',bridgeUrl:'https://mail-bridge.company.test/send',sender:'name@company.com',username:'real@fornost.test',smtpPort:'587'};
 assert.deepEqual(emailSettingsForDisplay(config),{...config,applicationUrl:'',bridgeUrl:'',sender:''});assert.equal(config.sender,'name@company.com');
 const real={applicationUrl:'https://grc.actual.test/fornost/',bridgeUrl:'https://bridge.actual.test/send',sender:'grc@actual.test'};assert.deepEqual(emailSettingsForDisplay(real),real);
});
