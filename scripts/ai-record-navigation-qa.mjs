import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='ai-record-navigation-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const model={id:'QA-AIM-focus-1',systemName:'QA same model',modelName:'Local model',vendor:'Internal',purpose:'QA model navigation fixture',owner:'qa@fornost.test',deployment:'On-Prem',region:'TR',dataClassification:'Internal',autonomy:'Advisory',riskTier:'Medium',residualScore:8,controls:'Human approval',status:'draft',reviewDate:'2027-01-01'};
const alert={id:'QA-AIA-focus-1',modelId:model.id,title:'QA same alert',severity:'High',status:'open',findingId:'QA-AIF-focus-1',metric:'drift',occurrenceCount:1,lastSeenAt:'2026-10-04T12:00:00Z'};
const finding={id:'QA-AIF-focus-1',modelId:model.id,title:'QA same finding',domain:'assurance',sourceRef:alert.id,severity:'High',status:'open',state:'priority',owner:'qa@fornost.test',dueDate:'2027-01-01',description:'QA controlled finding fixture',rootCause:'QA root cause',correctiveAction:'QA corrective action',preventiveAction:'QA preventive action'};
const definitions=[
 {path:'/api/ai/models',collection:'models',view:'models',root:'.ai-model-inventory',item:model},
 {path:'/api/ai/assurance-alerts',collection:'alerts',view:'assurance-alerts',root:'.ai-alerts',item:alert},
 {path:'/api/ai/findings',collection:'findings',view:'findings',root:'.ai-findings',item:finding},
];
let mode='complete',affected='',mutationMode='',mutationCount=0;
let failRefresh=false;
for(const def of definitions)await page.route(`**${def.path}*`,route=>{
 if(route.request().method()!=='GET'){mutationCount++;if(mutationMode==='abort')return route.abort('failed');return route.fulfill({status:Number(mutationMode)||400,json:{error:'QA mutation rejected'}});}
 if(failRefresh&&affected===def.path)return route.fulfill({status:503,json:{error:'QA refresh failed'}});
 const items=mode==='many'?Array.from({length:12},(_,i)=>({...def.item,id:def.item.id.replace('-1',`-${i+1}`),severity:i===11?'Critical':'High',riskTier:i===11?'Critical':'High'})):[def.item,{...def.item,id:def.item.id.replace('-1','-2')}];
 const payload={summary:{total:2},models:[model],domains:['assurance'],[def.collection]:mode==='missing'&&affected===def.path?items.slice(1):items};
 const requestedId=new URL(route.request().url()).searchParams.get('id');if(requestedId)payload[def.collection]=payload[def.collection].filter(item=>item.id===requestedId);else if(mode==='outside'&&affected===def.path)payload[def.collection]=items.slice(1);
 if(affected===def.path&&mode==='error')return route.fulfill({status:503,json:{error:'QA unavailable'}});
 if(affected===def.path&&mode==='malformed')payload[def.collection]=[null];
 return route.fulfill({json:payload});
});
async function prepare(def){
 mode='complete';affected='';await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el=>el.click());
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-loading','false');
 await page.locator('.cg-filters input').fill(def.item.id);
 await expect(page.locator('.cg-records>button')).toHaveCount(1);
}
async function open(def){
 await page.locator('.cg-detail>header').getByRole('button',{name:'Open record',exact:false}).click();
 await expect(page.locator('#fornost-ai-panel')).toHaveAttribute('data-ai-view',def.view);
 await expect(page.locator(def.root)).toBeVisible();
}
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 for(const def of definitions){
  await prepare(def);await open(def);
  const root=page.locator(def.root),banner=root.locator('.ai-record-focus');
  await expect(banner).toHaveAttribute('data-state','found');
  await expect(root.locator('[data-record-id]')).toHaveCount(1);
  await expect(root.locator('[data-record-id]')).toHaveAttribute('data-record-id',def.item.id);
  await expect(root.locator('form')).toHaveCount(0);
  await banner.getByRole('button',{name:'Show all records'}).click();
  await expect(root.locator('[data-record-id]')).toHaveCount(2);
  await expect(banner).toHaveCount(0);
  await prepare(def);mode='outside';affected=def.path;await open(def);await expect(banner).toHaveAttribute('data-state','found');await expect(root.locator('[data-record-id]')).toHaveAttribute('data-record-id',def.item.id);
  for(const failure of ['missing','error','malformed']){
   await prepare(def);mode=failure;affected=def.path;await open(def);
   await expect(banner).toHaveAttribute('data-state',failure==='missing'?'missing':'error');
   await expect(root.locator('[data-record-id]')).toHaveCount(0);
   if(failure!=='missing'){
    mode='complete';await banner.getByRole('button',{name:'Retry'}).click();
    await expect(banner).toHaveAttribute('data-state','found');
    await expect(root.locator('[data-record-id]')).toHaveCount(1);
   }
  }
  if(def.view==='models'){
   await prepare(def);mode='many';await open(def);await expect(root.locator('[data-record-id]')).toHaveCount(1);await expect(root.locator('.ai-action-list-filters')).toHaveCount(0);
   await banner.getByRole('button',{name:'Show all records',exact:true}).click();await expect(root.locator('[data-record-id]')).toHaveCount(10);await expect(root.locator('form')).toHaveCount(0);
   await root.getByRole('button',{name:'Yeni model',exact:true}).click();await expect(root.locator('form')).toBeVisible();await root.locator('form input').first().fill('QA unsaved new model');await root.getByRole('button',{name:'Formu kapat',exact:true}).click();await expect(root.locator('form')).toHaveCount(0);await root.getByRole('button',{name:'Yeni model',exact:true}).click();await expect(root.locator('form input').first()).toHaveValue('QA unsaved new model');await root.getByRole('button',{name:'Formu kapat',exact:true}).click();
   await root.getByRole('button',{name:'Sonraki',exact:true}).click();await expect(root.locator('[data-record-id]')).toHaveCount(2);
   await root.getByRole('textbox',{name:'Kayıt ara',exact:true}).fill(model.id.replace('-1','-12'));await expect(root.locator('[data-record-id]')).toHaveCount(1);
   await root.getByRole('combobox',{name:'Kayıt önemi',exact:true}).selectOption('High');await expect(root.locator('[data-record-id]')).toHaveCount(0);await expect(root.locator('.ai-action-list-empty')).toBeVisible();
   await root.getByRole('button',{name:'Filtreleri temizle',exact:true}).click();await expect(root.locator('[data-record-id]')).toHaveCount(10);await root.getByRole('combobox',{name:'Kayıt durumu',exact:true}).selectOption('retired');await expect(root.locator('[data-record-id]')).toHaveCount(0);await root.getByRole('button',{name:'Filtreleri temizle',exact:true}).click();
   await root.getByRole('textbox',{name:'Kayıt ara',exact:true}).fill('Internal');await expect(root.locator('[data-record-id]')).toHaveCount(10);
   for(const theme of ['light','dark'])for(const width of [1536,390]){await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await page.setViewportSize({width,height:960});assert.ok(await root.locator('.ai-action-list-filters').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/models-list-${theme}-${width}.png`});}
   await page.setViewportSize({width:1536,height:960});await prepare(def);await open(def);
  }
  if(def.view!=='models'){
   await prepare(def);mode='many';await open(def);await expect(root.locator('[data-record-id]')).toHaveCount(1);await expect(root.locator('.ai-action-list-filters')).toHaveCount(0);
   await banner.getByRole('button',{name:'Show all records',exact:true}).click();await expect(root.locator('[data-record-id]')).toHaveCount(10);await expect(root.locator('form')).toHaveCount(0);
   await root.getByRole('button',{name:'Sonraki',exact:true}).click();await expect(root.locator('[data-record-id]')).toHaveCount(2);
   await root.getByRole('textbox',{name:'Kayıt ara',exact:true}).fill(def.item.id.replace('-1','-12'));await expect(root.locator('[data-record-id]')).toHaveCount(1);await expect(root.locator('[data-record-id]')).toHaveAttribute('data-record-id',def.item.id.replace('-1','-12'));
   await root.getByRole('combobox',{name:'Kayıt önemi',exact:true}).selectOption('High');await expect(root.locator('[data-record-id]')).toHaveCount(0);await expect(root.locator('.ai-action-list-empty')).toBeVisible();
   await root.getByRole('button',{name:'Filtreleri temizle',exact:true}).click();await expect(root.locator('[data-record-id]')).toHaveCount(10);
   await root.getByRole('combobox',{name:'Kayıt durumu',exact:true}).selectOption('resolved');await expect(root.locator('[data-record-id]')).toHaveCount(0);await root.getByRole('button',{name:'Filtreleri temizle',exact:true}).click();
   for(const theme of ['light','dark'])for(const width of [1536,390]){await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await page.setViewportSize({width,height:960});assert.ok(await root.locator('.ai-action-list-filters').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/${def.view}-list-${theme}-${width}.png`});}
   await page.setViewportSize({width:1536,height:960});await prepare(def);await open(def);
   const isFinding=def.view==='findings';
   const actionBox=root.locator(isFinding?'.action':'.dialog');
   async function edit(){await root.getByRole('button',{name:isFinding?'Başlat':'Kabul et',exact:true}).click();await actionBox.locator('textarea').fill('QA recovery action note');if(isFinding){await actionBox.getByPlaceholder('AKSİYONU BAŞLAT',{exact:true}).fill('AKSİYONU BAŞLAT');}else{await actionBox.locator('input').first().fill('qa@fornost.test');await actionBox.locator('input').last().fill('ALARMI KABUL ET');}}
   for(const failure of ['400','409','500','abort']){
    mutationMode=failure;const before=mutationCount;await edit();await actionBox.getByRole('button',{name:isFinding?'İşlemi Uygula':'Kaydet',exact:true}).click();
    await expect(root.locator('.notice')).toContainText(failure==='abort'?'doğrulanamadı':'QA mutation rejected');
    if(failure==='400'){await expect(actionBox).toBeVisible();await expect(actionBox.locator('textarea')).toHaveValue('QA recovery action note');await expect(actionBox.getByRole('button',{name:isFinding?'İşlemi Uygula':'Kaydet',exact:true})).toBeEnabled();await actionBox.getByRole('button',{name:'Vazgeç',exact:true}).click();}
    else{await expect(actionBox).toHaveCount(0);await expect(root.getByRole('button',{name:isFinding?'Başlat':'Kabul et',exact:true})).toBeEnabled();}
    assert.equal(mutationCount,before+1,'Failed mutations must never be automatically repeated');
   }
   // An uncertain write followed by a failed refresh must block more mutations until retry succeeds.
   mutationMode='abort';await edit();failRefresh=true;affected=def.path;await actionBox.getByRole('button',{name:isFinding?'İşlemi Uygula':'Kaydet',exact:true}).click();await expect(banner).toHaveAttribute('data-state','error');await expect(root.locator('.stats b').first()).toHaveText('—');await expect(root.locator('[data-record-id]')).toHaveCount(0);
   failRefresh=false;await banner.getByRole('button',{name:'Retry',exact:true}).click();await expect(banner).toHaveAttribute('data-state','found');
   if(!isFinding){const before=mutationCount;await root.getByRole('button',{name:'Ölçümleri Tara',exact:true}).click();await expect(root.locator('.notice')).toContainText('Tarama sonucu doğrulanamadı');await expect(root.getByRole('button',{name:'Ölçümleri Tara',exact:true})).toBeEnabled();assert.equal(mutationCount,before+1);}
   else{
    await banner.getByRole('button',{name:'Show all records',exact:true}).click();await root.getByRole('button',{name:'Yeni bulgu',exact:true}).click();const form=root.locator('form');await form.locator('select').nth(0).selectOption(model.id);await form.locator('input').nth(0).fill('QA-source');await form.locator('input[type="date"]').fill('2027-01-01');await form.locator('input').nth(2).fill('qa@fornost.test');await form.locator('input').nth(3).fill('QA preserved finding draft');for(const area of await form.locator('textarea').all())await area.fill('QA required explanation for finding creation');
    const before=mutationCount;await form.getByRole('button',{name:'Bulgu Oluştur',exact:true}).click();await expect(root.locator('.notice')).toContainText('Kayıt sonucu doğrulanamadı');await expect(form.getByRole('button',{name:'Bulgu Oluştur',exact:true})).toBeEnabled();await expect(form.locator('input').nth(3)).toHaveValue('QA preserved finding draft');assert.equal(mutationCount,before+1);
    await prepare(def);await open(def);
   }
   mutationMode='';
   // Follow authoritative native relations, including a missing target with no fallback record.
   await prepare(def);await open(def);
   if(def.view==='assurance-alerts'){
    await root.getByRole('button',{name:'Bağlı bulguyu aç',exact:true}).click();await expect(page.locator('#fornost-ai-panel')).toHaveAttribute('data-ai-view','findings');await expect(page.locator('.ai-findings [data-record-id]')).toHaveCount(1);await expect(page.locator('.ai-findings [data-record-id]')).toHaveAttribute('data-record-id',finding.id);
    await page.locator('.ai-findings').getByRole('button',{name:'Bağlı modeli aç',exact:true}).click();await expect(page.locator('.ai-model-inventory [data-record-id]')).toHaveCount(1);await expect(page.locator('.ai-model-inventory [data-record-id]')).toHaveAttribute('data-record-id',model.id);
    await prepare(def);await open(def);mode='missing';affected='/api/ai/findings';await root.getByRole('button',{name:'Bağlı bulguyu aç',exact:true}).click();await expect(page.locator('.ai-findings .ai-record-focus')).toHaveAttribute('data-state','missing');await expect(page.locator('.ai-findings [data-record-id]')).toHaveCount(0);
   }else{
    await root.getByRole('button',{name:'Bağlı modeli aç',exact:true}).click();await expect(page.locator('.ai-model-inventory [data-record-id]')).toHaveCount(1);await expect(page.locator('.ai-model-inventory [data-record-id]')).toHaveAttribute('data-record-id',model.id);
   }
   await prepare(def);await open(def);
  }
 }
 for(const lang of ['EN','TR']){
  await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
  await expect(page.locator('.ai-record-focus')).toContainText(lang==='EN'?'Selected record':'Seçili kayıt');
  for(const theme of ['light','dark'])for(const width of [1536,390]){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
   await page.setViewportSize({width,height:960});
   assert.ok(await page.locator('.ai-record-focus').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.screenshot({path:`${out}/${lang}-${theme}-${width}.png`});
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',exactRecordPaths:3,sameTitleIsolation:true,sourceFailuresAndRecovery:9,layouts:8,exactReadsBeyondList:true,nativeRelationsAndMissingTargets:true,modelListFiltersAndPagination:true,listFiltersAndPagination:true,mutationRecovery:true,noAutomaticWriteRetries:true,fixtureTransport:true}));
}finally{await browser.close();}
