import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:4173',out='simplicity-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}});
const response=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:'Fornost-QA!2026-Branch'}});
assert.equal(response.status(),200);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 for(const theme of ['light','dark']){
  const anonymous=await browser.newContext(),loginPage=await anonymous.newPage();
  try{
   await loginPage.goto(base);await expect(loginPage.locator('.auth-card')).toBeVisible();
   await loginPage.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await loginPage.waitForTimeout(400);
   const audit=await new AxeBuilder({page:loginPage}).include('.auth-card').withRules(['color-contrast']).analyze();
   assert.deepEqual(audit.violations,[],`Login contrast: ${theme}`);
  }finally{await anonymous.close();}
 }
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 async function open(name){await page.locator(`nav button[aria-label="${name}"]`).evaluate(el=>el.click());}
 for(const locale of ['tr','en']){
  await page.locator('.language-switch:visible').getByRole('button',{name:locale.toUpperCase(),exact:true}).click();
  const tr=locale==='tr';
  await open(tr?'Risk Değerlendirmesi':'Risk Assessment');
  const analysis=page.locator('.risk-analysis-disclosure');await expect(analysis).toBeVisible();
  assert.equal(await analysis.getAttribute('open'),null);
  await analysis.locator('summary').click();await expect(analysis.locator('.matrix,.risk-matrix').first()).toBeVisible();
  await analysis.locator('summary').click();
  assert.ok((await page.locator('.table-card').boundingBox()).y<550,'Risk register is above the fold');
  await open(tr?'Kanıt Otomasyonu':'Evidence Automation');
  await expect(page.locator('.ea-tabs button[aria-pressed="true"]')).toHaveText(tr?'Kanıt Kaynakları':'Evidence Sources');
  await expect(page.locator('.ea-catalog')).toHaveCount(0);
  await page.route('**/api/evidence-automation',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await open(tr?'Risk Değerlendirmesi':'Risk Assessment');await open(tr?'Kanıt Otomasyonu':'Evidence Automation');
  await expect(page.locator('.ea-page [role="alert"]')).toBeVisible();
  await expect(page.locator('.ea-table')).toHaveCount(0);
  await page.unroute('**/api/evidence-automation');
  await page.locator('.ea-page [role="alert"] button').click();
  await expect(page.locator('.ea-page [role="alert"]')).toHaveCount(0);
  await page.locator('.ea-tabs').getByRole('button',{name:tr?'Connector Kataloğu':'Connector Catalog',exact:true}).click();
  await expect(page.locator('.ea-catalog')).toBeVisible();
  await open(tr?'Denetim Yönetimi':'Audit Management');
  const portfolio=await page.locator('.audit-portfolio').boundingBox(),gate=await page.locator('.audit-readiness-gate').boundingBox();
  assert.ok(portfolio.y<gate.y,'Portfolio precedes readiness analysis');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.waitForTimeout(400);
   const audit=await new AxeBuilder({page}).include('.audit-readiness-gate').withRules(['color-contrast']).analyze();
   assert.deepEqual(audit.violations,[],`Audit readiness contrast: ${locale}/${theme}`);
  }
  await open(tr?'Raporlama':'Reporting');
  await page.locator('.workspace-export summary').click();
  await expect(page.locator('.workspace-export').getByRole('button',{name:'HTML',exact:true})).toBeVisible();
  await open(tr?'AI Yönetişimi':'AI Governance');
  const host=page.locator('#ai-governance-workspace'),panel=host.locator('#fornost-ai-panel');
  await expect(panel).toBeVisible();
  assert.ok(await panel.locator('.fornost-ai-tabs>button').count()>=30,'All specialist capabilities retained');
  await panel.locator('.ai-section-picker>summary').click();
  await panel.getByRole('button',{name:'AI Envanteri',exact:true}).click();
  await expect(panel).toHaveAttribute('data-ai-view','models');
  assert.equal(await panel.locator('.ai-section-picker').getAttribute('open'),null);
  await panel.locator('.ai-section-picker>summary').click();await panel.getByRole('button',{name:'AI Yönetim Özeti',exact:true}).click();
  await expect(page.locator('.fornost-ai-launcher')).toBeHidden();
  for(const theme of ['light','dark'])for(const width of [1536,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.setViewportSize({width,height:960});
   await page.screenshot({path:`${out}/${locale}-ai-${theme}-${width}.png`});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4,'AI workspace fits viewport');
   assert.ok((await panel.boundingBox()).width>(await host.boundingBox()).width*.95,'AI uses full workspace width');
  }
  await page.setViewportSize({width:1536,height:960});
  await open(tr?'Risk Değerlendirmesi':'Risk Assessment');await expect(page.locator('#fornost-ai-panel')).toHaveCount(0);
  await page.locator('.context-ai-trigger').click();await expect(page.locator('#fornost-ai-panel')).toBeVisible();
  await expect(page.locator('#ai-governance-workspace')).toHaveCount(0);
  await page.locator('#fornost-ai-panel button[aria-label="Kapat"]').click();
  for(const name of [tr?'Risk Değerlendirmesi':'Risk Assessment',tr?'Kanıt Otomasyonu':'Evidence Automation',tr?'Denetim Yönetimi':'Audit Management']){
   await open(name);await page.screenshot({path:`${out}/${locale}-${name}.png`});
  }
 }
 assert.deepEqual(errors,[]);console.log('SIMPLICITY_QA_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`});throw error;}finally{await browser.close();}
