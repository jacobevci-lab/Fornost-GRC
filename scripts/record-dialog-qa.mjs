import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='record-dialog-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let writes=0;page.on('request',request=>{if(request.method()==='POST'&&/\/api\/(grc|evidence)$/.test(new URL(request.url()).pathname))writes++;});
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 for(const locale of ['tr','en']){
  await page.locator('.language-switch:visible').getByRole('button',{name:locale.toUpperCase(),exact:true}).click();
  for(const theme of ['dark','light']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    for(const name of locale==='tr'?['Kontrol Kütüphanesi','Kanıt Kütüphanesi']:['Control Library','Evidence Library']){
     await page.locator(`nav button[aria-label="${name}"]`).evaluate(node=>node.click());
     const opener=page.locator('.module-head .actions button.primary').first();
     await expect(opener).toBeVisible();await opener.click();
     const dialog=page.locator('.record-dialog');await expect(dialog).toBeVisible();
     await expect(dialog.locator('input:not([type="hidden"])').first()).toBeFocused();
     const picker=dialog.locator('.framework-picker');
     await expect(picker).toBeVisible();
     const checkbox=picker.locator('input[type="checkbox"]').first();
     const size=await checkbox.boundingBox();assert.ok(size.width>=14&&size.width<=20&&size.height>=14&&size.height<=20,'Compact square checkbox');
     const geometry=await dialog.evaluate(node=>({overflow:node.scrollWidth-node.clientWidth,width:node.getBoundingClientRect().width,viewport:innerWidth}));
     assert.ok(geometry.overflow<=2&&geometry.width<=geometry.viewport,'No horizontal dialog overflow');
     const colors=await picker.locator('section').first().evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node.querySelector('label')).color}));
     if(theme==='dark'){const rgb=colors.background.match(/\d+/g).slice(0,3).map(Number);assert.ok(Math.max(...rgb)<100,'Standards cards use a dark surface');}
     await checkbox.check();await expect(checkbox).toBeChecked();await checkbox.uncheck();
     const contrast=await new AxeBuilder({page}).include('.record-dialog .framework-picker').withRules(['color-contrast']).analyze();
     assert.deepEqual(contrast.violations,[],`${locale}/${theme}/${width}/${name} contrast`);
     await page.screenshot({path:`${out}/${locale}-${theme}-${width}-${name.startsWith('Control')||name.startsWith('Kontrol')?'control':'evidence'}.png`});
     // Keyboard focus stays in the dialog and Escape closes without submitting.
     const close=dialog.getByRole('button',{name:locale==='tr'?'Pencereyi kapat':'Close dialog',exact:true});
     await close.focus();await page.keyboard.press('Shift+Tab');
     assert.equal(await dialog.evaluate(node=>node.contains(document.activeElement)),true);
     await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
     await opener.click();await expect(dialog).toBeVisible();
     await dialog.locator('input[type="checkbox"]').first().focus();await page.keyboard.press('Escape');
     await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
    }
   }
  }
 }
 assert.equal(writes,0,'Escape and checkbox changes do not submit records');assert.deepEqual(errors,[]);
 console.log('RECORD_DIALOG_QA_PASS: Control/Evidence, TR/EN, dark/light, desktop/mobile, compact checkboxes, contrast, focus containment/return and Escape without writes');
}finally{await browser.close();}
