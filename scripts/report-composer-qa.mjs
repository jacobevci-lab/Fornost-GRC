import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { readSheet as readXlsxFile } from 'read-excel-file/node';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle, openQaModule } from './qa-browser-harness.mjs';
const base='http://127.0.0.1:4173',out='report-composer-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1640,height:1050}}),page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));let phase='bootstrap';const screens=[];
async function api(method,path,data,status=200){const r=await context.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,await r.text());return r.json();}
const create=async(module,data)=>(await api('POST','/api/grc',{module,data},201)).id;
const work=page.locator('#report-composer'),settings=work.locator('.report-filter-panel');
const frame=()=>page.frameLocator('iframe.report-document');
async function capture(name){await work.screenshot({path:`${out}/${name}.png`});screens.push(name);}
async function download(name){const [d]=await Promise.all([page.waitForEvent('download'),work.getByRole('button',{name,exact:true}).click()]);assert.equal(await d.failure(),null);return d.path();}
async function definitions(){await work.getByRole('button',{name:'Tanımı kaydet / aç',exact:true}).click();await work.locator('.account-views>summary').click();await expect(work.getByLabel('Hesap görünümü adı',{exact:true})).toBeVisible();}
try{
 assert.equal((await api('GET','/api/auth')).bootstrapRequired,true,'Use a fresh isolated runtime');
 await api('POST','/api/auth',{action:'bootstrap',email:'qa-admin@fornost.test',name:'Rapor QA',password:qaPassword()});
 await page.goto(base);await openQaModule(page,'Raporlama');await expect(work).toContainText('Seçili kapsamda raporlanacak kayıt bulunamadı');await expect(work.getByRole('button',{name:'PDF Raporu',exact:true})).toBeDisabled();await capture('empty');
 phase='owned records';
 const asset=await create('Varlık Envanteri',{title:'365 Tenant',assetType:'Yazılım',businessUnit:'Bilgi Teknolojileri',owner:'Bilgi Güvenliği',criticality:'Kritik',status:'Aktif'});
 await create('Risk Assessment',{title:'Ayrıcalıklı erişim güvenliği',owner:'Bilgi Güvenliği',asset,status:'Değerlendiriliyor'});
 await create('BIA',{process:'Kimlik ve erişim yönetimi',processCategory:'Operasyonel Süreç',businessUnit:'Finans',owner:'QA',criticality:'Yüksek',asset,rto:'4 saat',rpo:'1 saat',status:'Aktif'});
 await create('BIA',{process:'Finansal kapanış',processCategory:'Operasyonel Süreç',businessUnit:'Finans',owner:'QA',criticality:'Orta',asset,rto:'8 saat',rpo:'2 saat',status:'Aktif'});
 await create('BIA',{process:'Hariç tutulan süreç',processCategory:'Operasyonel Süreç',businessUnit:'Operasyon',owner:'Other',criticality:'Orta',asset,rto:'8 saat',rpo:'2 saat',status:'Taslak'});
 await page.reload();await openQaModule(page,'Raporlama');await expect(work.locator('iframe.report-document')).toBeVisible();await capture('composer-TR-light-1640');
 phase='filters preview and exact HTML snapshot';
 await settings.getByLabel('Rapor modülü',{exact:true}).selectOption('BIA');await settings.locator('.report-advanced summary').click();await settings.locator('.report-filters select').nth(1).selectOption('QA');
 await settings.getByLabel('Sınıflandırma',{exact:true}).selectOption('confidential');await settings.getByLabel('Yönetici notu',{exact:true}).fill('Yönetim kararı <script>unsafe()</script> — gözden geçirme');
 await expect(frame().locator('body')).toContainText('Kimlik ve erişim yönetimi');await expect(frame().locator('body')).not.toContainText('Hariç tutulan süreç');await expect(frame().locator('script')).toHaveCount(0);await expect(frame().locator('body')).toContainText('<script>unsafe()</script>');
 await expect(work.locator('iframe')).toHaveAttribute('sandbox','');
 const preview=await work.locator('iframe').getAttribute('srcdoc');await work.locator('.workspace-export summary').click();
 assert.equal(await readFile(await download('HTML'),'utf8'),preview);
 const csv=await readFile(await download('CSV'),'utf8');assert.match(csv,/Kimlik ve erişim yönetimi/);assert.doesNotMatch(csv,/Hariç tutulan süreç/);assert.equal(csv.split('\r\n').length,3);
 const excel=await readXlsxFile(await download('Excel Raporu Al'));assert.equal(excel.length,3);const idColumn=excel[0].indexOf('Report ID');assert.ok(idColumn>=0);assert.ok(preview.includes(excel[1][idColumn]));assert.match(preview,/Gizli/);
 const pdf=await PDFDocument.load(await readFile(await download('PDF Raporu')));assert.ok(pdf.getSubject().includes(excel[1][idColumn]));assert.match(pdf.getSubject(),/Gizli/);
 phase='sections and definition persistence';await settings.getByLabel('Kayıt eki',{exact:true}).uncheck();await expect(frame().getByRole('heading',{name:'Kayıt dökümü',exact:true})).toHaveCount(0);
 await definitions();await work.getByLabel('Hesap görünümü adı',{exact:true}).fill('QA Yönetim Özeti');await work.getByRole('button',{name:'Yeni kaydı önizle',exact:true}).click();await work.getByRole('button',{name:'Görünümü kaydet',exact:true}).click();await expect(work).toContainText('Görünüm sunucuya kaydedildi');
 let views=await api('GET','/api/views?module=Raporlar&scope=personal');assert.equal(views.views.length,1);const saved=views.views[0];assert.equal(saved.state.filters.owner,'QA');assert.ok(!saved.state.columns.includes('register'));assert.ok(!JSON.stringify(saved.state).includes('unsafe'));
 await page.reload();await openQaModule(page,'Raporlama');await definitions();await work.getByLabel('Hesap görünümü seç',{exact:true}).selectOption(saved.id);await work.getByRole('button',{name:'Hesap görünümünü uygula',exact:true}).click();await expect(work).toContainText('Görünüm güncel kayıtlara uygulandı');await expect(settings.getByLabel('Rapor modülü',{exact:true})).toHaveValue('BIA');await expect(settings.locator('.report-filters select').nth(1)).toHaveValue('QA');await expect(settings.getByLabel('Yönetici notu',{exact:true})).toHaveValue('');await expect(settings.getByLabel('Kayıt eki',{exact:true})).not.toBeChecked();
 await work.getByLabel('Hesap görünümü adı',{exact:true}).fill('QA Değişen Ad');await work.getByRole('button',{name:'Ad değişikliğini önizle',exact:true}).click();await work.getByRole('button',{name:'Görünümü kaydet',exact:true}).click();await expect(work).toContainText('Görünüm sunucuya kaydedildi');views=await api('GET','/api/views?module=Raporlar&scope=personal');assert.equal(views.views[0].name,'QA Değişen Ad');
 await work.getByRole('button',{name:'Kaldırmayı önizle',exact:true}).click();await work.getByRole('button',{name:'Görünümü kaldırmayı onayla',exact:true}).click();await expect(work).toContainText('Görünüm kaldırıldı');assert.equal((await api('GET','/api/views?module=Raporlar&scope=personal')).views.length,0);assert.equal((await api('GET','/api/grc')).rows.length,5);await work.getByRole('button',{name:'Tanımı kaydet / aç',exact:true}).click();
 phase='responsive bilingual themes';await settings.getByLabel('Kayıt eki',{exact:true}).check();
 for(const lang of ['TR','EN'])for(const theme of ['light','dark'])for(const width of [1640,390]){
  await page.setViewportSize({width,height:1050});await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
  for(const tab of ['document','records']){await work.getByRole('button',{name:tab==='document'?(lang==='TR'?'Rapor önizlemesi':'Report preview'):(lang==='TR'?/^Kaynak kayıtlar/:/^Source records/)}).click();await waitForQaIdle(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`overflow ${tab}/${lang}/${theme}/${width}`);await capture(`${tab}-${lang}-${theme}-${width}`);}
 }
 phase='unavailable core source';await page.route('**/api/grc',route=>route.fulfill({status:503,json:{error:'QA unavailable'}}));await page.reload();await openQaModule(page,'Reporting');await expect(work.getByRole('button',{name:'PDF Report',exact:true})).toBeDisabled();await expect(work.locator('iframe')).toHaveCount(0);await expect(work).toContainText('The report will appear when');await page.unroute('**/api/grc');await work.getByRole('button',{name:'Reload records',exact:true}).click();await expect(work.getByRole('button',{name:'PDF Report',exact:true})).toBeEnabled();
 assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({result:'passed',layouts:16,screens,checks:['empty state','exact preview HTML and shared export identity','PDF HTML CSV XLSX filtered records','escaped commentary','section selection','server definition save reload apply rename remove','no business record deletion','TR EN light dark desktop mobile','failed core source blocks export and retries'],errors},null,2));console.log('REPORT_COMPOSER_QA_PASS');
}catch(e){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/failure.json`,JSON.stringify({phase,error:e.message,errors},null,2));throw e;}finally{await browser.close();}
