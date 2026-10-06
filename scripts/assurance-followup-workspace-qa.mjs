import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}});
const page=await context.newPage();page.setDefaultTimeout(20000);
let unavailable=false,writes=0;
const records=Array.from({length:65},(_,i)=>({id:`QA-E-${i+1}`,kind:'risk-review',severity:'high',subjectRef:`RSK-${i+1}`,owner:'QA Owner',title:`QA follow-up ${i+1}`,detail:'A risk review needs follow-up',status:'active',lastSeenAt:'2026-10-06T07:00:00Z',acknowledgedBy:'',ackNote:''}));
await page.route('**/api/continuous-assurance/escalations',async route=>{
 if(route.request().method()==='POST'){
  const body=route.request().postDataJSON();
  assert.equal(body.action,'acknowledge');assert.ok(body.note.length>=10);
  const item=records.find(row=>row.id===body.id);assert.ok(item);
  item.status='acknowledged';item.ackNote=body.note;item.acknowledgedBy='QA Admin';writes++;
  return route.fulfill({json:{ok:true}});
 }
 if(unavailable)return route.fulfill({status:503,json:{error:'fixture outage'}});
 return route.fulfill({json:{records,summary:{active:65-writes,acknowledged:writes,critical:0,high:65,medium:0,resolved30d:0},policy:{reminderDays:15,remindersEnabled:true,signals:65}}});
});
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 const group=page.locator('nav button[aria-controls="nav-group-intelligence"]');
 if(await group.getAttribute('aria-expanded')!=='true')await group.click();
 const nav=page.locator('nav button[aria-label="Connected GRC Map"]');await nav.scrollIntoViewIfNeeded();await nav.click();
 await page.locator('.cg-tabs').getByRole('button',{name:'Assurance',exact:true}).click();
 await page.locator('.cg-operations .module-analysis-disclosure>summary').click();
 const panel=page.locator('.assurance-escalation-center');
 await expect(panel.locator('.aec-list>article')).toHaveCount(20);
 for(let i=0;i<3;i++)await panel.getByRole('button',{name:'Next',exact:true}).click();
 await expect(panel.locator('.aec-list>article')).toHaveCount(5);
 await expect(panel.locator('.aec-pagination')).toContainText('61–65 / 65');
 await panel.getByRole('searchbox').fill('RSK-65');
 await expect(panel.locator('.aec-list>article')).toHaveCount(1);
 await panel.locator('.aec-actions').getByRole('button',{name:'Acknowledge',exact:true}).click();
 const form=panel.locator('form');await expect(form).toBeVisible();
 await form.getByRole('textbox').fill('short');await expect(form.getByRole('button',{name:'Acknowledge',exact:true})).toBeDisabled();
 await form.getByRole('textbox').fill('Follow up with the risk owner this week.');
 await form.getByRole('button',{name:'Acknowledge',exact:true}).click();
 await expect(form).toHaveCount(0);await expect(panel.locator('.aec-list')).toContainText('Follow up with the risk owner this week.');assert.equal(writes,1);
 unavailable=true;await panel.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('Could not load alerts');
 await expect(panel.locator('.aec-metrics b').first()).toHaveText('—');
 unavailable=false;await panel.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(panel.getByRole('alert')).toHaveCount(0);
 await expect(panel.locator('.aec-list>article')).toHaveCount(1);
 console.log('Assurance follow-up workspace QA passed: 65-record pagination, search, inline validation, acknowledgement and source recovery.');
}finally{await browser.close();}
