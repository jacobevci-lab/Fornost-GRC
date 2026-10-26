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
async function open(name){
 const mobile=page.locator('.mobile-nav-toggle');if(await mobile.isVisible()&&await mobile.getAttribute('aria-expanded')!=='true')await mobile.click();
 const nav=page.locator('#fornost-navigation'),button=nav.getByRole('button',{name,exact:true,includeHidden:true});await expect(button).toBeAttached();
 if(!await button.isVisible())for(const group of await nav.locator('.nav-group').all())if(await group.getByRole('button',{name,exact:true,includeHidden:true}).count()){await group.locator('.nav-group-trigger').click();break;}
 await button.click();await expect(page.locator('main>header h1')).toHaveText(name);
}
const sort=()=>page.getByRole('combobox',{name:'Sort by',exact:true}),direction=()=>page.getByRole('combobox',{name:'Sort direction',exact:true});
async function titles(){return page.locator('.table-card table tbody tr').evaluateAll(rows=>rows.map(row=>row.textContent.match(/QA order \d+/)?.[0]));}
async function localPanel(){const p=page.locator('.saved-register-views');if(await p.getAttribute('open')===null)await p.locator(':scope>summary').click();return p;}
try{
 const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.route('**/api/grc',route=>route.request().method()==='GET'?route.fulfill({json:{rows:fixtures,nextCursor:null}}):route.continue());
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
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
 for(const locale of ['EN','TR']){await page.locator('.language-switch:visible').getByRole('button',{name:locale,exact:true}).click();await expect(page.getByRole('combobox',{name:locale==='TR'?'Sırala':'Sort by',exact:true})).toHaveValue('inherentRisk');for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const controls=page.locator('.register-sort-controls');await controls.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);assert.ok(await controls.evaluate(el=>el.scrollWidth-el.clientWidth)<=1);assert.deepEqual((await new AxeBuilder({page}).include('.register-sort-controls').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);await page.screenshot({path:`${out}/${locale}-${theme}-${width}.png`,animations:'disabled'});}}}
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
