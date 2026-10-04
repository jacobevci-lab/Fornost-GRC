import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='session-policy-qa-artifacts',password=qaPassword();
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext(),user=await browser.newContext(),page=await user.newPage();
const email='qa-session-policy@fornost.test';let original,userId;
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const path=`${out}/fixture.sql`;await fs.writeFile(path,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',path],{stdio:'pipe',timeout:60000});}
async function request(context,path,method='GET',data,expected=200){const response=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(response.status(),expected,`${method} ${path}`);return response;}
const login=(context,email)=>request(context,'/api/auth','POST',{action:'login',email,password});
const configure=minutes=>request(admin,'/api/settings','PUT',{...original,sessionTimeoutMinutes:String(minutes)});
const age=(minutes,expiresInMinutes)=>seed(`UPDATE local_sessions SET created_at=${q(new Date(Date.now()-minutes*60000).toISOString())},expires_at=${q(new Date(Date.now()+expiresInMinutes*60000).toISOString())} WHERE user_id=${q(userId)};`);
try{
 await login(admin,'qa-admin@fornost.test');original=await (await request(admin,'/api/settings')).json();
 await configure(30);
 await request(admin,'/api/users','POST',{email,password,name:'Session Policy QA',role:'Editor'},201);
 userId=(await (await request(admin,'/api/users')).json()).users.find(value=>value.email===email).id;
 const signedIn=await login(user,email);
 const seconds=Number(/max-age=(\d+)/i.exec(signedIn.headers()['set-cookie']||'')?.[1]);assert.ok(seconds>=1790&&seconds<=1800,'Cookie must match configured lifetime');
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await age(31,450);await request(user,'/api/grc','GET',undefined,401);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.shell')).toHaveCount(0);await expect(page.locator('.auth-screen')).toBeVisible();
 await login(user,email);await age(6,24);await request(user,'/api/grc');await configure(5);await request(user,'/api/grc','GET',undefined,401);
 await configure(30);await login(user,email);await age(6,24);await configure(5);await configure(720);await request(user,'/api/grc','GET',undefined,401);
 await configure(5);await login(user,email);await age(6,-1);await configure(720);await request(user,'/api/grc','GET',undefined,401);
 const longer=await login(user,email);const longSeconds=Number(/max-age=(\d+)/i.exec(longer.headers()['set-cookie']||'')?.[1]);assert.ok(longSeconds>=43190&&longSeconds<=43200,'New sessions must use increased duration');await request(user,'/api/grc');
 // Active requests cannot extend the absolute deadline.
 await age(721,1);await request(user,'/api/grc','GET',undefined,401);
 await login(user,email);await seed(`UPDATE local_sessions SET created_at='invalid' WHERE user_id=${q(userId)};`);await request(user,'/api/grc','GET',undefined,401);
 // Invalid policy falls to five minutes; a valid login does not bypass that fallback.
 await login(user,email);await age(6,714);
 await seed(`UPDATE platform_settings SET config_json='{' WHERE id='default';`);await request(user,'/api/grc','GET',undefined,401);
 console.log('SESSION_POLICY_QA passed: cookie lifetime, expired legacy session, browser sign-in recovery, policy reduction, no extension, 12-hour new session, malformed timestamps and corrupt policy');
}finally{
 try{if(original){await login(admin,'qa-admin@fornost.test');await request(admin,'/api/settings','PUT',original);}if(userId)await seed(`DELETE FROM local_sessions WHERE user_id=${q(userId)};DELETE FROM user_module_access WHERE user_id=${q(userId)};DELETE FROM user_access_events WHERE user_id=${q(userId)};DELETE FROM local_users WHERE id=${q(userId)};`);}finally{await browser.close();}
}
