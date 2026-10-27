import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,waitForQaIdle} from './qa-browser-harness.mjs';

// The preceding selection journey owns these synthetic records in the same disposable loopback app.
const base='http://127.0.0.1:4173',out='workflow-evidence-usage-qa-artifacts';
const f=JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const contexts=await Promise.all(Array.from({length:4},()=>createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}})));
const [admin,reviewer,viewer,scoped]=contexts,page=await viewer.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));let usageReads=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/evidence/usage')usageReads++});page.setDefaultTimeout(20000);let phase='setup';
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json()}
const usage=()=>api(viewer,`/api/evidence/usage?id=${f.evidenceId}`);
const decisions=result=>result.rows.filter(row=>row.decision);
async function openUsage(){
 await page.goto(base+'/#fornost-record?'+new URLSearchParams({module:'Kanıtlar',kind:'record',ref:f.evidenceId}));
 await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('.eu-panel>summary').click();await page.getByLabel('Evidence to inspect',{exact:true}).selectOption(f.evidenceId);
 await expect(page.locator('.eu-summary')).toContainText('v3');await waitForQaIdle(page);
}
async function focus(kind,ref){await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('fornost:focus',{detail})),{module:'İş Sürekliliği',kind,ref,source:'evidence-usage'})}
try {
 await mkdir(out,{recursive:true});
 for(const [ctx,email] of [[admin,'qa-admin@fornost.test'],[reviewer,f.reviewerEmail],[viewer,f.viewerEmail],[scoped,f.scopedEmail]])await api(ctx,'/api/auth','POST',{action:'login',email,password:qaPassword()});
 // Initialize the optional TPRM source in this disposable fixture before asserting complete coverage.
 await api(admin,'/api/third-party-risk');
 let snapshot=await usage();assert.equal(decisions(snapshot).length,5);assert.ok(snapshot.sources.filter(s=>['continuity','regulatory'].includes(s.key)).every(s=>s.state==='complete'));
 const original=decisions(snapshot).map(({id,decision,pins})=>({id,decision,version: pins[0].id}));
 phase='new file and retained decisions';
 const upload=await admin.request.post(base+'/api/evidence/history',{headers:{origin:base},multipart:{evidenceId:f.evidenceId,changeNote:'New period while retaining recorded decisions',file:{name:'recovery-v3.txt',mimeType:'text/plain',buffer:Buffer.from('New synthetic recovery period')}}});assert.equal(upload.status(),201,await upload.text());
 const version3=(await api(admin,`/api/evidence/history?id=${f.evidenceId}`)).versions.find(v=>v.versionNo===3);
 snapshot=await usage();assert.deepEqual(decisions(snapshot).map(({id,decision,pins})=>({id,decision,version:pins[0].id})),original);assert.ok(decisions(snapshot).every(row=>row.historical&&row.pins[0].state==='older'));
 for(const [action,operation,confirmation,ctx,extra] of [
  ['change-action','reopen','DEĞİŞİKLİĞİ YENİDEN AÇ',reviewer,{}],
  ['impact-action','reopen','ETKİYİ YENİDEN AÇ',reviewer,{}],
  ['impact-action','submit','DOĞRULAMAYA GÖNDER',admin,{evidenceMode:'library',evidenceSelection:{evidenceId:f.evidenceId,versionId:version3.id}}],
  ['impact-action','verify','ETKİYİ DOĞRULA',reviewer,{evidenceMode:'library',evidenceSelection:{evidenceId:f.evidenceId,versionId:version3.id}}],
  ['change-action','close','DEĞİŞİKLİĞİ KAPAT',reviewer,{}],
 ])await api(ctx,'/api/regulatory-intelligence','POST',{action,operation,confirmation,changeId:f.changeId,impactId:f.impactId,note:'Review the new period while preserving all prior decision evidence.',...extra});
 snapshot=await usage();assert.equal(decisions(snapshot).length,7);assert.equal(decisions(snapshot).filter(row=>row.pins[0].state==='current').length,2);assert.ok(decisions(snapshot).every(row=>row.historical));
 checks.push('All five original decisions survive a new upload; resubmission/verification add two separate immutable uses');
 phase='usage UI and report';await openUsage();const panel=page.locator('.eu-panel');
 await expect(panel.locator('.eu-coverage>summary')).toContainText('8/8 complete');await expect(panel.locator('.eu-sources')).toBeHidden();
 const readsBeforeToggle=usageReads;await panel.locator('.eu-coverage>summary').focus();await page.keyboard.press('Enter');await waitForQaIdle(page);await expect(panel.locator('.eu-sources')).toBeVisible();assert.equal(usageReads,readsBeforeToggle,'Opening source coverage must not reload its parent panel');await panel.screenshot({path:`${out}/usage-coverage-expanded.png`});await page.keyboard.press('Enter');await waitForQaIdle(page);await expect(panel.locator('.eu-sources')).toBeHidden();assert.equal(usageReads,readsBeforeToggle,'Closing source coverage must not reload its parent panel');
 await panel.getByLabel('Usage source',{exact:true}).selectOption('continuity');await expect(panel.locator('.eu-list article')).toHaveCount(3);
 await panel.getByLabel('Usage source',{exact:true}).selectOption('regulatory');await expect(panel.locator('.eu-list article')).toHaveCount(4);
 await expect(panel.locator('.eu-list')).toContainText('Decision by:');await expect(panel.locator('.eu-list')).toContainText('Submitted for verification');await expect(panel.locator('.eu-list')).toContainText('Independent verification');
 await panel.getByLabel('Usage source',{exact:true}).selectOption('all');await panel.getByLabel('Usage filter',{exact:true}).selectOption('historical');await expect(panel.locator('.eu-list article')).toHaveCount(7);
 const pendingDownload=page.waitForEvent('download');await panel.getByRole('button',{name:'Download usage report',exact:true}).click();
 const report=JSON.parse(await readFile(await(await pendingDownload).path(),'utf8'));assert.equal(report.sources.length,8);assert.equal(decisions(report).length,7);assert.ok(!/fileKey|contentSha256|snapshot_json/.test(JSON.stringify(report)));
 for(const lang of ['EN','TR']) {
  await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
  for(const theme of ['light','dark']) {
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').evaluate(e=>e.click());
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});await waitForQaIdle(page);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    assert.deepEqual((await new AxeBuilder({page}).include('.eu-panel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);
    await panel.screenshot({path:`${out}/usage-${lang}-${theme}-${width}.png`});
   }
  }
 }
 checks.push('Source/history filters, decision identity/time, sanitized complete report, TR/EN light/dark desktop/mobile and accessibility');
 await page.setViewportSize({width:1440,height:1000});
 phase='exact source navigation and recovery';
 for(const [kind,ref,heading,table] of [['continuity-exercise',f.exerciseId,'Business Continuity & Resilience','.continuity-table'],['continuity-gap',f.gapId,'Business Continuity & Resilience','.continuity-table'],['regulatory-impact',f.impactId,'Regulatory Change Center','.ri-table']]) {
  await openUsage();const row=panel.locator('.eu-list article').filter({hasText:ref}).first();
  const response=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('focusId='+ref));
  await row.getByRole('button',{name:/^Open record:/}).click();assert.equal((await response).status(),200);
  await expect(page.locator('main>header h1')).toHaveText(heading);await expect(page.locator('.enterprise-work-focus')).toContainText(ref);
  await expect(page.locator(`${table} tbody tr`)).toHaveCount(1);await waitForQaIdle(page);
  if(kind==='continuity-gap')await expect(page.locator(`${table} tbody`)).toContainText('Closed');
 }
 await openUsage();let fail=true;
 await page.route('**/api/continuity?*',route=>fail?route.fulfill({status:503,json:{error:'Synthetic read failure'}}):route.continue());
 await panel.locator('.eu-list article').filter({hasText:f.gapId}).getByRole('button',{name:/^Open record:/}).click();
 await expect(page.locator('.continuity-page [role=alert]')).toContainText('Records could not be loaded');fail=false;
 await page.locator('.continuity-page').getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.continuity-table tbody tr')).toHaveCount(1);await waitForQaIdle(page);await page.unroute('**/api/continuity?*');
 await focus('continuity-gap','BCG-missing');await expect(page.locator('.enterprise-work-focus')).toContainText('Record unavailable or inaccessible');await expect(page.locator('.continuity-table tbody tr')).toHaveCount(0);
 phase='late focus response';let release,finished,held=false;
 const barrier=new Promise(resolve=>{release=resolve}),settled=new Promise(resolve=>{finished=resolve});
 await page.route('**/api/continuity?*',async route=>{
  if(!route.request().url().includes('focusId='+f.exerciseId)){await route.continue();return}
  const response=await route.fetch();held=true;await barrier;try{await route.fulfill({response})}catch{/* navigation cancels the obsolete read */}finally{finished()}
 });
 await focus('continuity-exercise',f.exerciseId);await expect.poll(()=>held).toBe(true);await focus('continuity-gap',f.gapId);
 await expect(page.locator('.continuity-table tbody tr')).toHaveCount(1);release();await settled;
 await expect(page.locator('.enterprise-work-focus')).toContainText(f.gapId);await expect(page.locator('.continuity-table tbody')).toContainText('Closed');await page.unroute('**/api/continuity?*');
 checks.push('Exact exercise/gap/impact navigation, focused read failure/retry, missing target and superseded response protection');
 phase='usage recovery and scope';await openUsage();let usageFails=true;
 await page.route('**/api/evidence/usage?*',route=>usageFails?route.fulfill({status:503,json:{error:'unavailable'}}):route.continue());
 await panel.getByRole('button',{name:'Refresh usage',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Unable to load usage');await expect(panel.getByRole('button',{name:'Download usage report',exact:true})).toBeDisabled();
 usageFails=false;await panel.getByRole('button',{name:'Refresh usage',exact:true}).click();await expect(panel.locator('.eu-summary')).toContainText('v3');await page.unroute('**/api/evidence/usage?*');
 const limited=await api(scoped,`/api/evidence/usage?id=${f.evidenceId}`);assert.ok(limited.sources.filter(s=>['continuity','regulatory'].includes(s.key)).every(s=>s.state==='restricted'));assert.equal(decisions(limited).length,0);
 await api(scoped,`/api/continuity?focusKind=continuity-gap&focusId=${f.gapId}`,'GET',undefined,403);await api(scoped,`/api/regulatory-intelligence?focusKind=regulatory-impact&focusId=${f.impactId}`,'GET',undefined,403);
 const scopedPage=await scoped.newPage();await scopedPage.goto(base+'/#fornost-record?'+new URLSearchParams({module:'Kanıtlar',kind:'record',ref:f.evidenceId}));await expect(scopedPage.locator('.shell')).toBeVisible();await scopedPage.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await scopedPage.locator('.eu-panel>summary').click();await expect(scopedPage.locator('.eu-panel .eu-warning').filter({hasText:'restricted access'})).toBeVisible();await expect(scopedPage.locator('.eu-coverage .eu-sources')).toBeHidden();await scopedPage.close();
 checks.push('Usage retry disables stale export; scoped accounts receive neither workflow decisions nor direct focused records');
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks,errors,cleanup:'All mutations target the disposable CI database; no remote URL is configurable.'},null,2));console.log('WORKFLOW_EVIDENCE_USAGE_QA_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});await writeFile(`${out}/failure.json`,JSON.stringify({phase,error:String(error),checks,errors},null,2));throw error}
finally{await Promise.all(contexts.map(c=>c.close()));await browser.close()}
