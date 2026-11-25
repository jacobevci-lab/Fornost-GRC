import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,waitForQaIdle,switchQaLocale} from './qa-browser-harness.mjs';

const base='http://127.0.0.1:4173',out='typography-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1536,height:1100}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const report=[];
async function capture(name){
 await waitForQaIdle(page);
 report.push({name,styles:await page.locator('body').evaluate(root=>[...root.querySelectorAll('h1,h2,h3,h4,th,td,label,input,select,textarea,button,small,.kpi b,.kpi strong,.rap-stages dd')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{const s=getComputedStyle(el);return {tag:el.tagName,class:el.className,parent:el.parentElement.className,text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,70),font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,line:s.lineHeight};}))});
 await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
}
try{
 const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await switchQaLocale(page,'tr');
 await openQaModule(page,'Risk Değerlendirmesi');await capture('risk-register-before');
 await page.locator('.module-head button.primary').click();await page.locator('.record-dialog').waitFor({state:'visible'});await capture('risk-form-before');await page.keyboard.press('Escape');
 await openQaModule(page,'Risk İştahı ve KRI');await capture('risk-appetite-before');
 await writeFile(`${out}/reference.json`,JSON.stringify(report,null,2));console.log('TYPOGRAPHY_REFERENCE_CAPTURED');
}catch(e){await page.screenshot({path:`${out}/reference-failure.png`}).catch(()=>{});throw e;}finally{await browser.close();}
