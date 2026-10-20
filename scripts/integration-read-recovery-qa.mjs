import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='integration-read-recovery-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext(),page=await context.newPage(),errors=[];
page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
async function go(name){await page.locator(`nav button[aria-label="${name}"]`).evaluate(e=>e.click());}
async function intercept(path,body=false){await page.evaluate(({path,body})=>{
 const original=window.fetch.bind(window);window.qaOriginalFetch=original;window.qaAborts=0;window.qaPending=[];
 window.fetch=async(input,init)=>{
  if(new URL(String(input),location.href).pathname!==path||init?.method&&init.method!=='GET')return original(input,init);
  init?.signal?.addEventListener('abort',()=>window.qaAborts++);
  const pending=new Promise(resolve=>window.qaPending.push(resolve));
  // Deliberately ignore cancellation to prove late transports cannot commit.
  return body?{ok:true,json:()=>pending}:pending;
 };
},{path,body});}
async function restore(){await page.evaluate(()=>{window.fetch=window.qaOriginalFetch;});}
try{
 const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await intercept('/api/evidence-automation');await go('Workflow Integrations');
 const overview=page.locator('.integrations-overview'),refresh=overview.getByRole('button',{name:'Refresh integrations',exact:true});
 await expect(overview).toHaveAttribute('aria-busy','true');
 await expect(overview).toContainText('Continuous assurance data unavailable');await expect(refresh).toBeEnabled();
 assert.ok(await page.evaluate(()=>window.qaAborts)>0,'deadline aborts transport');
 await page.screenshot({path:`${out}/overview-timeout.png`,fullPage:true});
 await restore();await refresh.click();await expect(overview).toHaveAttribute('aria-busy','false');await expect(overview).not.toContainText('Continuous assurance data unavailable');
 await page.evaluate(()=>window.qaPending.forEach(resolve=>resolve(new Response(JSON.stringify({sources:[],rules:[],findings:[],runs:[]})))));
 await expect(overview).not.toContainText('Continuous assurance data unavailable');
 await intercept('/api/evidence-automation');await refresh.click();await expect(overview).toHaveAttribute('aria-busy','true');await go('Email & Notifications');
 await expect.poll(()=>page.evaluate(()=>window.qaAborts)).toBeGreaterThan(0);
 await expect(overview).toHaveCount(0);await restore();await go('Identity & Access');await expect(page.locator('main>header h1')).toHaveText('Identity & Access');
 // A JSON body that never completes must have the same recovery path as headers.
 await intercept('/api/evidence-automation',true);await go('Evidence Automation');
 const sourceAlert=page.locator('.ea-page [role="alert"]').filter({hasText:'Source information unavailable'});
 await expect(sourceAlert).toBeVisible();assert.ok(await page.evaluate(()=>window.qaAborts)>0);
 await restore();await sourceAlert.getByRole('button',{name:'Retry',exact:true}).click();await expect(sourceAlert).toHaveCount(0);await expect(page.locator('.ea-page')).not.toContainText('Loading sources');
 await page.evaluate(()=>window.qaPending.forEach(resolve=>resolve({sources:[{id:'stale',name:'STALE QA SOURCE'}],rules:[]})));
 await expect(page.locator('.ea-page')).not.toContainText('STALE QA SOURCE');
 await page.screenshot({path:`${out}/sources-recovered.png`,fullPage:true});
 // Configuration errors settle independently and are recoverable without page reload.
 await go('Risk Assessment');await intercept('/api/integrations',true);await go('Workflow Integrations');
 await expect(overview).toContainText('Configuration unavailable');await expect(refresh).toBeEnabled();
 await restore();await refresh.click();await expect(overview).toHaveAttribute('aria-busy','false');await expect(overview).not.toContainText('Configuration unavailable');
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks:['header timeout','JSON body timeout','retry','unmount cancellation','late response ignored','configuration recovery','email and identity navigation'],errors},null,2));console.log('INTEGRATION_READ_RECOVERY_QA_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();}
