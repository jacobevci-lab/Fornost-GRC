import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='admin-settings-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
page.setDefaultTimeout(20000);
let originalNotifications=null;
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.route('**/api/settings',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.locator('nav button[aria-label="System Settings"]').evaluate(el=>el.click());
 await expect(page.locator('.settings-load-state')).toContainText('could not be loaded');
 await expect(page.getByRole('button',{name:'Save Settings',exact:true})).toHaveCount(0);
 await page.unroute('**/api/settings');
 await page.route('**/api/settings',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.settings-load-state')).toContainText('could not be loaded');
 await expect(page.getByRole('button',{name:'Save Settings',exact:true})).toHaveCount(0);
 await page.unroute('**/api/settings');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('button',{name:'Save Settings',exact:true})).toBeEnabled();
 await page.locator('.settings-subnav').getByRole('button',{name:'Change History',exact:true}).click();await expect(page.locator('.settings-audit-trail')).toBeVisible();await expect(page.locator('.settings-grid')).toHaveCount(0);
 await page.route('**/api/health',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({checks:{database:{ok:true},bucket:{ok:false}}})}));
 await page.route('**/api/integrations/health',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({health:{email:{status:'success',testedAt:'2026-10-04T10:00:00Z'}}})}));
 await page.locator('.settings-subnav').getByRole('button',{name:'System Status',exact:true}).click();const panel=page.locator('.settings-status-panel');
 await expect(panel.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
 await expect(panel.locator('article').filter({has:page.getByText('Database',{exact:true})})).toContainText('Passed');
 await expect(panel.locator('article').filter({has:page.getByText('Evidence Store',{exact:true})})).toContainText('Failed');
 await expect(panel.locator('article').filter({has:page.getByText('Identity & Access',{exact:true})})).toContainText('Unverified');
 await expect(panel.locator('article').filter({has:page.getByText('Email & Notifications',{exact:true})})).toContainText('Passed');
 for(const theme of ['light','dark'])for(const width of [1440,390]){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:960});await panel.scrollIntoViewIfNeeded();assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/${theme}-${width}.png`});}
 await page.unroute('**/api/health');await page.route('**/api/health',route=>route.abort());await panel.getByRole('button',{name:'Refresh',exact:true}).click();await expect(panel.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();await expect(panel.locator('article').filter({has:page.getByText('Database',{exact:true})})).toContainText('Unverified');
 await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();await expect(panel).toContainText('Sistem Durumu');
 await page.unroute('**/api/health');await page.unroute('**/api/integrations/health');
 await page.setViewportSize({width:1440,height:960});
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 const notificationUrl=base+'/api/continuous-assurance/notifications';
 const initial=await context.request.get(notificationUrl);assert.equal(initial.status(),200);originalNotifications=await initial.json();
 await page.route('**/api/continuous-assurance/notifications',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.locator('nav button[aria-label="Email & Notifications"]').evaluate(el=>el.click());
 const delivery=page.locator('.assurance-notification-console'),frequency=page.locator('.assurance-storm-console');
 for(const section of [delivery,frequency]){await expect(section).toContainText('could not be loaded');await expect(section.getByRole('button',{name:'Save Policy',exact:true})).toHaveCount(0)}
 await page.unroute('**/api/continuous-assurance/notifications');
 for(const section of [delivery,frequency]){await section.getByRole('button',{name:'Retry',exact:true}).click();await expect(section.getByRole('button',{name:'Save Policy',exact:true})).toBeEnabled()}
 await expect(page.locator('.integration-card').getByLabel('Provider',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send Test Email',exact:true})).toBeVisible();
 await expect(page.locator('.assurance-notification-kpis,.assurance-scheduler-status,.assurance-notification-breaches,.assurance-recovery-register,.assurance-dispatch-register,.assurance-reset-register,.assurance-delivery-register,.storm-deferrals')).toHaveCount(0);
 await expect(page.locator('main table')).toHaveCount(0);
 await delivery.getByLabel('Max attempts',{exact:true}).fill('4');
 await page.route('**/api/continuous-assurance/notifications',route=>route.request().method()==='PUT'?route.abort():route.continue());
 await delivery.getByRole('button',{name:'Save Policy',exact:true}).click();await expect(delivery).toContainText('Settings could not be saved.');await expect(delivery.getByLabel('Max attempts',{exact:true})).toHaveValue('4');
 await page.unroute('**/api/continuous-assurance/notifications');
 await delivery.getByRole('button',{name:'Save Policy',exact:true}).click();await expect(delivery).toContainText('Notification settings saved.');
 await frequency.getByLabel('Rolling window (min)',{exact:true}).fill('90');
 await frequency.getByRole('button',{name:'Save Policy',exact:true}).click();await expect(frequency).toContainText('Delivery frequency saved.');
 const persisted=await context.request.get(notificationUrl);assert.equal(persisted.status(),200);const persistedData=await persisted.json();assert.equal(persistedData.policy.maxAttempts,4);assert.equal(persistedData.storm.policy.windowMinutes,90);
 await page.reload();await expect(delivery.getByLabel('Max attempts',{exact:true})).toHaveValue('4');await expect(frequency.getByLabel('Rolling window (min)',{exact:true})).toHaveValue('90');
 for(const language of ['EN','TR']){
  await page.locator('.language-switch:visible').getByRole('button',{name:language,exact:true}).click();
  await expect(delivery.locator('input')).toHaveCount(4);await expect(frequency.locator('input')).toHaveCount(3);
  for(const theme of ['light','dark'])for(const width of [1440,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:960});
   for(const section of [delivery,frequency])assert.ok(await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'email settings overflow');
   await page.screenshot({path:`${out}/email-${language}-${theme}-${width}.png`,fullPage:true});
  }
 }
 assert.deepEqual(errors,[]);console.log('ADMIN_SETTINGS_QA passed: load failure, malformed response, retry, history, degraded health, unknown state, themes, mobile, Turkish; email settings only, load/save recovery and real policy persistence');
}finally{
 if(originalNotifications){
  for(const data of [originalNotifications.policy,{section:'storm',...originalNotifications.storm.policy}]){
   const restored=await context.request.put(base+'/api/continuous-assurance/notifications',{headers:{origin:base},data});assert.equal(restored.status(),200,'restore notification policy');
  }
 }
 await browser.close();
}
