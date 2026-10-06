import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}});
const page=await context.newPage();page.setDefaultTimeout(20000);
let unavailable=true,writes=0,uncertain=false;
const findings=Array.from({length:65},(_,i)=>({id:`QA-F-${i+1}`,code:`FND-QA-${i+1}`,sourceType:'audit',sourceRef:`AUD-QA-${i+1}`,sourceTitle:'QA audit',findingType:'nonconformity',title:`QA finding ${i+1}`,description:'QA finding description',severity:'high',owner:'qa-admin@fornost.test',reviewer:'reviewer@fornost.test',rootCause:'QA root cause',correctiveAction:'QA corrective action',preventiveAction:'QA preventive action',dueDate:'2026-12-01',status:'open',recurrenceCount:0,attention:'priority',updatedAt:'2026-10-06T09:00:00Z'}));
await page.route('**/api/findings',async route=>{
 if(route.request().method()==='POST'){
  writes++;assert.equal(route.request().postDataJSON().action,'create');
  await new Promise(resolve=>setTimeout(resolve,300));
  return route.fulfill({status:uncertain?503:200,json:uncertain?{error:'fixture outage'}:{message:'Created'}});
 }
 if(unavailable)return route.fulfill({status:503,json:{error:'fixture outage'}});
 return route.fulfill({json:{findings,events:[],sourceSignals:[{source:'continuous-control',count:0,available:false}],summary:{total:65,open:65,critical:0,overdue:0,verification:0,accepted:0,closed:0,recurring:0}}});
});
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 const group=page.locator('nav button[aria-controls="nav-group-assurance"]');
 if(await group.getAttribute('aria-expanded')!=='true')await group.click();
 const nav=page.locator('nav button[aria-label="Findings & CAPA"]');await nav.scrollIntoViewIfNeeded();await nav.click();
 const panel=page.locator('.finding-page');
 await expect(panel.getByRole('alert')).toContainText('could not be loaded');
 await expect(panel.locator('.finding-kpis strong').first()).toHaveText('—');
 await expect(panel.getByRole('button',{name:'+ New Finding',exact:true})).toBeDisabled();
 await expect(panel.locator('.finding-empty')).toHaveCount(0);
 unavailable=false;await panel.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(panel.locator('.finding-table tbody tr')).toHaveCount(20);
 await expect(panel.locator('.finding-source-strip')).toContainText('Unavailable');
 for(let i=0;i<3;i++)await panel.getByRole('button',{name:'Next',exact:true}).click();
 await expect(panel.locator('.finding-table tbody tr')).toHaveCount(5);
 await expect(panel.locator('.finding-pagination')).toContainText('61–65 / 65');
 await panel.getByRole('textbox',{name:'Search findings',exact:true}).fill('AUD-QA-65');
 await expect(panel.locator('.finding-table tbody tr')).toHaveCount(1);
 const open=panel.getByRole('button',{name:'QA finding 65',exact:true});await open.focus();await page.keyboard.press('Enter');
 await expect(panel.getByRole('dialog')).toBeVisible();await panel.getByRole('button',{name:'Close',exact:true}).click();
 await panel.getByRole('button',{name:'+ New Finding',exact:true}).click();
 const form=panel.locator('form.finding-form');
 await form.dispatchEvent('submit');await form.dispatchEvent('submit');
 await expect(form).toHaveCount(0);assert.equal(writes,1);
 uncertain=true;await panel.getByRole('button',{name:'+ New Finding',exact:true}).click();await form.dispatchEvent('submit');
 await expect(form).toHaveCount(0);await expect(panel.locator('.finding-notice')).toContainText('could not be confirmed');assert.equal(writes,2);
 console.log('Findings workspace QA passed: outage/retry, honest KPI/source state, 65-record pagination/search, keyboard detail, duplicate-submit guard and ambiguous-write recovery without retry.');
}finally{await browser.close();}
