import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='user-session-revocation-qa-artifacts',password=qaPassword(),email='qa-revoke-sessions@fornost.test';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext({viewport:{width:1440,height:960}}),first=await browser.newContext(),second=await browser.newContext();
const page=await admin.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let userId;
async function api(context,path,method='GET',data,expected=200){const response=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(response.status(),expected,`${method} ${path}`);return response.json();}
const login=(context,email)=>api(context,'/api/auth','POST',{action:'login',email,password});
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function cleanup(){if(!userId)return;const path=`${out}/cleanup.sql`;await fs.writeFile(path,`DELETE FROM local_sessions WHERE user_id=${q(userId)};DELETE FROM user_module_access WHERE user_id=${q(userId)};DELETE FROM user_access_events WHERE user_id=${q(userId)};DELETE FROM local_users WHERE id=${q(userId)};`);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',path],{stdio:'pipe',timeout:60000});}
try{
 await login(admin,'qa-admin@fornost.test');const adminId=(await api(admin,'/api/auth')).user.id;
 await api(admin,'/api/users','POST',{name:'Session Revocation QA',email,password,role:'Editor'},201);
 const original=(await api(admin,'/api/users')).users.find(value=>value.email===email);userId=original.id;
 await login(first,email);await login(second,email);
 await api(first,'/api/users/sessions','DELETE',{userId:adminId},403);
 await api(admin,'/api/users/sessions','DELETE',{userId:'missing-user'},404);
 await api(admin,'/api/users/sessions','DELETE',{userId,all:true},400);
 await api(admin,'/api/users/sessions','DELETE',{userId:'x'.repeat(5000)},413);
 const denied=await admin.request.delete(base+'/api/users/sessions',{data:{userId},headers:{origin:'https://untrusted.example'}});assert.equal(denied.status(),403);
 await api(first,'/api/grc');await api(second,'/api/grc');
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.route('**/api/users',route=>route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:'{}'}):route.continue());
 await page.locator('nav button[aria-label="Identity & Access"]').evaluate(el=>el.click());
 const section=page.locator('.local-users');await expect(section.getByRole('alert')).toContainText('could not be loaded');await expect(section.getByRole('button',{name:'Create Local Account',exact:true})).toBeDisabled();await expect(section.locator('.local-user-list>div')).toHaveCount(0);
 await page.unroute('**/api/users');await section.getByRole('button',{name:'Refresh User List',exact:true}).click();
 const row=section.locator('.local-user-list>div').filter({hasText:email}),control=row.locator('.local-user-sessions');await expect(row).toBeVisible();await control.locator('summary').click();
 await page.route('**/api/users/sessions',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await control.getByRole('button',{name:'End All Local Sessions',exact:true}).click();await expect(control.getByRole('alert')).toContainText('could not be verified');await api(first,'/api/grc');
 await page.unroute('**/api/users/sessions');
 for(const theme of ['light','dark'])for(const width of [1440,390]){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:960});await control.scrollIntoViewIfNeeded();assert.ok(await control.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/${theme}-${width}.png`});}
 const response=page.waitForResponse(r=>r.url().endsWith('/api/users/sessions')&&r.request().method()==='DELETE');await control.getByRole('button',{name:'End All Local Sessions',exact:true}).click();const result=await (await response).json();assert.equal(result.ok,true);assert.equal(result.revokedSessions,2);assert.equal(result.currentSessionRevoked,false);
 await api(first,'/api/grc','GET',undefined,401);await api(second,'/api/grc','GET',undefined,401);await api(admin,'/api/grc');
 const snapshot=await api(admin,'/api/users'),after=snapshot.users.find(value=>value.id===userId);for(const key of ['role','status','moduleAccess'])assert.deepEqual(after[key],original[key]);assert.ok(snapshot.events.some(e=>e.user_id===userId&&JSON.parse(e.after_json).operation==='revoke-local-sessions'));
 await expect(section.locator('.local-message')).toContainText('local sessions ended');await section.locator('.module-access-events summary').click();await expect(section.locator('.module-access-events')).toContainText('Local sessions ended');
 await login(first,email);await api(first,'/api/grc');
 await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();await expect(row.locator('.local-user-sessions summary')).toContainText('Oturum güvenliği');
 // Self-revocation returns this browser to sign-in without disabling its account.
 const own=section.locator('.local-user-list>div').filter({hasText:'qa-admin@fornost.test'}).locator('.local-user-sessions');await own.locator('summary').click();await own.getByRole('button',{name:'Tüm Yerel Oturumları Sonlandır',exact:true}).click();await expect(page.locator('.auth-screen')).toBeVisible();await login(admin,'qa-admin@fornost.test');
 assert.deepEqual(errors,[]);console.log('USER_SESSION_REVOCATION_QA passed: admin/CSRF/body boundaries, two sessions revoked, account preserved, audit, re-login, load/action failure recovery, self-revoke, themes/mobile and Turkish');
}finally{try{await cleanup();}finally{await browser.close();}}
