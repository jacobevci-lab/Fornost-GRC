import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const rows=Array.from({length:121},(_,i)=>({id:`REPORT-${i}`,record_code:`REP-${i}`,module:'BIA',data_json:JSON.stringify({process:`Ödeme Süreci ${i}`,owner:i===120?'Excluded':'Çağrı',businessUnit:'Finans',status:'Aktif',description:`DETAIL-${i}`}),created_at:'2026-10-06T12:00:00Z',updated_at:'2026-10-06T12:00:00Z'}));
await page.route('**/api/grc',route=>route.fulfill({json:{rows,nextCursor:null}}));
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 const group=page.locator('nav button[aria-controls="nav-group-intelligence"]');if(await group.getAttribute('aria-expanded')!=='true')await group.click();
 await page.locator('nav button[aria-label="Reporting"]').click();
 const panel=page.locator('.report-workspace');await expect(panel).toBeVisible();
 await expect(panel.locator('.report-secondary[open]')).toHaveCount(0);
 await panel.getByLabel('Report module',{exact:true}).selectOption('BIA');
 await expect(panel.getByRole('button',{name:'PDF Report',exact:true})).toBeVisible();
 const headerBox=await panel.boundingBox(),tableBox=await panel.locator('.table-card').boundingBox();assert.ok(tableBox.y-headerBox.y<700,'Register must be close to the scope controls');
 await mkdir('layout-qa-artifacts',{recursive:true});
 await panel.screenshot({path:'layout-qa-artifacts/reporting-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Page must not overflow horizontally');
 await panel.screenshot({path:'layout-qa-artifacts/reporting-mobile.png'});
 await page.setViewportSize({width:1536,height:960});
 await expect(panel.locator('tbody tr')).toHaveCount(50);
 await panel.getByRole('button',{name:'Next',exact:true}).click();await panel.getByRole('button',{name:'Next',exact:true}).click();await expect(panel.locator('tbody tr')).toHaveCount(21);
 await panel.locator('.report-filters select').nth(1).selectOption('Çağrı');await expect(panel.locator('.report-pagination')).toContainText('Page 1/3');
 await panel.getByLabel('Template',{exact:true}).selectOption('detailed');await panel.getByLabel('Classification',{exact:true}).selectOption('confidential');
 await panel.locator('.workspace-export summary').click();
 for(const label of ['HTML','CSV','PDF Report']){
  const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:label,exact:true}).click();const download=await downloaded;assert.equal(await download.failure(),null);
  const bytes=await readFile(await download.path());
  if(label==='PDF Report'){const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>3);assert.match(pdf.getSubject(),/Confidential/);}
  else{const text=bytes.toString('utf8');assert.match(text,/DETAIL-119/);assert.doesNotMatch(text,/DETAIL-120/);assert.match(text,/Confidential/);assert.match(text,/Çağrı/);if(label==='CSV')assert.equal(text.split('\r\n').length,121);}
 }
 await page.route('**/fonts/FornostReportSans.ttf',route=>route.fulfill({status:503,body:'Unavailable'}));
 await panel.getByRole('button',{name:'PDF Report',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('PDF could not be generated');await expect(panel.getByRole('button',{name:'PDF Report',exact:true})).toBeEnabled();
 console.log('Reporting QA passed: complete pagination, filter reset, detailed HTML/CSV/PDF downloads, Turkish data, classification and font-failure recovery.');
}finally{await browser.close();}
