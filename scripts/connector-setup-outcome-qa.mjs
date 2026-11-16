import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale,waitForQaIdle} from './qa-browser-harness.mjs';

// Actual UI; every connector write is fulfilled locally. Never contact a provider.
const base=(process.env.FORNOST_PROD_URL||'http://127.0.0.1:4173').replace(/\/$/,''),out='connector-setup-qa-artifacts';
const headers=process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET?{'CF-Access-Client-Id':process.env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':process.env.CF_ACCESS_CLIENT_SECRET}:{};
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,headers,{viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(15000);
const errors=[],unexpectedWrites=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const controlRef='QA-CON-SETUP',stamp='2026-11-16T10:00:00.000Z';
const source={id:'qa-setup-source',name:'QA connector',vendor:'Microsoft',driver:'provider-v1',enabled:true,config:{providerId:'intune',dataset:'managed-devices'},lastTestStatus:'success',lastTestAt:stamp};
const rule={id:'qa-setup-rule',name:'QA setup control',sourceId:source.id,controlRefs:controlRef,enabled:true,freshness:'missing',lastStatus:'error',lastRunAt:stamp,lastRunId:null};
let registered=false,current={},actions=[],saveKeys=[],sourceKeys=[],releaseRun;
const outcomes=[
  {key:'lost-source-response',lostSource:true,status:'pass',evidence:true,tone:'success',tr:'İlk kontrol başarılı',en:'First control check passed'},
  {key:'changed-source-retry',lostSource:true,sourceConflict:true},
  {key:'pass',status:'pass',evidence:true,tone:'success',tr:'İlk kontrol başarılı',en:'First control check passed'},
  {key:'fail',status:'fail',evidence:true,finding:true,tone:'warning',tr:'İlk kontrol dikkat gerektiriyor',en:'First control check needs attention'},
  {key:'error',status:'error',tone:'error',tr:'İlk kontrol doğrulanamadı',en:'First control check could not be verified'},
  {key:'missing-evidence',status:'pass',tone:'unknown',tr:'İlk çalışma sonucu doğrulanamadı',en:'First run result is unconfirmed'},
  {key:'unknown',status:'unexpected-status',tone:'unknown',tr:'İlk çalışma sonucu doğrulanamadı',en:'First run result is unconfirmed'},
  {key:'lost-save-response',lostSave:true,status:'pass',evidence:true,tone:'success',tr:'İlk kontrol başarılı',en:'First control check passed'},
  {key:'changed-save-retry',lostSave:true,saveConflict:true,tone:'unknown',tr:'İlk çalışma sonucu doğrulanamadı',en:'First run result is unconfirmed'},
  {key:'lost-response',transportFailure:true,tone:'unknown',tr:'İlk çalışma sonucu doğrulanamadı',en:'First run result is unconfirmed'},
];
async function theme(value){if(await page.locator('html').getAttribute('data-theme')!==value)await page.locator('.theme-toggle:visible').click();await waitForQaIdle(page);}
async function contrast(selector,label){const audit=await new AxeBuilder({page}).include(selector).withRules(['color-contrast']).analyze();assert.deepEqual(audit.violations,[],label);assert.deepEqual(audit.incomplete,[],`${label}: complete contrast coverage`);}
try{
  await mkdir(out,{recursive:true});
  const login=await context.request.post(base+'/api/auth',{headers:{...headers,origin:base},data:{action:'login',email:process.env.FORNOST_SMOKE_EMAIL||'qa-admin@fornost.test',password:process.env.FORNOST_SMOKE_PASSWORD||qaPassword()}});
  assert.equal(login.status(),200);
  // Exercise the real authenticated endpoint independently of the UI fixture.
  // Never start an upstream fetch inside the intercepted browser request.
  const register=await context.request.get(base+'/api/grc',{headers,timeout:15000});
  assert.equal(register.status(),200,'Live register preflight');
  assert.ok(Array.isArray((await register.json()).rows),'Live register rows');
  console.log('CONNECTOR_REGISTER_PREFLIGHT_PASS');
  await page.route('**/api/**',async route=>{
    if(!['GET','HEAD'].includes(route.request().method())){unexpectedWrites.push(new URL(route.request().url()).pathname);return route.abort();}
    return route.fallback();
  });
  await page.route(url=>url.origin===new URL(base).origin&&url.pathname==='/api/grc',async route=>{
    if(route.request().method()!=='GET')return route.fallback();
    const rows=[{id:'qa-setup-control',module:'Kontroller',record_code:controlRef,data_json:JSON.stringify({controlId:controlRef,title:'QA mapped control'}),created_at:stamp,updated_at:stamp}];
    await route.fulfill({status:200,json:{rows,nextCursor:null}});
  });
  await page.route(url=>url.origin===new URL(base).origin&&url.pathname==='/api/evidence-automation',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:{sources:registered?[source]:[],rules:registered?[rule]:[],runs:[],findings:[]}});
    const body=route.request().postDataJSON();actions.push(body.action);
    if(body.action==='save-source'){sourceKeys.push(body.requestId);assert.match(body.requestId,/^[0-9a-f-]{36}$/);if(current.lostSource){registered=true;if(sourceKeys.length===1)return route.abort('failed');if(current.sourceConflict)return route.fulfill({status:409,json:{code:'SOURCE_CREATION_CONFLICT',sourceId:source.id}});}return route.fulfill({json:{sourceId:source.id}});}
    if(body.action==='discover-source')return route.fulfill({json:{detected:{rootType:'object',paths:[{path:'$.healthy',type:'boolean'}]},suggestedControls:[{ref:controlRef,title:'QA mapped control',score:90,matches:[]}]}});
    if(body.action==='save-rule'){registered=true;saveKeys.push(body.requestId);assert.equal(body.controlRefs,controlRef);assert.match(body.requestId,/^[0-9a-f-]{36}$/);if(current.lostSave&&saveKeys.length===1)return route.abort('failed');if(current.saveConflict)return route.fulfill({status:409,json:{code:'RULE_CREATION_CONFLICT',ruleId:rule.id}});return route.fulfill({json:{ruleId:rule.id,reused:saveKeys.length>1}});}
    if(body.action==='run-rule'){
      assert.equal(body.ruleId,rule.id);
      await new Promise(resolve=>{releaseRun=resolve;});
      if(current.transportFailure)return route.abort('failed');
      return route.fulfill({json:{ruleId:rule.id,runId:'qa-setup-run',status:current.status,evidenceId:current.evidence?'qa-setup-evidence':'',findingId:current.finding?'qa-setup-finding':'',message:'Server response must not imply a successful control.'}});
    }
    unexpectedWrites.push(body.action);return route.abort();
  });
  for(const locale of ['tr','en'])for(const outcome of outcomes){
    console.log('CONNECTOR_SETUP_CASE_START',locale,outcome.key);
    current=outcome;registered=false;actions=[];saveKeys=[];sourceKeys=[];releaseRun=undefined;
    await page.setViewportSize({width:1440,height:1000});await page.goto(base);
    await switchQaLocale(page,locale);await expect(page.locator('main > .notice')).toHaveCount(0);
    await openQaModule(page,locale==='tr'?'Kanıt Otomasyonu':'Evidence Automation');
    await page.locator('.ew-picker').getByRole('button',{name:/Configure connection|Bağlantıyı yapılandır/i}).click();
    const wizard=page.locator('.cow-shell'),result=wizard.locator('.cow-complete');
    await expect(wizard).toBeVisible();
    if(outcome.key==='pass')for(const mode of ['light','dark']){await theme(mode);await contrast('.cow-steps',`${locale}/${mode}: active step`);}
    await wizard.getByRole('button',{name:/^(Bağlan ve Algıla|Authenticate & Detect)$/}).click();
    if(outcome.lostSource){
      await expect(wizard.locator('.cow-message.error')).toBeVisible();assert.equal(actions.filter(x=>x==='discover-source').length,0);
      if(outcome.sourceConflict)await wizard.getByLabel(locale==='tr'?'Kaynak adı':'Source name',{exact:true}).fill('Changed after source response loss');
      await wizard.getByRole('button',{name:/^(Bağlan ve Algıla|Authenticate & Detect)$/}).click();
      await expect.poll(()=>sourceKeys.length).toBe(2);assert.equal(sourceKeys[0],sourceKeys[1]);
      if(outcome.sourceConflict){
        await expect(wizard.locator('.cow-message.error')).toContainText(locale==='tr'?'yeni kaynak oluşturulmadı':'no new source was created');
        assert.equal(actions.filter(x=>x==='discover-source').length,0);
        await wizard.getByRole('button',{name:/^(Kaydedilen kaynağı aç|Open saved source)$/}).click();
        await expect(page.locator(`[data-source-id="${source.id}"]`)).toHaveAttribute('aria-pressed','true');
        checks.push({locale,outcome:outcome.key,sourceSaveRequests:sourceKeys.length,uniqueSourceKeys:new Set(sourceKeys).size,passed:true});
        console.log('CONNECTOR_SETUP_CASE_PASS',locale,outcome.key);continue;
      }
    }
    await wizard.getByRole('button',{name:/^(Kontrolleri Eşleştir|Map Controls)$/}).click();
    await wizard.getByRole('checkbox').first().check();
    await wizard.getByRole('button',{name:/^(İzlemeyi Yapılandır|Configure Monitoring)$/}).click();
    await wizard.getByRole('button',{name:/^(İzlemeyi Etkinleştir|Enable Monitoring)$/}).click();
    if(outcome.lostSave){
      await expect(wizard.locator('.cow-message.error')).toBeVisible();
      if(outcome.saveConflict)await wizard.getByLabel(locale==='tr'?'Sürekli kontrol adı':'Continuous control name',{exact:true}).fill('Changed after response loss');
      await wizard.getByRole('button',{name:/^(İzlemeyi Etkinleştir|Enable Monitoring)$/}).click();
      await expect.poll(()=>saveKeys.length).toBe(2);assert.equal(saveKeys[0],saveKeys[1]);
    }
    if(!outcome.saveConflict){
    await expect.poll(()=>typeof releaseRun).toBe('function');
    await expect(wizard.getByRole('button',{name:/^(Geri|Back)$/})).toBeDisabled();
    await expect(wizard.getByRole('button',{name:/İlk kontrol çalışıyor|Running first control/})).toBeDisabled();
    releaseRun();
    }
    await expect(result).toHaveAttribute('data-outcome',outcome.tone);
    await expect(result.getByRole('heading',{name:outcome[locale],exact:true})).toBeVisible();
    await expect(wizard.locator('.cow-message.success')).toHaveCount(0);
    await expect(result.getByRole('button',{name:/^(Kanıtı Aç|Open Evidence)$/})).toHaveCount(outcome.evidence?1:0);
    await expect(result.getByRole('button',{name:/^(Otomasyon Bulgusu|Automation Finding)$/})).toHaveCount(outcome.finding?1:0);
    await expect(result.locator('.cow-linked-controls button')).toContainText(controlRef);
    await expect(wizard.getByRole('button',{name:/^(İzlemeyi Etkinleştir|Enable Monitoring)$/})).toHaveCount(0);
    assert.equal(actions.filter(x=>x==='save-rule').length,outcome.lostSave?2:1,'Only an unconfirmed save is retried with the same request key');
    if(outcome.saveConflict){assert.equal(actions.filter(x=>x==='run-rule').length,0);await expect(wizard.locator('.cow-message.error')).toContainText(locale==='tr'?'yeni kayıt oluşturulmadı':'no new record was created');}
    if(['pass','error'].includes(outcome.key))for(const mode of ['light','dark'])for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});await theme(mode);
      const linked=result.locator('.cow-linked-controls button').first();
      await page.mouse.move(0,0);await contrast('.cow-complete',`${locale}/${mode}/${width}: result`);
      await linked.hover();await contrast('.cow-linked-controls',`${locale}/${mode}/${width}: linked control hover`);
      await page.mouse.move(0,0);await linked.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(linked).toBeFocused();
      await contrast('.cow-linked-controls',`${locale}/${mode}/${width}: linked control keyboard focus`);
      assert.ok(await linked.evaluate(node=>node.matches(':focus-visible')&&getComputedStyle(node).outlineStyle!=='none'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Result must fit viewport');
      await wizard.screenshot({animations:'disabled',path:`${out}/${locale}-${outcome.key}-${mode}-${width}.png`});
    }
    if(outcome.transportFailure){
      await page.setViewportSize({width:1440,height:1000});
      await result.getByRole('button',{name:/^(Sürekli Kontrol Kuralı|Continuous Control Rule)$/}).click();
      await expect(page.locator('.ew-selected')).toContainText(rule.name);
      assert.equal(actions.filter(x=>x==='save-rule').length,1);
    }
    checks.push({locale,outcome:outcome.key,saveRequests:saveKeys.length,uniqueSaveKeys:new Set(saveKeys).size,passed:true});
    console.log('CONNECTOR_SETUP_CASE_PASS',locale,outcome.key);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedWrites,[]);
  await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',coverage:'Actual UI with intercepted connector transport; no provider calls or persisted connector writes',checks},null,2));
  console.log('CONNECTOR_SETUP_OUTCOME_PASS',JSON.stringify({scenarios:checks.length,unexpectedWrites:unexpectedWrites.length}));
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{releaseRun?.();await browser.close();}
