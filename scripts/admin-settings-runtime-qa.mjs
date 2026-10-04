import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='admin-settings-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
page.setDefaultTimeout(20000);
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
 assert.deepEqual(errors,[]);console.log('ADMIN_SETTINGS_QA passed: load failure, malformed response, retry, history, degraded health, unknown state, themes, mobile and Turkish');
}finally{await browser.close();}
