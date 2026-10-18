import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173', out='product-workspace-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}), page=await context.newPage();
page.setDefaultTimeout(20000);
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
async function open(label){
 const mobile=page.locator('.mobile-nav-toggle');
 if(await mobile.isVisible()&&await mobile.getAttribute('aria-expanded')!=='true')await mobile.click();
 const item=page.locator('#fornost-navigation .nav-group-items').getByRole('button',{name:label,exact:true,includeHidden:true});
 const group=page.locator('#fornost-navigation .nav-group').filter({has:item});
 if(await group.locator('.nav-group-trigger').getAttribute('aria-expanded')!=='true')await group.locator('.nav-group-trigger').click();
 await item.click();await expect(page.locator('main>header h1')).toHaveText(label);
 await expect(page.locator('main [aria-busy="true"]:visible')).toHaveCount(0);
}
async function capture(id){
 await page.evaluate(()=>document.fonts.ready);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4,`${id}: viewport fits`);
 await page.screenshot({path:`${out}/${id}.png`});checks.push(id);
}
try{
 const auth=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(auth.status(),200);
 await page.goto(base);await expect(page.locator('.shell[data-product-ui="2026.10"]')).toBeVisible();
 for(const locale of ['tr','en']){
  await page.locator('.language-switch:visible').getByRole('button',{name:locale.toUpperCase(),exact:true}).click();const tr=locale==='tr';
  await page.getByRole('textbox',{name:tr?'Menüde ara':'Search navigation',exact:true}).fill(tr?'kanıt':'evidence');
  await expect(page.locator('#fornost-navigation .nav-group-items button:visible')).toHaveCount(2);
  await page.locator('#fornost-navigation').getByRole('button',{name:tr?'Kanıt Kütüphanesi':'Evidence Library',exact:true}).click();
  await expect(page.locator('.navigation-search input')).toHaveValue('');
  await expect(page.locator('.module-overview')).toBeVisible();
  await page.locator('.navigation-search input').fill('no-such-module-xyz');await expect(page.locator('.navigation-empty')).toBeVisible();
  await page.locator('.navigation-search input').press('Escape');await expect(page.locator('#fornost-navigation .nav-group-items button')).toHaveCount(27);
  checks.push(`${locale}: navigation search, destination, clear, empty and Escape`);
  for(const theme of ['light','dark']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
   await open(tr?'Gösterge Paneli':'Dashboard');
   await expect(page.locator('.evidence-assurance-status')).not.toHaveAttribute('data-state','loading');
   await expect(page.locator('.executive-overview-score')).toBeVisible();
   await expect(page.locator('.executive-dashboard-header h2')).toContainText(tr?'Büyük resmi':'bigger picture');
   const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   for(const width of [1536,1024,390]){await page.setViewportSize({width,height:960});await capture(`${locale}-${theme}-${width}-dashboard`);}
   await page.setViewportSize({width:1536,height:960});
   const modules=tr?['Risk Değerlendirmesi','Varlık Envanteri','Uyum Yönetimi','Kontrol Kütüphanesi','Kanıt Kütüphanesi','Denetim Yönetimi','Tedarikçi Yönetimi','Politika Merkezi','Güvenlik Olayları ve Kriz','Bulgular ve CAPA','İş Sürekliliği ve Dayanıklılık','Raporlama','Sistem Ayarları','AI Yönetişimi']:['Risk Assessment','Asset Inventory','Compliance Management','Control Library','Evidence Library','Audit Management','Vendor Management','Policy Center','Security Incidents & Crisis','Findings & CAPA','Business Continuity & Resilience','Reporting','System Settings','AI Governance'];
   for(const [i,label] of modules.entries()){await open(label);await capture(`${locale}-${theme}-module-${String(i+1).padStart(2,'0')}`);}
   await open(tr?'Varlık Envanteri':'Asset Inventory');
   await page.locator('.module-head .primary').click();await expect(page.locator('.record-dialog')).toBeVisible();
   for(const width of [1536,390]){await page.setViewportSize({width,height:960});const modal=page.locator('.record-dialog');assert.ok(await modal.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}), 'record form stays in viewport');await capture(`${locale}-${theme}-${width}-form`);}
   await page.locator('.record-dialog [data-escape-close]').click();await page.setViewportSize({width:1536,height:960});
  }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/summary.json`,JSON.stringify({passed:true,checks,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});await fs.writeFile(`${out}/failure.json`,JSON.stringify({message:error.message,checks,errors},null,2));throw error;}finally{await browser.close();}
