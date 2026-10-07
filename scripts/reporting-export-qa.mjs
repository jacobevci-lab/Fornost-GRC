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
 const viewer=await browser.newContext();
 try {
  assert.equal((await viewer.request.get(`${base}/api/findings?format=report`)).status(),401);
  const email=`qa-report-${Date.now()}@fornost.test`;
  const created=await context.request.post(`${base}/api/users`,{headers:{origin:base},data:{name:'Report QA Editor',email,password:qaPassword(),role:'Editor'}});assert.equal(created.status(),201);
  const users=await (await context.request.get(`${base}/api/users`)).json();
  const {id}=users.users.find(user=>user.email===email);
  try {
   assert.equal((await viewer.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email,password:qaPassword()}})).status(),200);
   assert.equal((await viewer.request.get(`${base}/api/findings?format=report`)).status(),403);
  } finally { assert.equal((await context.request.patch(`${base}/api/users`,{headers:{origin:base},data:{id,role:'Editor',status:'Disabled'}})).status(),200); }
 } finally { await viewer.close(); }
 const capaResponse=await context.request.get(`${base}/api/findings?format=report`);assert.equal(capaResponse.status(),200);assert.equal((await capaResponse.json()).complete,true);
 let capaUnavailable=false;
 const capa={id:'capa:QA-REPORT',code:'CAPA-QA',module:'Bulgular ve CAPA',data:{title:'Connected correction',status:'in-progress',severity:'critical',owner:'Reviewer',riskRef:'RISK-QA',controlRef:'CTRL-QA',correctiveAction:'CAPA-DETAIL',evidenceSha256:'a'.repeat(64)}};
 await page.route('**/api/findings?format=report',route=>route.fulfill({status:capaUnavailable?503:200,json:capaUnavailable?{error:'Unavailable'}:{complete:true,total:1,rows:[capa],revision:'a'.repeat(32),nextCursor:null}}));
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
 const geometry=await panel.evaluate(el=>{const controls=[...el.querySelectorAll('.report-pagination button')].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,y:r.y}});const wrap=el.querySelector('.table-wrap');const heads=[...el.querySelectorAll('th')];return {controls,overflow:wrap.scrollWidth-wrap.clientWidth,valueFont:parseFloat(getComputedStyle(el.querySelector('.kpi>b')).fontSize),caption:el.querySelector('caption')!==null,titleWidth:heads[2].getBoundingClientRect().width,codeWidth:heads[0].getBoundingClientRect().width}});
 assert.ok(geometry.controls.every(b=>b.width<130&&b.height<=40));assert.ok(Math.abs(geometry.controls[0].y-geometry.controls[1].y)<2);assert.ok(geometry.overflow<=2);assert.ok(geometry.valueFont>=20);assert.equal(geometry.caption,false);assert.ok(geometry.titleWidth>geometry.codeWidth*2);

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
 await panel.getByLabel('Report module',{exact:true}).selectOption('Bulgular ve CAPA');
 await expect(panel.locator('tbody tr')).toHaveCount(1);
 await expect(panel.locator('tbody')).toContainText('Connected correction');
 for(const label of ['HTML','CSV']){
  const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:label,exact:true}).click();const download=await downloaded;
  const text=(await readFile(await download.path())).toString('utf8');assert.match(text,/RISK-QA/);assert.match(text,/CTRL-QA/);assert.match(text,/CAPA-DETAIL/);
 }
 await panel.getByLabel('Report module',{exact:true}).selectOption('__all__');
 await expect(panel.locator('.report-scope-strip')).toContainText('122');
 await panel.locator('.workspace-export summary').click();
 capaUnavailable=true;await panel.locator('.report-source-status button').click();
 await expect(panel.locator('.report-source-status')).toContainText('CAPA is unavailable');
 for(const label of ['HTML','CSV','PDF Report','Download Excel Report'])await expect(panel.getByRole('button',{name:label,exact:true,includeHidden:true})).toBeDisabled();
 await panel.getByLabel('Report module',{exact:true}).selectOption('BIA');
 await expect(panel.getByRole('button',{name:'HTML',exact:true,includeHidden:true})).toBeEnabled();
 capaUnavailable=false;await panel.locator('.report-source-status button').click();await expect(panel.locator('.report-source-status')).toContainText('1 records available');
 await page.route('**/fonts/FornostReportSans.ttf',route=>route.fulfill({status:503,body:'Unavailable'}));
 await panel.getByRole('button',{name:'PDF Report',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('PDF could not be generated');await expect(panel.getByRole('button',{name:'PDF Report',exact:true})).toBeEnabled();
 console.log('Reporting QA passed: CAPA source references, export failure gating and recovery; complete pagination, filter reset, detailed HTML/CSV/PDF downloads, Turkish data, classification and font-failure recovery.');
}finally{await browser.close();}
