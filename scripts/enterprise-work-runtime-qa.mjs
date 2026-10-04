import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173', out='enterprise-work-qa-artifacts', owner='qa-admin@fornost.test', date='2026-12-01';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();
page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const stamp=new Date().toISOString();
const document={id:'qa-policy',code:'QA-POL',title:'QA enterprise policy',status:'published',owner,reviewer:'reviewer@fornost.test',category:'security',classification:'internal',audience:'QA',nextReview:date,currentVersionId:'qa-published',updatedAt:stamp,attention:'published'};
const version={id:'qa-version',policyId:document.id,versionNumber:2,status:'approved',effectiveDate:date,controlRefs:[],regulationRefs:[],riskRefs:[],contentSha256:'a'.repeat(64),summary:'QA release',content:'QA content',updatedAt:stamp};
const vendor={vendorId:'qa-vendor',name:'QA enterprise vendor',service:'QA',status:'in-review',riskOwner:owner,businessOwner:owner,reviewer:'reviewer@fornost.test',criticality:'high',nextReview:date,contractEnd:date,attention:'in-review',updatedAt:stamp};
const change={id:'qa-change',title:'QA enterprise regulation',owner,reviewer:'reviewer@fornost.test',status:'impact-assessment',sourceId:'qa-source',sourceName:'QA source',effectiveDate:date,publishedDate:'2026-10-01',severity:'high',applicability:'applicable',attention:'impact-assessment',totalImpacts:1,openImpacts:1,updatedAt:stamp};
const fixtures={
 '/api/policy-lifecycle':{documents:[document],versions:[version],campaigns:[{id:'qa-campaign',policyId:document.id,status:'open',dueDate:date}],attestations:[{id:'qa-attest',policyId:document.id,campaignId:'qa-campaign',policyCode:'QA-POL',policyTitle:document.title,campaignName:'QA campaign',subjectEmail:owner,status:'pending',dueDate:date},{id:'qa-not-mine',policyId:document.id,campaignId:'qa-campaign',policyCode:'QA-OTHER',policyTitle:'QA other assignment',subjectEmail:owner+'.other',status:'pending',dueDate:date}],exceptions:[{id:'qa-exception',policyId:document.id,owner,reviewer:'reviewer@fornost.test',status:'expired',scope:'QA expired exception',expiresAt:'2026-10-01',updatedAt:stamp}]},
 '/api/third-party-risk':{profiles:[vendor],vendors:[vendor],assessments:[{id:'qa-assessment',vendorId:vendor.vendorId,cycleNumber:1,status:'submitted',coverage:50,inherentScore:16,residualScore:12,riskTier:'high',criticalGaps:[],questionnaire:{},updatedAt:stamp}],findings:[{id:'qa-finding',vendorId:vendor.vendorId,assessmentId:'qa-assessment',title:'QA enterprise finding',owner,status:'verification',dueDate:date,severity:'high',updatedAt:stamp}]},
 '/api/regulatory-intelligence':{sources:[],changes:[change],impacts:[{id:'qa-impact',changeId:change.id,targetType:'control',targetRef:'CTL-QA',targetTitle:'QA enterprise impact',requiredAction:'QA enterprise impact',actionOwner:owner,status:'verification',dueDate:date,impactLevel:'high',updatedAt:stamp}],records:[]},
};
let failedPath='',malformedPath='',missingTarget=false;
async function openWork(){await page.locator('nav button[aria-label="My Work"]').evaluate(el=>el.click());await expect(page.locator('.my-work-v2')).toBeVisible();await expect(page.locator('.my-work-v2').getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();await page.locator('.mw2-filters').getByRole('button',{name:/^All/}).click();}
try{
 assert.equal((await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:owner,password:qaPassword()}})).status(),200);
 for(const [path,fixture] of Object.entries(fixtures)){
  const response=await context.request.get(base+path);assert.equal(response.status(),200);const original=await response.json();
  await page.route(`**${path}`,route=>{
   if(failedPath===path)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   if(malformedPath===path)return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   const data={...original,...fixture};if(missingTarget&&path==='/api/policy-lifecycle')data.versions=[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
 }
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 const cases=[['Policy review','qa-policy','.plm-page'],['Version and release','qa-version','.plm-page'],['Policy attestation','qa-attest','.plm-page'],['Policy exception','qa-exception','.plm-page'],['Vendor review','qa-vendor','.tprm-page'],['Vendor assessment','qa-assessment','.tprm-page'],['Vendor finding','qa-finding','.tprm-page'],['Regulatory review','qa-change','.ri-page'],['Regulatory action','qa-impact','.ri-page']];
 for(const [label,id,module] of cases){
  await openWork();await page.getByRole('textbox',{name:'Search work',exact:true}).fill(label);
  await expect(page.locator('.mw2-item')).toHaveCount(1);await page.locator('.mw2-item').click();
  const panel=page.locator(module);await expect(panel.locator('.enterprise-work-focus')).toContainText(id);
  await expect(panel.locator('.table-wrap tbody tr')).toHaveCount(1);
  await expect(panel.locator('.enterprise-work-focus')).not.toContainText('unavailable');
  await panel.getByRole('button',{name:'Show all records',exact:true}).click();await expect(panel.locator('.enterprise-work-focus')).toHaveCount(0);
 }
 await openWork();await page.getByRole('textbox',{name:'Search work',exact:true}).fill('QA other assignment');await expect(page.locator('.mw2-item')).toHaveCount(0);
 await page.locator('.mw2-scope').getByRole('button',{name:'Organization',exact:true}).click();await expect(page.locator('.mw2-item')).toHaveCount(1);
 await page.getByRole('textbox',{name:'Search work',exact:true}).fill('');
 const refresh=page.locator('.my-work-v2').getByRole('button',{name:'Refresh',exact:true}),download=page.getByRole('button',{name:'Download list (CSV)',exact:true});
 for(const path of Object.keys(fixtures)){
  failedPath=path;await refresh.click();await expect(page.locator('.mw2-load-error')).toBeVisible();await expect(download).toBeDisabled();
  failedPath='';await refresh.click();await expect(page.locator('.mw2-load-error')).toHaveCount(0);await expect(download).toBeEnabled();
 }
 malformedPath='/api/policy-lifecycle';await refresh.click();await expect(download).toBeDisabled();malformedPath='';await refresh.click();await expect(download).toBeEnabled();
 for(const lang of ['EN','TR'])for(const theme of ['light','dark'])for(const width of [1536,390]){
  await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await page.setViewportSize({width,height:960});
  assert.ok(await page.locator('.my-work-v2').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/${lang}-${theme}-${width}.png`});
 }
 await page.setViewportSize({width:1536,height:960});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.getByRole('textbox',{name:'Search work',exact:true}).fill('Version and release');await expect(page.locator('.mw2-item')).toHaveCount(1);missingTarget=true;await page.locator('.mw2-item').click();await expect(page.locator('.enterprise-work-focus')).toContainText('Record unavailable or inaccessible');
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',recordTransitions:9,layouts:8,sourceRecovery:3}));
}finally{await browser.close()}
