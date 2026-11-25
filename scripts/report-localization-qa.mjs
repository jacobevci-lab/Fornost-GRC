import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {reportSources} from '../app/report-sources.ts';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale,waitForQaIdle} from './qa-browser-harness.mjs';
// Fixed loopback + --local: this fixture can never seed a production database.
const base='http://127.0.0.1:4173',out='report-localization-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1440,height:900}}),page=await context.newPage();page.setDefaultTimeout(25000);
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));let phase='bootstrap';
async function api(method,path,data){const r=await context.request.fetch(base+path,{method,headers:{origin:base},data});assert.ok(r.ok(),`${path}: ${r.status()} ${await r.text()}`);return r.json();}
async function seed(){
 const sql=new DatabaseSync(':memory:'),statements=[];
 try{
  for(const file of ['0043_fornost_ai_model_inventory.sql','0070_policy_lifecycle_management.sql','0073_enterprise_incident_crisis.sql','0074_business_continuity_resilience.sql','0068_regulatory_change_intelligence.sql','0085_audit_request_workflow.sql']){
   const schema=(await readFile(`drizzle/${file}`,'utf8')).replace(/CREATE TABLE (?!IF NOT EXISTS)/g,'CREATE TABLE IF NOT EXISTS ').replace(/CREATE INDEX (?!IF NOT EXISTS)/g,'CREATE INDEX IF NOT EXISTS ');sql.exec(schema);statements.push(schema);
  }
  const extra=`CREATE TABLE IF NOT EXISTS simple_audits(id TEXT PRIMARY KEY,name TEXT,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT,created_at TEXT,updated_at TEXT);
   CREATE TABLE IF NOT EXISTS risk_appetite_statements(id TEXT PRIMARY KEY,code TEXT,kri_name TEXT,statement TEXT,owner TEXT,reviewer TEXT,status TEXT,next_measurement TEXT,created_at TEXT,updated_at TEXT);`;
  sql.exec(extra);statements.push(extra);
  const now=new Date().toISOString(),quote=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
  const codes=['AIS-901','POL-901','INC-901','AUD-901','BCP-901','RGS-901','RGC-901','RAP-901','ARQ-901'];
  for(const [i,source] of reportSources.entries()){
   const id=`QA-REPORT-${i}`,columns=sql.prepare(`PRAGMA table_info(${source.table})`).all();
   const values={id,code:codes[i],title:'Yetki ve Erişim Yönetimi (IAM / SSO)',name:'Denetim Çıktısı',system_name:'AI Çıktısı',status:i===3?'in-progress':i===4?'cancelled':'draft',severity:'high',criticality:'critical',created_at:now,updated_at:now,audit_id:'QA-REPORT-3',owner:'qa-admin@fornost.test',reviewer:'reviewer@fornost.test',data_json:JSON.stringify({title:'Türkçe Kanıt Talebi',status:'submitted',owner:'qa-admin@fornost.test',reviewer:'reviewer@fornost.test',dueDate:'2026-12-15',periodStart:'2026-01-01',periodEnd:'2026-12-31',evidence:[{evidenceId:'QA-REPORT-EVD',versionNo:2,period:'2026',fileKey:'NEVER-EXPORTED'}]})};
   const fields=Object.fromEntries(columns.filter(c=>c.notnull||c.name in values).map(c=>[c.name,values[c.name]??(/INT|REAL/.test(c.type)?1:'QA')]));
   const insert=`INSERT INTO ${source.table} (${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).map(quote).join(',')});`;statements.push(insert);
   const registry=source.key==='r.id'?id:source.key.replace(/\|\|r.id/,'').replaceAll("'",'')+id;
   statements.push(`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES (${quote(registry)},${quote(source.module)},${quote(codes[i])},${quote(now)});`);
  }
  for(const [id,code,module,data] of [
   ['QA-REPORT-VEN','VEN-901','Tedarikçiler',{title:'Türkçe Çıktısı: ı İ ş Ş ğ Ğ ü Ü ö Ö ç Ç',status:'Onboarding',criticality:'critical',owner:'QA'}],
   ['QA-REPORT-EVD','EVD-901','Kanıtlar',{evidenceTitle:'Yetki Kanıtı (IAM / SSO)',status:'İncelemede',period:'2026',owner:'QA'}],
  ]){statements.push(`INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES (${[id,module,JSON.stringify(data),now,now].map(quote).join(',')});`);statements.push(`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES (${[id,module,code,now].map(quote).join(',')});`);}
  const file=`${out}/fixture.sql`;await writeFile(file,statements.join('\n'));execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});
 }finally{sql.close();}
}
try{
 const auth=await api('GET','/api/auth');assert.equal(auth.bootstrapRequired,true,'Requires fresh isolated QA database');
 await api('POST','/api/auth',{action:'bootstrap',email:'qa-admin@fornost.test',name:'Report QA',password:qaPassword()});
 await api('GET','/api/grc');await api('GET','/api/audits');
 phase='local D1 fixture';await seed();
 phase='real workflow endpoint';const sources=await api('GET','/api/reports/sources');assert.equal(sources.complete,true);assert.equal(sources.records.length,9);assert.doesNotMatch(JSON.stringify(sources),/NEVER-EXPORTED/);assert.ok(sources.records.find(r=>r.code==='ARQ-901').data.evidenceRefs.includes('EVD-901 · v2'));checks.push('real D1 workflow sources and PBC version references');
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/api/reports/sources')).status(),401);await anonymous.close();
 await page.goto(base);await openQaModule(page,'Raporlama');const report=page.locator('#report-composer');await expect(report.locator('iframe')).toBeVisible();
 phase='multi-module Turkish PDF';const doc=page.frameLocator('iframe.report-document');for(const code of ['AIS-901','POL-901','INC-901','AUD-901','BCP-901','RGC-901','VEN-901','EVD-901'])await expect(doc.locator('body')).toContainText(code);
 for(const label of ['Değerlendirmede','Kritik','Yüksek','İptal Edildi','Devam Ediyor'])await expect(doc.locator('body')).toContainText(label);
 const [download]=await Promise.all([page.waitForEvent('download'),report.getByRole('button',{name:'PDF Raporu',exact:true}).click()]);assert.equal(await download.failure(),null);await download.saveAs(`${out}/all-modules-TR.pdf`);
 const pdf=await getDocument({data:new Uint8Array(await readFile(`${out}/all-modules-TR.pdf`)),useSystemFonts:false}).promise,lines=[];
 for(let i=1;i<=pdf.numPages;i++)for(const item of (await(await pdf.getPage(i)).getTextContent()).items)if('str' in item)lines.push(item.str);
 const text=lines.join('\n');assert.match(text,/Çıktısı/);assert.match(text,/ı İ ş Ş ğ Ğ ü Ü ö Ö ç Ç/);assert.doesNotMatch(text,/\b(?:Onboarding|critical|high|cancelled|in-progress)\b|Çık tisi|\uFFFD/);assert.ok(lines.some(line=>line.includes('(IAM / SSO)')));assert.ok(!lines.includes('Y')&&!lines.includes('etki'));await pdf.destroy();await writeFile(`${out}/all-modules-TR.txt`,text);checks.push('downloaded PDF preserves Turkish glyphs, labels and word boundaries');
 phase='PBC template';await report.getByLabel('Şablon',{exact:true}).selectOption('pbc');await expect(doc.locator('body')).toContainText('ARQ-901');await expect(doc.locator('body')).toContainText('EVD-901 · v2');await expect(doc.locator('body')).not.toContainText('VEN-901');await report.screenshot({path:`${out}/PBC-TR.png`});
 for(const locale of ['tr','en'])for(const theme of ['light','dark'])for(const width of [1440,390]){
  phase=`report ${locale}/${theme}/${width}`;await page.setViewportSize({width,height:900});await switchQaLocale(page,locale);if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();await waitForQaIdle(page);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),phase);await report.screenshot({path:`${out}/report-${locale}-${theme}-${width}.png`});
 }
 phase='failed workflow gating';await page.route('**/api/reports/sources',route=>route.fulfill({status:503,json:{error:'unavailable',complete:false}}));await page.reload();await openQaModule(page,'Reporting');await expect(report.getByRole('button',{name:'PDF Report',exact:true})).toBeDisabled();await expect(report.locator('iframe')).toHaveCount(0);await page.unroute('**/api/reports/sources');await report.getByRole('button',{name:'Refresh sources',exact:true}).click();await expect(report.getByRole('button',{name:'PDF Report',exact:true})).toBeEnabled();checks.push('source failure blocks partial export and retry recovers');
 phase='email placeholders';const mutations=[];await page.route('**/api/integrations',async route=>{if(route.request().method()!=='GET'){mutations.push(route.request().method());return route.abort();}return route.fulfill({json:{integrations:[{kind:'email',provider:'smtp-bridge',enabled:false,config:{applicationUrl:'https://grc.company.com/fornost-grc/',bridgeUrl:'https://mail-bridge.company.test/send',sender:'name@company.com',username:'name@company.com',smtpPort:'587'}}]}});});
 await openQaModule(page,'Email & Notifications');
 for(const locale of ['tr','en'])for(const theme of ['light','dark'])for(const width of [1440,390]){
  phase=`email ${locale}/${theme}/${width}`;await page.setViewportSize({width,height:900});await switchQaLocale(page,locale);if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();const tr=locale==='tr';
  for(const label of (tr?["Güvenli SMTP Köprü URL'si",'SMTP Sunucusu','SMTP Portu','Kullanıcı Adı','Gönderen E-posta Adresi','API Anahtarı / Parola']:['Secure SMTP Bridge URL','SMTP Host','SMTP Port','Username','Sender Email','API Token / Password']))await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  for(const label of (tr?["Güvenli SMTP Köprü URL'si",'Kullanıcı Adı','Gönderen E-posta Adresi']:['Secure SMTP Bridge URL','Username','Sender Email']))await expect(page.getByLabel(label,{exact:true})).toHaveValue('');
  const url=page.getByLabel(tr?'Uygulama adresi (görev bağlantıları)':'Application URL (task links)',{exact:true});await expect(url).toHaveValue('');await expect(url).toHaveAttribute('placeholder',base+'/');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),phase);await page.locator('.integration-page').screenshot({path:`${out}/email-${locale}-${theme}-${width}.png`});
 }
 await page.getByRole('button',{name:'Use this URL',exact:true}).click();await expect(page.getByLabel('Application URL (task links)',{exact:true})).toHaveValue(base+'/');assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);checks.push('16 TR/EN light/dark desktop/mobile report/email layouts','localized SMTP fields; sample values empty; explicit current-origin suggestion; no email or config write');
 await writeFile(`${out}/report.json`,JSON.stringify({result:'passed',checks,errors},null,2));console.log('REPORT_LOCALIZATION_QA_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/failure.json`,JSON.stringify({phase,error:error.message,errors},null,2));throw error;}finally{await browser.close();}
