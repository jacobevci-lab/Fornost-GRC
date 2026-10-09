import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {qaPassword} from './qa-credentials.mjs';
// Isolated CI only. Inject read-only source scenarios; never mutate live records.
const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 assert.equal((await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}})).status(),200);
 const records=await (await context.request.get(`${base}/api/grc`)).json();
 const control=records.rows.find(row=>row.module==='Kontroller');assert.ok(control);
 let unavailable=false;
 await page.route('**/api/evidence-automation',async route=>{
  if(route.request().method()!=='GET')return route.continue();
  if(unavailable)return route.fulfill({status:503,json:{error:'QA source unavailable'}});
  return route.fulfill({json:{sources:[],runs:[],rules:[
   {id:'QA-CHAIN-HEALTHY',name:'QA Healthy With Outstanding Work',controlRefs:control.code||control.id,health:'healthy',freshness:'fresh'},
   {id:'QA-CHAIN-ORPHAN',name:'QA Missing Library Control',controlRefs:'QA-NONEXISTENT-CONTROL',health:'healthy',freshness:'fresh'},
  ],findings:[{id:'QA-CHAIN-FINDING',ruleId:'QA-CHAIN-HEALTHY',title:'Unresolved remediation',status:'open',severity:'high',dueDate:'2000-01-01'}]}});
 });
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible({timeout:30000});
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(node=>node.click());
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','11',{timeout:30000});
 await page.locator('.cg-tabs').getByRole('button',{name:'Assurance',exact:true}).click();
 const review=page.locator('.cg-chain-review');await expect(review).toBeVisible();await review.locator('summary').click();
 await expect(review.locator('article')).toHaveCount(2);
 await expect(review).toContainText('Control healthy; open findings still need follow-up');
 await expect(review).toContainText('Control library link missing');
 await expect(review).toContainText('Open remediation has no risk link');
 await expect(review).toContainText('Remediation is overdue');
 await expect(review.getByRole('button',{name:'Review control'})).toHaveCount(2);
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4,'No horizontal overflow');
 }
 await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();
 await expect(review).toContainText('Kontrol kütüphanesi bağlantısı eksik');
 unavailable=true;await page.locator('.cg-source-controls button').click();
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-loading','false');
 await expect(review).toHaveCount(0);await expect(page.locator('.cg-assessment-pending')).toBeVisible();
 unavailable=false;await page.locator('.cg-source-controls button').click();await expect(review).toBeVisible({timeout:30000});
 assert.deepEqual(errors,[]);console.log('ASSURANCE_CHAIN_REVIEW_QA_PASS: healthy open work, orphan control, risk gap, overdue work, TR/EN, both themes/mobile and source recovery');
}finally{await browser.close();}
