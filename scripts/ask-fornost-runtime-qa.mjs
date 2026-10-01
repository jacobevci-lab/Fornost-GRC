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
 await page.locator('input[name=email]').fill('qa-admin@fornost.test');await page.locator('input[name=password]').fill('Fornost-QA!2026-Branch');await page.getByRole('button',{name:'Giriş Yap',exact:true}).click();
 await expect(page.locator('.shell')).toBeVisible();await page.locator('.context-ai-trigger').click();
 const panel=page.locator('#fornost-ai-panel');await expect(panel).toBeVisible({timeout:5000});await expect(panel.locator('.fornost-ai-tabs')).toBeVisible({timeout:5000});
 assert.ok(await panel.locator('.fornost-ai-tabs>button').count()>=30,'Specialist AI capabilities are retained');
 await expect(panel).toContainText('AI sağlayıcısı henüz yapılandırılmamış');await expect(panel.locator('.fornost-ai-compose button')).toBeDisabled();
 await expect(panel.locator('.fornost-ai-compose textarea')).not.toHaveValue('');
 await page.screenshot({path:`${out}/signed-in-immediate-open.png`});
 await panel.getByRole('button',{name:'AI Ayarlarını Aç',exact:true}).click();await expect(panel).toBeHidden();await expect(page.locator('.ai-settings-page')).toBeVisible();
 await page.locator('.fornost-ai-launcher').click();await expect(panel).toBeVisible();await panel.getByRole('button',{name:'Kapat',exact:true}).click();await expect(panel).toBeHidden();
 // A failed identity refresh must explain the failure and allow recovery.
 await page.route('**/api/auth',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.locator('.context-ai-trigger').click();await expect(panel).toContainText('Oturum doğrulanamadı');
 await page.unroute('**/api/auth');await panel.getByRole('button',{name:'Yeniden dene',exact:true}).click();await expect(panel.locator('.fornost-ai-tabs')).toBeVisible();
 // Provider status errors must not reuse an old ready state or silently disable chat.
 await page.route('**/api/ai/status',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.locator('.context-ai-trigger').click();await expect(panel).toContainText('AI bağlantı durumu alınamadı');await expect(panel.locator('.fornost-ai-compose button')).toBeDisabled();
 await page.unroute('**/api/ai/status');await panel.getByRole('button',{name:'Bağlantıyı yeniden kontrol et',exact:true}).click();await expect(panel).toContainText('AI sağlayıcısı henüz yapılandırılmamış');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/copilot-mobile.png`});
 assert.deepEqual(errors,[]);console.log('ASK_FORNOST_QA_PASS: immediate post-login header, launcher, setup navigation, identity/status failure recovery, capabilities and mobile');
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
