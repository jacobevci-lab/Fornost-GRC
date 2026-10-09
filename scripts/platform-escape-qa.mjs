import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 assert.equal((await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}})).status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible({timeout:30000});
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 let writes=0;page.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/')&&!r.url().includes('/api/ai/status'))writes++;});
 const scenarios=[
  ['Control Library','.module-head .actions button.primary','.record-dialog'],
  ['Evidence Library','.module-head .actions button.primary','.record-dialog'],
  ['Risk Assessment','.module-head .actions button.primary','.record-dialog'],
  ['Business Impact Analysis (BIA)','.module-head .actions button.primary','.record-dialog'],
  ['Asset Inventory','.module-head .actions button.primary','.record-dialog'],
  ['Audit Management','.module-head button.primary','.audit-picker'],
  ['Evidence Automation','.ea-hero button.primary','.ea-modal'],
  ['Vendor Management','.tprm-hero button:last-child','.tprm-modal'],
  ['Policy Center','.plm-hero button:last-child','.plm-modal'],
  ['Risk Appetite & KRI','.rap-hero button:last-child','.rap-modal'],
  ['Regulatory Change Center','.ri-hero button:last-child','.ri-modal'],
  ['Security Incidents & Crisis','.incident-hero button','.incident-form'],
  ['Business Continuity & Resilience','.continuity-hero button','dialog.continuity-overlay'],
  ['Findings & CAPA','.finding-hero button:last-child','dialog.finding-overlay'],
 ];
 for(const [module,trigger,surface]of scenarios){
  await page.locator(`nav button[aria-label="${module}"]`).evaluate(node=>node.click());
  await expect(page.locator(trigger).first()).toBeVisible();
  await page.reload();
  await expect(page.locator(trigger).first()).toBeVisible({timeout:30000});
  await expect(page.locator(`nav button[aria-label="${module}"]`)).toHaveClass(/active/);
  console.log('PAGE_REFRESH_PASS',module);
  await page.locator(trigger).first().click();await expect(page.locator(surface)).toBeVisible();
  const input=page.locator(surface).locator('input:not([type="hidden"]),textarea,select').first();if(await input.count())await input.focus();
  await page.keyboard.press('Escape');await expect(page.locator(surface)).toHaveCount(0);
  console.log('ESCAPE_MODULE_PASS',module);
 }
 await page.locator('nav button[aria-label="Risk Assessment"]').evaluate(node=>node.click());
 await page.locator('.context-ai-trigger').click();await expect(page.locator('#fornost-ai-panel')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('#fornost-ai-panel')).toHaveCount(0);
 await page.keyboard.press('Control+k');await expect(page.locator('.command-palette')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.command-palette')).toHaveCount(0);
 await page.locator('.module-head .actions button.primary').first().click();
 await expect(page.locator('.record-dialog')).toBeVisible();
 await page.keyboard.press('Control+k');await expect(page.locator('.command-palette')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.command-palette')).toHaveCount(0);await expect(page.locator('.record-dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.record-dialog')).toHaveCount(0);
 // Test the actual installed dispatcher against stacked, disabled, native and
 // dynamically mounted boundaries, with no React or API mocks.
 await page.evaluate(()=>{
  window.escapeClosed=[];
  window.makeEscapeLayer=(id,z,disabled=false)=>{const layer=document.createElement('section');layer.dataset.escapeLayer='';layer.id=id;layer.style.cssText=`position:fixed;inset:100px;z-index:${z};background:white`;const button=document.createElement('button');button.type='button';button.dataset.escapeClose='';button.disabled=disabled;button.textContent='Close';button.onclick=()=>{window.escapeClosed.push(id);layer.remove();};layer.append(button);document.body.append(layer);return layer;};
  window.makeEscapeLayer('escape-top',9999);window.makeEscapeLayer('escape-under',9998);
 });
 await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>window.escapeClosed),['escape-top']);
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',repeat:true,bubbles:true,cancelable:true})));
 await expect(page.locator('#escape-under')).toBeVisible();
 await page.evaluate(()=>window.makeEscapeLayer('escape-busy',9999,true));await page.keyboard.press('Escape');
 await expect(page.locator('#escape-busy')).toBeVisible();await expect(page.locator('#escape-under')).toBeVisible();
 await page.locator('#escape-busy').evaluate(n=>n.remove());
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})));
 await expect(page.locator('#escape-under')).toBeVisible();
 await page.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});e.preventDefault();window.dispatchEvent(e);});
 await expect(page.locator('#escape-under')).toBeVisible();
 await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='escape-native';dialog.innerHTML='<button>Native field</button>';document.body.append(dialog);dialog.showModal();});
 await page.keyboard.press('Escape');await expect(page.locator('#escape-native')).not.toBeVisible();await expect(page.locator('#escape-under')).toBeVisible();
 await page.locator('#escape-native').evaluate(n=>n.remove());await page.keyboard.press('Escape');await expect(page.locator('#escape-under')).toHaveCount(0);
 assert.equal(writes,0,'Dismissal never saves, deletes or submits');assert.deepEqual(errors,[]);
 console.log('PLATFORM_ESCAPE_QA_PASS: 14 module forms, Ask Fornost, command palette, visual stacking, busy guards, key repeat, composition, prevented events and native dialog isolation');
}finally{await browser.close();}
