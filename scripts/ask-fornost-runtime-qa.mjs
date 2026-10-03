import { qaPassword } from "./qa-credentials.mjs";
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Isolated QA only: never runs against a configurable production host.
const base='http://127.0.0.1:4173',out='ask-fornost-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await expect(page.locator('input[name=email]')).toBeVisible();
 // Let the independently mounted copilot observe the signed-out state first.
 await page.waitForTimeout(500);
 await page.locator('input[name=email]').fill('qa-admin@fornost.test');await page.locator('input[name=password]').fill(qaPassword());await page.getByRole('button',{name:'Giriş Yap',exact:true}).click();
 await expect(page.locator('.shell')).toBeVisible();await page.locator('.context-ai-trigger').click();
 const panel=page.locator('#fornost-ai-panel');await expect(panel).toBeVisible({timeout:5000});await expect(panel.locator('.fornost-ai-tabs')).toBeVisible({timeout:5000});
 assert.ok(await panel.locator('.fornost-ai-tabs>button').count()>=30,'Specialist AI capabilities are retained');
 await expect(panel).toContainText('AI sağlayıcısı henüz yapılandırılmamış');await expect(panel.locator('.fornost-ai-compose button')).toBeDisabled();
 await expect(panel.locator('.fornost-ai-compose textarea')).not.toHaveValue('');
 await page.screenshot({path:`${out}/signed-in-immediate-open.png`});
 await panel.getByRole('button',{name:'AI Ayarlarını Aç',exact:true}).click();await expect(panel).toBeHidden();await expect(page.locator('.ai-settings-page')).toBeVisible();
 await page.locator('.context-ai-trigger').click();await expect(panel).toBeVisible();await panel.getByRole('button',{name:'Kapat',exact:true}).click();await expect(panel).toBeHidden();
 // Hold an older successful response until a newer refresh fails. It must not erase the error.
 async function staleRefresh(path,errorText,retryLabel,recovered){
  let release,observed=0,delivered=false;
  const held=new Promise(resolve=>{release=resolve;});
  const pattern=`**${path}`;
  await page.route(pattern,async route=>{
   if(++observed===1){const response=await route.fetch();await held;await route.fulfill({response});delivered=true;}
   else await route.fulfill({status:503,contentType:'application/json',body:'{}'});
  });
  try{
   await page.locator('.context-ai-trigger').click();await expect.poll(()=>observed).toBeGreaterThanOrEqual(1);
   await page.locator('.context-ai-trigger').click();await expect(panel).toContainText(errorText);
   release();await expect.poll(()=>delivered).toBe(true);
   // Let the released network response and React commit reach the next painted frame.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await expect(panel).toContainText(errorText);await expect(panel.getByRole('button',{name:retryLabel,exact:true})).toBeEnabled();
  }finally{release();await page.unroute(pattern);}
  await panel.getByRole('button',{name:retryLabel,exact:true}).click();await recovered();
 }
 await staleRefresh('/api/auth','Oturum doğrulanamadı','Yeniden dene',()=>expect(panel.locator('.fornost-ai-tabs')).toBeVisible());
 await staleRefresh('/api/ai/status','AI bağlantı durumu alınamadı','Bağlantıyı yeniden kontrol et',()=>expect(panel).toContainText('AI sağlayıcısı henüz yapılandırılmamış'));
 await expect(panel.locator('.fornost-ai-compose button')).toBeDisabled();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/copilot-mobile.png`});
 assert.deepEqual(errors,[]);console.log('ASK_FORNOST_QA_PASS: immediate post-login header, setup navigation, out-of-order identity/status responses, failure recovery, capabilities and mobile');
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
