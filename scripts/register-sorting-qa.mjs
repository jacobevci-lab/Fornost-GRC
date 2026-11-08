import { openRegisterViews } from "./qa-browser-harness.mjs";
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
// Isolated read fixtures verify presentation and ordering. Account/history and
// authorization are covered by the separate real API/browser suites.
const base='http://127.0.0.1:4173',out='register-sorting-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(15000);const checks=[],errors=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith(base+'/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(new URL(r.url()).pathname);});
const modules=[['Risk Assessment','Risk Assessment','Risk Değerlendirmesi','title','inherentRisk'],['BIA','Business Impact Analysis (BIA)','İş Etki Analizi (BIA)','process','rto'],['Varlık Envanteri','Asset Inventory','Varlık Envanteri','title','eolDate'],['Uyum','Compliance Management','Uyum Yönetimi','controlTitle','dueDate'],['Kontroller','Control Library','Kontrol Kütüphanesi','controlTitle','nextTestDate'],['Kanıtlar','Evidence Library','Kanıt Kütüphanesi','evidenceTitle','expiresAt']];
const dates=['2026-02-10','2026-02-02',''];
const fixtures=modules.flatMap(([module,,,titleKey])=>[10,2,30].map((n,i)=>({id:`QA-SORT-${module}-${n}`,code:`SORT-${module}-${n}`,module,created_at:'2026-01-01T12:00:00Z',updated_at:'2026-01-01T12:00:00Z',data_json:JSON.stringify({[titleKey]:`QA order ${n}`,owner:'qa-admin@fornost.test',ownerEmail:'qa-admin@fornost.test',businessUnit:'QA',status:'Open',inherentLikelihood:i===2?'':2,inherentImpact:i===2?'':i===0?5:1,rto:i===2?'':n,eolDate:dates[i],dueDate:dates[i],nextTestDate:dates[i],expiresAt:dates[i],targetDate:dates[i]})})));
for (const row of fixtures) {
 const data = JSON.parse(row.data_json);
 if (row.module === 'Risk Assessment') data.existingControls = 'QA-SORT-Kontroller-10';
 if (row.module === 'Kanıtlar' && row.id.endsWith('-10')) {
   data.controlRefs = ['QA-SORT-Kontroller-10'];
   data.versionNo = 3;
 }
 row.data_json = JSON.stringify(data);
}
async function open(name){
 const mobile=page.locator('.mobile-nav-toggle');if(await mobile.isVisible()&&await mobile.getAttribute('aria-expanded')!=='true')await mobile.click();
 const nav=page.locator('#fornost-navigation'),button=nav.getByRole('button',{name,exact:true,includeHidden:true});await expect(button).toBeAttached();
 if(!await button.isVisible())for(const group of await nav.locator('.nav-group').all())if(await group.getByRole('button',{name,exact:true,includeHidden:true}).count()){await group.locator('.nav-group-trigger').click();break;}
 await button.click();await expect(page.locator('main>header h1')).toHaveText(name);
}
const sort=()=>page.getByRole('combobox',{name:'Sort by',exact:true}),direction=()=>page.getByRole('combobox',{name:'Sort direction',exact:true});
async function titles(){return page.locator('.table-card table tbody tr').evaluateAll(rows=>rows.map(row=>row.textContent.match(/QA order \d+/)?.[0]));}
async function localPanel(){await openRegisterViews(page);const p=page.locator('.saved-register-views');if(await p.getAttribute('open')===null)await p.locator(':scope>summary').click();return p;}
try{
 const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.route('**/api/grc',route=>route.request().method()==='GET'?route.fulfill({json:{rows:fixtures,nextCursor:null}}):route.continue());
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await open('Risk Assessment');
 const searchField = page.locator('.risk-register .register-search input');
 for (const width of [1440, 390]) {
   await page.setViewportSize({width, height:900});
   await searchField.fill('QA order 10');
   const trigger = page.locator('.risk-register .table-wrap .record-open').first();
   await trigger.click();
   const inspection = page.getByRole('region', {name:'Record inspection'});
   await expect(inspection).toBeVisible();
   if (width === 390) await expect(inspection.locator('.record-inspector h3')).toBeInViewport();
   await inspection.locator('.record-inspector li button').filter({hasText:'Control Library'}).click();
   await inspection.locator('.record-inspector li button').filter({hasText:'Evidence Library'}).click();
   await expect(inspection.locator('dd').filter({hasText:'v3'})).toBeVisible();
   await inspection.getByRole('button',{name:'Previous record'}).click();
   await expect(inspection.locator('.record-inspector > small')).toContainText('Control Library');
   await page.screenshot({path:out + '/connected-register-' + width + '.png', animations:'disabled'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth + 2),false);
   await inspection.getByRole('button',{name:'Back to list'}).click();
   await expect(trigger).toBeFocused();
   await expect(searchField).toHaveValue('QA order 10');
   await expect(page.locator('.risk-register tbody tr')).toHaveCount(1);
   await searchField.fill('');
 }
 checks.push('filtered risk → control → evidence version → previous → focused list on desktop and phone');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('.language-switch:visible').getByRole('button', {name:'TR', exact:true}).click();
 const toolbar = page.locator('.risk-register .register-toolbar');
 const views = toolbar.getByRole('button', {name:'Görünümler', exact:true});
 await expect(toolbar.getByRole('status').filter({hasText:'3 kayıt'})).toBeVisible();
 await expect(views).toHaveAttribute('aria-expanded','false');
 await expect(toolbar.locator('.saved-register-views')).toBeHidden();
 await expect(toolbar.locator('.account-views')).toBeHidden();
 for (const width of [1440, 360, 390]) {
   await page.setViewportSize({width, height:960});
   const box = await toolbar.boundingBox();
   if (width === 1440) {
     const controls = await Promise.all([toolbar.locator('.register-search'), toolbar.getByRole('combobox',{name:'Sırala',exact:true}), toolbar.getByRole('button',{name:'Filtreler',exact:true}), toolbar.getByRole('button',{name:/Sütunlar/}), views].map(node=>node.boundingBox()));
     assert.ok(controls.every(r=>r && r.height >= 35 && Math.abs(r.y-controls[0].y)<=2 && Math.abs(r.height-controls[0].height)<=2), JSON.stringify(controls));
     assert.ok(box.height<=64, 'Closed toolbar must keep the first row of data close to the controls: '+box.height);
   }
   assert.ok(await toolbar.evaluate(el=>el.scrollWidth<=el.clientWidth+1), 'Toolbar fits the available width');
   if (width <= 390) {
     for (const button of await toolbar.locator('.register-view-actions > button, .column-picker-wrap > button').all()) {
       const lines = await button.evaluate(el => {
         const label = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
         if (!label) return 0;
         const range = document.createRange();
         range.selectNodeContents(label);
         return range.getClientRects().length;
       });
       assert.equal(lines, 1, 'Each mobile action label must fit on one line');
     }
   }
   await page.locator('.risk-register').screenshot({path:`${out}/risk-toolbar-${width}.png`});
 }
 await views.press('Enter');
 await expect(toolbar.locator('.saved-register-views > summary')).toBeVisible();
 await toolbar.locator('.saved-register-views > summary').press('Escape');
 await expect(views).toBeFocused();
 await expect(views).toHaveAttribute('aria-expanded','false');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 checks.push('Risk toolbar: aligned desktop controls, real records directly below, responsive views disclosure and keyboard return');
 for(const [module,label,,titleKey,field] of modules){
  void titleKey;await open(label);await expect(sort()).toBeEnabled();await sort().selectOption(field);await direction().selectOption('asc');await expect.poll(titles).toEqual(['QA order 2','QA order 10','QA order 30']);
  await direction().selectOption('desc');await expect.poll(titles).toEqual(['QA order 10','QA order 2','QA order 30']);
  await sort().selectOption('title');await expect.poll(titles).toEqual(['QA order 2','QA order 10','QA order 30']);
  await direction().selectOption('desc');await expect.poll(titles).toEqual(['QA order 30','QA order 10','QA order 2']);
  let p=await localPanel();await p.getByLabel('View name',{exact:true}).fill('Sorted work');await p.getByRole('button',{name:'Save new view',exact:true}).click();await expect(p.getByRole('status')).toHaveText('View saved in this browser.');const id=await p.getByLabel('Select view',{exact:true}).inputValue();
  await sort().selectOption('');await expect.poll(titles).toEqual(['QA order 10','QA order 2','QA order 30']);await p.getByRole('button',{name:'Apply view',exact:true}).click();await expect(direction()).toHaveValue('desc');await expect.poll(titles).toEqual(['QA order 30','QA order 10','QA order 2']);
  await page.reload();await expect(page.locator('.shell')).toBeVisible();await expect(sort()).toHaveValue('title');await expect(direction()).toHaveValue('desc');await expect.poll(titles).toEqual(['QA order 30','QA order 10','QA order 2']);
  p=await localPanel();await p.getByLabel('Select view',{exact:true}).selectOption(id);await expect(p).toContainText('Title · Descending');
  checks.push(module+': numeric/date/title directions, missing last, browser view, default and reload');
 }
 await open('Risk Assessment');await sort().selectOption('');let legacy=await localPanel();await legacy.getByLabel('View name',{exact:true}).fill('Legacy default order');await legacy.getByRole('button',{name:'Save new view',exact:true}).click();await expect(legacy.getByRole('status')).toHaveText('View saved in this browser.');await sort().selectOption('title');await legacy.getByRole('button',{name:'Apply view',exact:true}).click();await expect(sort()).toHaveValue('');await expect.poll(titles).toEqual(['QA order 10','QA order 2','QA order 30']);checks.push('view without a sort resets a previous custom order');await sort().selectOption('inherentRisk');await expect.poll(titles).toEqual(['QA order 10','QA order 2','QA order 30']);
 await page.getByRole('textbox',{name:'Search records',exact:true}).fill('No match');await page.getByRole('button',{name:'Clear search and filters',exact:true}).click();await expect(sort()).toHaveValue('inherentRisk');await expect.poll(titles).toEqual(['QA order 10','QA order 2','QA order 30']);
 // Real keyboard interaction, then responsive/localized controls in both themes.
 await sort().focus();await sort().press('Tab');await expect(direction()).toBeFocused();
 for(const locale of ['EN','TR']){await page.locator('.language-switch:visible').getByRole('button',{name:locale,exact:true}).click();await expect(page.getByRole('combobox',{name:locale==='TR'?'Sırala':'Sort by',exact:true})).toHaveValue('inherentRisk');for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);for(const width of [1440,1100,1024,390]){await page.setViewportSize({width,height:1000});const controls=page.locator('.register-sort-controls');await controls.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);assert.ok(await controls.evaluate(el=>el.scrollWidth-el.clientWidth)<=1);const search=await page.locator('.register-search').boundingBox();assert.ok(search.height>=36&&search.height<=56,'Search must keep a single-line input height in row and column toolbar layouts');if(width>=1000)assert.ok(search.width>=240,'Search must remain wide enough for a readable query');if(width===390){const sorting=await controls.boundingBox(),filters=await page.locator('.register-view-actions').getByRole('button',{name:locale==='TR'?'Filtreler':'Filters',exact:true}).boundingBox();assert.ok(filters.y>=sorting.y+sorting.height-1,'On narrow screens, filter actions must follow the complete sort controls');}await page.screenshot({path:`${out}/${locale}-${theme}-${width}.png`,animations:'disabled',timeout:15000});assert.deepEqual((await new AxeBuilder({page}).include('.register-sort-controls').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);}}}
 checks.push('search recovery preserves order; keyboard, TR/EN, light/dark, desktop/mobile and contrast');
 await page.setViewportSize({width:1440,height:1000});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await open('My Work');
 const work=page.locator('.my-work-v2');await expect(work.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();await work.getByRole('button',{name:'Organization',exact:true}).click();await work.getByRole('combobox',{name:'Work queue module',exact:true}).selectOption('Risk Assessment');
 await work.locator('.mw2-filters').getByRole('button',{name:/All/}).click();await sort().selectOption('title');await direction().selectOption('desc');
 const queueTitles=()=>work.locator('.mw2-item .mw2-title b').allTextContents();await expect.poll(queueTitles).toEqual(['QA order 30','QA order 10','QA order 2']);
 let p=await localPanel();await p.getByLabel('View name',{exact:true}).fill('Sorted tasks');await p.getByRole('button',{name:'Save new view',exact:true}).click();await expect(p.getByRole('status')).toHaveText('View saved in this browser.');await sort().selectOption('due');await direction().selectOption('asc');await p.getByRole('button',{name:'Apply view',exact:true}).click();await expect(sort()).toHaveValue('title');await expect(direction()).toHaveValue('desc');await expect(work.getByRole('button',{name:'Organization',exact:true})).toHaveAttribute('aria-pressed','true');
 const exportButton=work.getByRole('button',{name:/CSV/});const [download]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);const csv=await readFile(await download.path(),'utf8');assert.ok(csv.indexOf('QA order 30')<csv.indexOf('QA order 10')&&csv.indexOf('QA order 10')<csv.indexOf('QA order 2'));assert.ok(csv.includes('"sort_field","sort_direction"'));assert.ok(csv.includes('"title","desc"'));
 await sort().selectOption('due');await direction().selectOption('asc');await expect.poll(queueTitles).toEqual(['QA order 2','QA order 10','QA order 30']);
 checks.push('My Work sorted current scope, saved view, missing deadlines last and matching CSV order');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks,errors,writes},null,2));console.log('REGISTER_SORTING_QA_PASS',checks.length);
}catch(error){await writeFile(`${out}/failure.json`,JSON.stringify({message:error.message,stack:error.stack,errors},null,2));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();}
