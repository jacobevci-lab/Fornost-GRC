import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createQaContext, waitForQaIdle, closeQaContext } from './qa-browser-harness.mjs';
import { qaPassword } from './qa-credentials.mjs';
const base=(process.env.FORNOST_PROD_URL||'http://127.0.0.1:4173').replace(/\/$/,''),out='copilot-identity-response-qa-artifacts';
const local=new URL(base).hostname==='127.0.0.1';
const accessHeaders=process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET?{'CF-Access-Client-Id':process.env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':process.env.CF_ACCESS_CLIENT_SECRET}:{};
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,accessHeaders,{viewport:{width:1440,height:1000}});
const errors=[],checks=[],bodies=[];
await mkdir(out,{recursive:true});
try{
 const login=await context.request.post(base+'/api/auth',{headers:{...accessHeaders,origin:base},data:{action:'login',email:local?'qa-admin@fornost.test':process.env.FORNOST_SMOKE_EMAIL,password:local?qaPassword():process.env.FORNOST_SMOKE_PASSWORD}});assert.equal(login.status(),200);
 const snapshot=await (await context.request.get(base+'/api/auth',{headers:accessHeaders})).json();assert.equal(snapshot.user?.role,'Admin');
 for(const mode of ['latest-admin','latest-signed-out']){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  let calls=0,release;const pending=new Promise(resolve=>{release=resolve;});
  try{
   await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await waitForQaIdle(page);
   // Retain actual browser Response objects so the test can observe whether the
   // old body is consumed, without changing response parsing or app decisions.
   await page.evaluate(()=>{
    const fetcher=window.fetch.bind(window);window.__qaIdentityBodies=[];let sequence=0;
    window.fetch=async(input,init)=>{
     const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href).pathname;
     const tracked=path==='/api/auth'&&(init?.method||'GET')==='GET',order=tracked?++sequence:0;
     const response=await fetcher(input,init);
     if(tracked)window.__qaIdentityBodies.push({order,response});return response;
    };
   });
   const older=mode==='latest-admin'?{...snapshot,user:{...snapshot.user,role:'Viewer'}}:snapshot;
   const latest=mode==='latest-admin'?snapshot:{authenticated:false,bootstrapRequired:false};
   await page.route('**/api/auth',async route=>{
    if(route.request().method()!=='GET')return route.continue();
    calls++;if(calls===1){await pending;return route.fulfill({json:older}).catch(()=>{});}
    if(calls===2)return route.fulfill({json:latest});return route.continue();
   });
   const open=()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('fornost:open-ai',{detail:{}})));
   await open();await expect.poll(()=>calls).toBe(1);await open();await expect.poll(()=>calls).toBe(2);
   await expect.poll(()=>page.evaluate(()=>window.__qaIdentityBodies.find(item=>item.order===2)?.response.bodyUsed)).toBe(true);
   const panel=page.locator('#fornost-ai-panel');
   if(mode==='latest-admin')await expect(panel.locator('.fornost-ai-tabs button').filter({hasText:/AI Yönetim Özeti|AI Executive Overview/})).toHaveCount(1);
   else await expect(panel).toContainText('Ask Fornost için oturum açmanız gerekiyor.');
   release();await expect.poll(()=>page.evaluate(()=>window.__qaIdentityBodies.some(item=>item.order===1))).toBe(true);
   await expect.poll(()=>page.evaluate(()=>window.__qaIdentityBodies.find(item=>item.order===1)?.response.bodyUsed),{timeout:2000,message:'Superseded identity response must also be consumed'}).toBe(true);
   if(mode==='latest-admin')await expect(panel.locator('.fornost-ai-tabs button').filter({hasText:/AI Yönetim Özeti|AI Executive Overview/})).toHaveCount(1);
   else {await expect(panel).toContainText('Ask Fornost için oturum açmanız gerekiyor.');await expect(panel.locator('.fornost-ai-tabs')).toHaveCount(0);}
   await waitForQaIdle(page);
   checks.push(mode+': latest state retained, both bodies consumed, no stale authorization');
  }finally{
   release();bodies.push({mode,reads:await page.evaluate(()=>window.__qaIdentityBodies?.map(item=>({order:item.order,bodyUsed:item.response.bodyUsed}))||[]).catch(()=>[])});
   await page.close();
  }
 }
 assert.deepEqual(errors,[]);await closeQaContext(context);
 await writeFile(out+'/result.json',JSON.stringify({result:'PASS',checks,bodies,errors},null,2));console.log('COPILOT_IDENTITY_RESPONSE_QA_PASS: superseded bodies consumed; latest Admin and signed-out states preserved');
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({message:error.message,checks,bodies,errors},null,2));throw error;}
finally{await browser.close();}
