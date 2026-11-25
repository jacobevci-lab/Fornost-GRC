import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale} from './qa-browser-harness.mjs';

// Only a disposable local runtime. Source saves are real; provider discovery is intercepted.
const base='http://127.0.0.1:4173',out='connector-source-retry-qa-artifacts',endpoint='/api/evidence-automation',password=qaPassword();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const ctx=await createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}}),page=await ctx.newPage();
page.setDefaultTimeout(15000);const checks=[],errors=[],unexpected=[];let drop=false,saves=[],createdId='',discoveries=0;
page.on('pageerror',e=>errors.push(e.message));
async function api(context,path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,`Unexpected ${method} ${path} status`);return r.json();}
try{
 await mkdir(out,{recursive:true});await api(ctx,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password});
 await page.route(url=>url.pathname===endpoint,async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON();
  if(body.action==='discover-source'){discoveries++;return route.fulfill({json:{detected:{rootType:'object',paths:[{path:'$.healthy',type:'boolean'}]},suggestedControls:[]}});}
  if(body.action!=='save-source'){unexpected.push(body.action);return route.abort();}
  saves.push(body);const r=await ctx.request.post(base+endpoint,{headers:{origin:base},data:body}),result=await r.json();
  if(drop){drop=false;assert.equal(r.status(),200);createdId=result.sourceId;return route.abort('failed');}
  return route.fulfill({status:r.status(),json:result});
 });
 for(const locale of ['tr','en'])for(const surface of ['wizard','manual'])for(const changed of [false,true]){
  const tr=locale==='tr',name=`QA source retry ${locale} ${surface} ${changed?'conflict':'same'}`,credential=`synthetic-source-credential-${locale}-${surface}`;
  const width=surface==='manual'&&changed?390:1440,theme=changed?'dark':'light';
  await page.setViewportSize({width,height:1000});await page.goto(base);await switchQaLocale(page,locale);
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
  await openQaModule(page,tr?'Kanıt Otomasyonu':'Evidence Automation');
  let form;
  if(surface==='wizard'){
   const add=page.locator('.ew-heading').getByRole('button',{name:tr?'+ Kaynak ekle':'+ Add source',exact:true});if(await add.isVisible())await add.click();
   await page.locator('.ew-picker').getByRole('button',{name:/Configure connection|Bağlantıyı yapılandır/}).click();form=page.locator('.cow-shell');
   await form.getByLabel(tr?'Bağlayıcı şablonu':'Connector template',{exact:true}).selectOption({label:'Generic REST / JSON API'});
  }else{
   await page.locator('.ea-tabs').getByRole('button',{name:tr?'Connector Kataloğu':'Connector Catalog',exact:true}).click();
   await page.locator('.ea-catalog').getByRole('button',{name:/Generic REST \/ JSON API/}).click();
   form=page.getByRole('dialog',{name:tr?'Kanıt kaynağı ekle':'Add evidence source',exact:true});
  }
  await form.getByLabel(tr?'Kaynak adı':'Source name',{exact:true}).fill(name);
  await form.getByLabel('HTTPS JSON URL',{exact:true}).fill('https://example.com/qa-never-collected');
  await form.getByLabel(tr?'Kimlik doğrulama':'Authentication',{exact:true}).selectOption('bearer');
  await form.getByLabel(tr?'Kimlik bilgisi':'Credential',{exact:true}).fill(credential);
  const submit=()=>form.getByRole('button',{name:surface==='wizard'?/^(Bağlan ve Algıla|Authenticate & Detect)$/:/^(Kaynağı Kaydet|Save Source)$/}).click();
  drop=true;saves=[];discoveries=0;await submit();
  const notice=surface==='wizard'?form.locator('.cow-message.error'):form.getByRole('status');await expect(notice).toBeVisible();
  const originalId=createdId;assert.equal(discoveries,0);let data=await api(ctx,endpoint);const original=data.sources.find(s=>s.id===originalId);assert.ok(original?.hasSecret);assert.ok(!JSON.stringify(data).includes(credential));
  if(changed){await form.getByLabel(tr?'Kaynak adı':'Source name',{exact:true}).fill('Changed after lost acknowledgement');await form.getByLabel(tr?'Kimlik bilgisi':'Credential',{exact:true}).fill('changed-synthetic-credential');}
  await submit();await expect.poll(()=>saves.length).toBe(2);assert.ok(saves[0].requestId);assert.equal(saves[0].requestId,saves[1].requestId);
  if(changed){
   await expect(notice).toContainText(tr?'yeni kaynak oluşturulmadı':'no new source was created');assert.equal(discoveries,0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal overflow');
   await form.screenshot({path:`${out}/${locale}-${surface}-conflict-${theme}-${width}.png`});
   const open=form.getByRole('button',{name:tr?'Kaydedilen kaynağı aç':'Open saved source',exact:true});await expect(open).toBeEnabled();await open.focus();await expect(open).toBeFocused();await page.keyboard.press('Enter');
   await expect(page.locator(`[data-source-id="${originalId}"]`)).toHaveAttribute('aria-pressed','true');await expect(page.locator('.ew-detail > header h3')).toHaveText(name);
  }else if(surface==='wizard'){
   await expect(form.locator('.cow-detected-summary')).toBeVisible();assert.equal(discoveries,1);
   await form.getByRole('button',{name:tr?'Kapat / Kaynaklara Dön':'Close / Back to sources',exact:true}).click();
   await expect(page.locator(`[data-source-id="${originalId}"]`)).toHaveAttribute('aria-pressed','true');
  }else await expect(form).toBeHidden();
  data=await api(ctx,endpoint);assert.equal(data.sources.filter(s=>s.name===name).length,1);assert.deepEqual(data.sources.find(s=>s.id===originalId),original);
  assert.equal(data.sources.filter(s=>s.name==='Changed after lost acknowledgement').length,0);
  assert.equal(await page.evaluate(secret=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes(secret)),credential),false);
  checks.push(`${locale}/${surface}/${changed?'changed contents recover exact source':'identical retry creates one source'}`);
 }
 const payload={...saves[0],name:'QA concurrent source',requestId:crypto.randomUUID()};
 const concurrent=await Promise.all(Array.from({length:6},()=>api(ctx,endpoint,'POST',payload)));assert.equal(new Set(concurrent.map(r=>r.sourceId)).size,1);
 await api(ctx,endpoint,'POST',{...payload,secret:'different-synthetic-credential'},409);
 await api(ctx,endpoint,'POST',{...payload,requestId:'invalid-key'},400);
 for(const role of ['Viewer','Editor']){
  const email=`qa-source-retry-${role.toLowerCase()}@fornost.test`;await api(ctx,'/api/users','POST',{name:`Source retry ${role}`,email,password,role},201);
  const other=await browser.newContext();await api(other,'/api/auth','POST',{action:'login',email,password});await api(other,endpoint,'POST',payload,403);await other.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 const result={status:'PASS',checks,concurrentRequests:6,roleDenials:2,providerCalls:0,storage:'disposable local database'};
 await writeFile(`${out}/result.json`,JSON.stringify(result,null,2));console.log('CONNECTOR_SOURCE_RETRY_QA_PASS',JSON.stringify(result));
}catch(e){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
