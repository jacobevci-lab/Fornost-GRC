import { qaPassword } from "./qa-credentials.mjs";
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Isolated UI/API contract QA only; vendor behaviour and real persistence are tested in product-control-templates.test.ts.
const base='http://127.0.0.1:4173',out='ready-controls-qa-artifacts',password=qaPassword();
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,await r.text());return r.json();}
const path='/api/evidence-automation',guid='11111111-1111-4111-8111-111111111111';
try{
 await api(context,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password});
 const source=await api(context,path,'POST',{action:'save-source',name:'QA Ready Intune',vendor:'Microsoft Intune',category:'Cloud & SaaS',providerId:'intune',dataset:'managed-devices',providerConfig:{tenantId:guid,clientId:guid},credentials:{clientSecret:crypto.randomUUID()}});
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Evidence Automation"]').evaluate(el=>el.click());
 await page.locator('.ea-tabs').getByRole('button',{name:'Continuous Controls',exact:true}).click();
 await page.locator('.ea-section-action').getByRole('button',{name:'+ Ready Control',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Enable ready control',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByLabel('Ready control source',{exact:true}).selectOption(source.sourceId);
 await expect(dialog.getByLabel('Ready test',{exact:true})).toHaveValue('intune-compliance');await expect(dialog.getByText('JSON path',{exact:true})).toHaveCount(0);
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('fornost-theme',theme)},theme);
  for(const width of [1536,390]){await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/ready-form-${theme}-${width}.png`});}
 }
 await page.setViewportSize({width:1536,height:960});
 const saved=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Enable Ready Control',exact:true}).click();assert.equal((await saved).status(),200);await expect(dialog).toBeHidden();
 const data=await api(context,path),rule=data.rules.find(x=>x.sourceId===source.sourceId);assert.equal(rule.templateId,'intune-compliance');assert.equal(rule.templateVersion,1);assert.equal(rule.operator,'template');assert.equal(rule.freshnessHours,48);
 await api(context,path,'POST',{action:'save-template-rule',sourceId:source.sourceId,templateId:'intune-compliance',controlRefs:'A.8.1'},409);
 await api(context,path,'POST',{action:'save-template-rule',sourceId:source.sourceId,templateId:'mde-sensor-health',controlRefs:'A.8.7'},400);
 await api(context,path,'POST',{action:'save-template-rule',sourceId:source.sourceId,templateId:'arbitrary-code',controlRefs:'A.8.1'},400);
 const second=await api(context,path,'POST',{action:'save-template-rule',sourceId:source.sourceId,templateId:'intune-encryption',controlRefs:'A.8.24',operator:'exists',jsonPath:'fornostCollection',templateVersion:999,autoFinding:false});
 const persisted=(await api(context,path)).rules.find(x=>x.id===second.ruleId);assert.equal(persisted.templateVersion,1);assert.equal(persisted.operator,'template');assert.equal(persisted.autoFinding,false);
 for(const role of ['Editor','Viewer']){
  const email=`qa-ready-${role.toLowerCase()}@fornost.test`;await api(context,'/api/users','POST',{name:`Ready QA ${role}`,email,password,role},201);
  const restricted=await browser.newContext();await api(restricted,'/api/auth','POST',{action:'login',email,password});await api(restricted,path,'POST',{action:'save-template-rule',sourceId:source.sourceId,templateId:'intune-encryption',controlRefs:'A.8.24'},403);
  if(role==='Viewer')await api(restricted,path,'POST',{action:'run-rule',ruleId:rule.id},403);await restricted.close();
 }
 await api(context,`${path}?runId=not-found`,'GET',undefined,404);
 // Explicit display fixture: no fake result is written into the application database.
 const run={id:'qa-template-fixture',ruleId:rule.id,ruleName:'Intune device compliance',sourceName:'QA Ready Intune',status:'fail',score:50,detail:'1/2 passed',createdAt:new Date().toISOString(),hasAssessment:true};
 const assessment={templateId:'intune-compliance',templateVersion:1,status:'fail',total:2,passed:1,failed:1,unknown:0,scope:'credential-visible',issues:[{id:'device-2',name:'QA Device 2',status:'fail',reason:'not-compliant'}],issuesTruncated:false};
 await page.route('**/api/evidence-automation',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),body=await response.json();body.runs=[run,...body.runs];await route.fulfill({response,json:body});});
 await page.route('**/api/evidence-automation?runId=qa-template-fixture',route=>route.fulfill({json:{run:{...run,assessment}}}));
 await page.reload();await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Evidence Automation"]').evaluate(el=>el.click());
 await page.locator('.ea-tabs').getByRole('button',{name:'Run History',exact:true}).click();await page.locator('.ea-table tr').filter({hasText:'QA Ready Intune'}).first().getByRole('button',{name:'View Results',exact:true}).click();
 const detail=page.getByRole('dialog',{name:'Control results',exact:true});await expect(detail).toContainText('QA Device 2');await expect(detail).toContainText('noncompliant or in a grace period');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);
  for(const width of [1536,390]){await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/ready-result-${theme}-${width}.png`});}
 }
 assert.deepEqual(errors,[]);console.log('READY_CONTROLS_QA_PASS: real save/readback, canonical config, duplicate/mismatch rejection, roles, desktop/mobile forms and result rendering in both themes');
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
