import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,waitForQaIdle} from './qa-browser-harness.mjs';
const base='http://127.0.0.1:4173',out='incident-my-work-qa-artifacts',f=JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const [admin,commander,reviewer,viewer,scoped,anonymous]=await Promise.all(Array.from({length:6},()=>createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}})));
const page=await admin.newPage(),commandPage=await commander.newPage(),reviewPage=await reviewer.newPage(),reader=await viewer.newPage();
const owner='qa-admin@fornost.test',tag=Date.now(),commanderEmail=`qa-inbox-commander-${tag}@fornost.test`,name=`QA incident inbox ${tag}`,checks=[],errors=[];
let phase='setup',incidentId,failedMode='';
for(const p of [page,commandPage,reviewPage,reader]){p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));}
const phrases={triage:'OLAY TRİAJINI BAŞLAT',contain:'OLAYI KONTROL ALTINA AL',eradicate:'TEHDİDİ ORTADAN KALDIR',recover:'HİZMETİ GERİ YÜKLE',review:'OLAYI İNCELEMEYE GÖNDER',close:'OLAYI KAPAT',reopen:'OLAYI YENİDEN AÇ'};
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json();}
async function work(p,filter='All',module=true){
 if(!(await p.locator('.shell').count()))await p.goto(base);
 await expect(p.locator('.shell')).toBeVisible();await p.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await p.locator('nav button[aria-label="My Work"]').evaluate(el=>el.click());await expect(p.locator('.my-work-v2')).toBeVisible();await waitForQaIdle(p);
 await p.locator('.my-work-v2').getByRole('button',{name:'Refresh',exact:true}).click();await waitForQaIdle(p);
 await p.getByLabel('Work queue module',{exact:true}).selectOption(module?'Güvenlik Olayları':'');
 await p.locator('.mw2-filters').getByRole('button',{name:new RegExp('^'+filter)}).click();await p.getByRole('textbox',{name:'Search work',exact:true}).fill(name);
}
async function openIncident(p){await expect(p.locator('.mw2-item')).toHaveCount(1);await p.locator('.mw2-item').focus();await p.keyboard.press('Enter');await expect(p.getByRole('dialog',{name,exact:true})).toBeVisible();await expect(p.locator('.incident-table-wrap tbody tr')).toHaveCount(1);await expect(p.locator('.incident-page .enterprise-work-focus')).toContainText(incidentId);}
async function decision(p,operation){
 await p.locator('.incident-detail>footer button').click();const d=p.locator('.incident-decision');await d.getByLabel('Note',{exact:true}).fill('The assigned team reviewed the current incident and response evidence.');
 if(!['triage','reopen'].includes(operation)){await expect(d.getByLabel('Evidence record',{exact:true})).toBeEnabled();await d.getByLabel('Evidence record',{exact:true}).selectOption(f.evidenceId);const version=d.getByLabel('File version',{exact:true});await expect(version).toBeEnabled();await expect(version.locator(`option[value="${f.version1Id}"]`)).toHaveCount(1);await version.selectOption(f.version1Id);}
 if(operation==='review'){await d.getByLabel('Root cause',{exact:true}).fill('A synthetic privileged identity control was not enforced.');await d.getByLabel('Lessons learned',{exact:true}).fill('Independently verify response controls and recovery evidence.');}
 if(['review','close'].includes(operation)){await d.getByLabel('Notification decision',{exact:true}).selectOption('not-required');await d.getByLabel('Notification rationale',{exact:true}).fill('This synthetic exercise has no actual external notification requirement.');}
 await d.getByLabel('Confirmation phrase',{exact:true}).fill(phrases[operation]);const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/incidents'&&r.request().method()==='POST');await d.getByRole('button',{name:'Apply action',exact:true}).click();const r=await pending;assert.equal(r.status(),200,await r.text());await expect(d).toHaveCount(0);await waitForQaIdle(p);
}
async function leaveDetail(p){await p.keyboard.press('Escape');await expect(p.locator('.incident-detail')).toHaveCount(0);}
try{
 await mkdir(out,{recursive:true});for(const [ctx,email] of [[admin,owner],[reviewer,f.reviewerEmail],[viewer,f.viewerEmail],[scoped,f.scopedEmail]])await api(ctx,'/api/auth','POST',{action:'login',email,password:qaPassword()});
 await api(admin,'/api/users','POST',{name:'QA Inbox Commander',email:commanderEmail,role:'Editor',password:qaPassword(),moduleAccess:{mode:'full'}},201);await api(commander,'/api/auth','POST',{action:'login',email:commanderEmail,password:qaPassword()});
 await api(anonymous,'/api/incidents?view=work','GET',undefined,401);await api(scoped,'/api/incidents?view=work','GET',undefined,403);
 const read=await api(viewer,'/api/incidents?view=work');assert.equal(read.complete,true);assert.doesNotMatch(JSON.stringify(read),/"(?:evidence|events|description|rootCause|businessImpact|notificationRationale)"/);await api(viewer,'/api/incidents','POST',{action:'transition'},403);
 const asset=(await api(admin,'/api/grc')).rows.find(r=>r.module==='Varlık Envanteri');assert.ok(asset);
 incidentId=(await api(admin,'/api/incidents','POST',{action:'create',assignmentMode:'directory',title:name,category:'account-compromise',severity:'high',detectedDate:new Date().toISOString().slice(0,10),description:'A synthetic identity incident exercises the personal work queue.',businessImpact:'A synthetic service requires controlled response and independent closure.',owner,commander:commanderEmail,reviewer:f.reviewerEmail,assetRefs:asset.id,dataClassification:'Internal',personalData:false},201)).id;
 checks.push('Real anonymous/scoped denial, full-access metadata-only Viewer read and denied mutation');
 phase='response assignments and exact keyboard navigation';
 await work(page,'Priority');await expect(page.locator('.mw2-item')).toContainText('Incident triage needed');await expect(page.locator('.mw2-item time')).toHaveText('No due date');
 await work(commandPage);await expect(commandPage.locator('.mw2-item')).toHaveCount(1);await work(reviewPage,'All',false);await expect(reviewPage.locator('.mw2-item')).toHaveCount(0);
 await openIncident(page);await decision(page,'triage');await leaveDetail(page);await work(commandPage);await openIncident(commandPage);for(const op of ['contain','eradicate','recover','review'])await decision(commandPage,op);await leaveDetail(commandPage);
 await work(page,'Waiting for others');await expect(page.locator('.mw2-item')).toHaveCount(1);await work(commandPage,'Waiting for others');await expect(commandPage.locator('.mw2-item')).toHaveCount(1);
 await work(reviewPage);await expect(reviewPage.locator('.mw2-item')).toContainText('Awaiting independent incident closure');await reviewPage.locator('.mw2-filters').getByRole('button',{name:/^Waiting for others/}).click();await expect(reviewPage.locator('.mw2-item')).toHaveCount(0);
 await work(reviewPage);await openIncident(reviewPage);await decision(reviewPage,'close');await leaveDetail(reviewPage);
 await work(page);await expect(page.locator('.mw2-item')).toHaveCount(0);await work(page,'Completed');await expect(page.locator('.mw2-item')).toContainText('Closed');await expect(page.locator('.mw2-item time')).not.toHaveText('No due date');
 await work(reviewPage,'Completed');await openIncident(reviewPage);await decision(reviewPage,'reopen');await leaveDetail(reviewPage);
 await work(page);await expect(page.locator('.mw2-item')).toContainText('Incident containment needed');await page.locator('.mw2-filters').getByRole('button',{name:/^Completed/}).click();await expect(page.locator('.mw2-item')).toHaveCount(0);
 await work(reviewPage);await expect(reviewPage.locator('.mw2-item')).toHaveCount(0);await work(page);
 checks.push('Actual owner/commander response, reviewer handoff, waiting states, independent close and reasoned reopen; exact keyboard navigation and real completion');
 phase='source failures, bounded coverage and exact CSV';
 await page.route(url=>url.pathname==='/api/incidents'&&url.searchParams.get('view')==='work',async route=>{if(['403','503'].includes(failedMode))return route.fulfill({status:Number(failedMode),json:{}});if(failedMode==='malformed')return route.fulfill({status:200,json:{}});const response=await route.fetch(),body=await response.json();return route.fulfill({response,json:failedMode==='bounded'?{...body,complete:false}:body});});
 const refresh=page.locator('.my-work-v2').getByRole('button',{name:'Refresh',exact:true}),download=page.getByRole('button',{name:'Download list (CSV)',exact:true});
 for(const mode of ['503','403','malformed','bounded']){failedMode=mode;await refresh.click();await expect(page.locator('.mw2-load-error')).toBeVisible();await expect(download).toBeDisabled();if(mode!=='bounded')await expect(page.locator('.mw2-item')).toHaveCount(0);failedMode='';await refresh.click();await expect(page.locator('.mw2-load-error')).toHaveCount(0);await expect(download).toBeEnabled();await expect(page.locator('.mw2-item')).toHaveCount(1);}
 const pending=page.waitForEvent('download');await download.click();const csv=await readFile(await(await pending).path(),'utf8');assert.ok(csv.includes(name));assert.ok(csv.includes('Güvenlik Olayları'));assert.ok(!csv.includes('description'));
 checks.push('Failed/denied/malformed/bounded reads disable CSV and discard stale source rows; refresh restores exact module-scoped export');
 phase='twelve accessible localized inbox views';
 for(const lang of ['EN','TR'])for(const theme of ['light','dark'])for(const width of [1440,1024,390]){await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').evaluate(el=>el.click());await page.setViewportSize({width,height:1000});await waitForQaIdle(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await expect(page.locator('.mw2-item .mw2-state')).toBeVisible();await expect(page.locator('.mw2-item')).toContainText(lang==='EN'?'Triage':'Ön inceleme');assert.deepEqual((await new AxeBuilder({page}).include('.my-work-v2').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);await page.locator('.my-work-v2').screenshot({path:`${out}/${lang}-${theme}-${width}.png`});}
 await reader.goto(base);await expect(reader.locator('.shell')).toBeVisible();await reader.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await reader.locator('nav button[aria-label="Security Incidents & Crisis"]').evaluate(el=>el.click());await reader.getByLabel('Status filter',{exact:true}).selectOption('all');await reader.getByLabel('Search incidents',{exact:true}).fill(name);await reader.locator('.incident-row-open').filter({hasText:name}).click();await expect(reader.getByRole('dialog',{name,exact:true})).toBeVisible();await expect(reader.locator('.incident-detail>footer button')).toHaveCount(0);
 checks.push('TR/EN × light/dark × desktop/tablet/mobile inbox without Axe/overflow findings, readable status and read-only exact Viewer navigation');
 phase='owned fixture closure';await work(commandPage);await openIncident(commandPage);for(const op of ['contain','eradicate','recover','review'])await decision(commandPage,op);await leaveDetail(commandPage);await work(reviewPage);await openIncident(reviewPage);await decision(reviewPage,'close');
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',checks,errors,incidentId,cleanup:'Owned incident closed; immutable history and synthetic users remain only in disposable loopback.'},null,2));console.log('INCIDENT_MY_WORK_QA_PASS');
}catch(error){await writeFile(`${out}/failure.json`,JSON.stringify({phase,message:error.message,stack:error.stack,incidentId,checks},null,2));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
