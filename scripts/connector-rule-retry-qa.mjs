import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale} from './qa-browser-harness.mjs';
// Disposable local database only. Saves are real; discovery and provider execution are intercepted.
const base='http://127.0.0.1:4173',out='connector-rule-retry-qa-artifacts',password=qaPassword();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const ctx=await createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}}),page=await ctx.newPage();
page.setDefaultTimeout(15000);const path='/api/evidence-automation',errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
async function api(context,path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,await r.text());return r.json();}
let drop=false,saves=[],createdId='',runs=0;
try{
 await mkdir(out,{recursive:true});await api(ctx,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password});
 const control=await api(ctx,'/api/grc','POST',{module:'Kontroller',data:{controlRef:'QA-RETRY',controlTitle:'Retry-safe control',owner:'QA',frequency:'Yıllık',implementation:'QA',status:'Taslak'}},201);
 await page.route(url=>url.pathname===path,async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON();
  if(body.action==='discover-source')return route.fulfill({json:{detected:{rootType:'object',paths:[{path:'$.healthy',type:'boolean'}]},suggestedControls:[{ref:control.id,title:'Retry-safe control',score:100,matches:[]}]}});
  if(body.action==='run-rule'){runs++;return route.fulfill({json:{ruleId:body.ruleId,status:'error'}});}
  if(body.action!=='save-rule')return route.continue();
  saves.push(body);const r=await ctx.request.post(base+path,{headers:{origin:base},data:body}),result=await r.json();
  if(drop){drop=false;assert.equal(r.status(),200);createdId=result.ruleId;return route.abort('failed');}
  return route.fulfill({status:r.status(),json:result});
 });
 for(const locale of ['tr','en']){
  const tr=locale==='tr',name=`QA retry wizard ${locale}`;
  await page.goto(base);await switchQaLocale(page,locale);await openQaModule(page,tr?'Kanıt Otomasyonu':'Evidence Automation');
  await page.locator('.ea-tabs').getByRole('button',{name:tr?'Kanıt Kaynakları':'Evidence Sources',exact:true}).click();
  const add=page.locator('.ew-heading').getByRole('button',{name:tr?'+ Kaynak ekle':'+ Add source',exact:true});if(await add.isVisible())await add.click();
  await page.locator('.ew-picker').getByRole('button',{name:/Configure connection|Bağlantıyı yapılandır/}).click();
  const wizard=page.locator('.cow-shell');await wizard.getByLabel(tr?'Connector şablonu':'Connector template',{exact:true}).selectOption({label:'Generic REST / JSON API'});
  await wizard.getByLabel(tr?'Kaynak adı':'Source name',{exact:true}).fill(name);await wizard.getByLabel('HTTPS JSON URL',{exact:true}).fill('https://example.com/qa-never-collected');await wizard.getByLabel(tr?'Kimlik doğrulama':'Authentication',{exact:true}).selectOption('none');
  await wizard.getByRole('button',{name:/^(Bağlan ve Algıla|Authenticate & Detect)$/}).click();await wizard.getByRole('button',{name:/^(Kontrolleri Eşleştir|Map Controls)$/}).click();await wizard.getByRole('checkbox').first().check();await wizard.getByRole('button',{name:/^(İzlemeyi Yapılandır|Configure Monitoring)$/}).click();
  drop=true;saves=[];runs=0;await wizard.getByRole('button',{name:/^(İzlemeyi Etkinleştir|Enable Monitoring)$/}).click();await expect(wizard.locator('.cow-message.error')).toBeVisible();assert.equal(runs,0);
  const original=(await api(ctx,path)).rules.find(r=>r.id===createdId);assert.ok(original);const originalId=createdId;
  await wizard.getByRole('button',{name:/^(İzlemeyi Etkinleştir|Enable Monitoring)$/}).click();await expect(wizard.locator('.cow-complete')).toBeVisible();assert.equal(saves.length,2);assert.ok(saves[0].requestId);assert.equal(saves[0].requestId,saves[1].requestId);assert.equal(runs,1);
  let data=await api(ctx,path);assert.equal(data.rules.filter(r=>r.sourceId===original.sourceId).length,1);assert.equal(data.rules.find(r=>r.id===originalId).nextRunAt,original.nextRunAt);
  await wizard.getByRole('button',{name:/^(Sürekli Kontrol Kuralı|Continuous Control Rule)$/}).click();await expect(page.locator('.ew-selected')).toContainText(original.name);
  checks.push(`${locale}: wizard lost-save acknowledgement reuses one persisted rule`);
  const open=()=>page.locator('.ea-section-action').getByRole('button',{name:tr?'+ Kontrol Ekle':'+ Add Control',exact:true}).click();
  await open();const dialog=page.getByRole('dialog',{name:tr?'Sürekli kontrol tanımla':'Define continuous control',exact:true});
  await dialog.getByLabel(tr?'Kontrol testi adı':'Control test name',{exact:true}).fill(`QA manual ${locale}`);await dialog.getByLabel(tr?/^Kanıt kaynağı/:/^Evidence source/).selectOption(original.sourceId);await dialog.getByLabel(tr?'Bağlı kontrol/maddeler':'Mapped controls',{exact:true}).fill(control.id);await dialog.getByLabel('JSON path',{exact:true}).fill('$.healthy');
  drop=true;saves=[];await dialog.getByRole('button',{name:tr?'Sürekli Kontrolü Kaydet':'Save Continuous Control',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();const manualId=createdId;
  await dialog.getByRole('button',{name:tr?'Sürekli Kontrolü Kaydet':'Save Continuous Control',exact:true}).click();await expect(dialog).toBeHidden();assert.equal(saves.length,2);assert.equal(saves[0].requestId,saves[1].requestId);
  data=await api(ctx,path);assert.equal(data.rules.filter(r=>r.sourceId===original.sourceId).length,2);assert.ok(data.rules.find(r=>r.id===manualId));
  checks.push(`${locale}: manual lost-save acknowledgement reuses one persisted rule`);
  await open();await dialog.getByLabel(tr?'Kontrol testi adı':'Control test name',{exact:true}).fill(`QA conflict ${locale}`);await dialog.getByLabel(tr?'Bağlı kontrol/maddeler':'Mapped controls',{exact:true}).fill(control.id);await dialog.getByLabel('JSON path',{exact:true}).fill('$.healthy');
  drop=true;saves=[];await dialog.getByRole('button',{name:tr?'Sürekli Kontrolü Kaydet':'Save Continuous Control',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
  const conflictId=createdId;await dialog.getByLabel(tr?'Kontrol testi adı':'Control test name',{exact:true}).fill('Changed after lost acknowledgement');await dialog.getByRole('button',{name:tr?'Sürekli Kontrolü Kaydet':'Save Continuous Control',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText(tr?'yeni kayıt oluşturulmadı':'no new record was created');assert.equal(saves[0].requestId,saves[1].requestId);
  await dialog.screenshot({path:`${out}/${locale}-conflict.png`});await dialog.getByRole('button',{name:tr?'Kaydedilen kontrolü aç':'Open saved control',exact:true}).click();await expect(page.locator('.ew-selected')).toContainText(`QA conflict ${locale}`);
  data=await api(ctx,path);assert.equal(data.rules.filter(r=>r.sourceId===original.sourceId).length,3);assert.equal(data.rules.find(r=>r.id===conflictId).name,`QA conflict ${locale}`);
  checks.push(`${locale}: changed retry rejected with exact saved-rule recovery`);
 }
 const payload=saves[0];
 const ids=await Promise.all(Array.from({length:6},()=>api(ctx,path,'POST',{...payload,name:'QA concurrent',requestId:'20000000-0000-4000-8000-000000000001'})));assert.equal(new Set(ids.map(x=>x.ruleId)).size,1);
 for(const role of ['Viewer','Editor']){
  const email=`qa-rule-retry-${role.toLowerCase()}@fornost.test`;await api(ctx,'/api/users','POST',{name:`Retry ${role}`,email,password,role},201);const other=await browser.newContext();await api(other,'/api/auth','POST',{action:'login',email,password});await api(other,path,'POST',payload,403);await other.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',checks,concurrentRequests:6,roleDenials:2,providerCalls:0,storage:'disposable local database'},null,2));console.log('CONNECTOR_RULE_RETRY_QA_PASS',JSON.stringify({journeys:checks.length,concurrentRequests:6,roleDenials:2,providerCalls:0}));
}catch(e){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
