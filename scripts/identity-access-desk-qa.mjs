// Isolated QA only. Identity-provider responses are simulated, never real SSO proof.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale,waitForQaIdle} from './qa-browser-harness.mjs';
const base='http://127.0.0.1:4173',out='identity-desk-qa-artifacts';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1536,height:1024}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[],screenshots=[];page.on('pageerror',e=>errors.push(e.message));let phase='login',id;
async function api(method,path,data,status=200){const r=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${method} ${path}`);return r.json();}
const desk=page.locator('.iad'),button=name=>desk.getByRole('button',{name,exact:true});
async function capture(name){await desk.screenshot({path:`${out}/${name}.png`});screenshots.push(name);}
const email=`qa-identity-${randomUUID()}@fornost.test`;
try{
 await api('POST','/api/auth',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 id=(await api('POST','/api/users',{name:'Identity Design QA',email,password:qaPassword(),role:'Editor',moduleAccess:{mode:'scoped',modules:{'Risk Assessment':'write','Varlık Envanteri':'read',Kanıtlar:'read'}}},201)).id;
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await switchQaLocale(page,'en');await openQaModule(page,'Identity & Access');
 await desk.locator('.iad-user-select').filter({hasText:email}).click();const detail=desk.locator('.iad-detail');await expect(detail.locator('.iad-permissions>div')).toHaveCount(3);
 phase='filter selection and no-match states';await desk.getByLabel('Search users').fill('no-matching-identity');await expect(desk).toContainText('No users match the filters');await expect(detail.getByRole('button',{name:'Delete account'})).toHaveCount(0);await button('Clear filters').click();await desk.locator('.iad-user-select').filter({hasText:email}).click();
 await desk.getByLabel('Role filter').selectOption('Admin');await expect(detail).toContainText('QA Admin');await expect(detail.getByRole('button',{name:'Delete account'})).toBeDisabled();await desk.getByLabel('Role filter').selectOption('');await desk.locator('.iad-user-select').filter({hasText:email}).click();
 phase='dirty account recovery and keyboard dialog';await detail.getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.locator('.iad-dialog');await expect(dialog).toBeVisible();await dialog.getByLabel('Full name',{exact:true}).fill('Unsaved name');await page.keyboard.press('Escape');await expect(dialog.getByRole('group',{name:'Unsaved changes'})).toBeVisible();await dialog.getByRole('button',{name:'Keep editing'}).click();await expect(dialog.getByLabel('Full name',{exact:true})).toHaveValue('Unsaved name');await page.keyboard.press('Escape');await dialog.getByRole('button',{name:'Discard changes'}).click();await expect(detail).toContainText('Identity Design QA');await expect(detail.getByRole('button',{name:'Edit',exact:true})).toBeFocused();
 phase='stale mutation rejected and refreshed';await detail.getByRole('button',{name:'Edit',exact:true}).click();await dialog.getByLabel('Full name',{exact:true}).fill('Stale overwrite');let user=(await api('GET','/api/users')).users.find(u=>u.id===id);await api('PATCH','/api/users',{...user,name:'Identity Design QA updated',expectedRevision:user.revision});const stale=page.waitForResponse(r=>r.url().endsWith('/api/users')&&r.request().method()==='PATCH');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();assert.equal((await stale).status(),409);await expect(detail).toContainText('Identity Design QA updated');
 phase='failed reads block mutations';await page.route('**/api/users',route=>route.request().method()==='GET'?route.fulfill({status:503,json:{}}):route.continue());await button('Refresh').click();await expect(desk.getByRole('alert')).toContainText('could not be loaded');await expect(button('Add user')).toBeDisabled();await expect(desk.locator('.iad-user-select')).toHaveCount(0);await page.unroute('**/api/users');await button('Refresh').click();await desk.locator('.iad-user-select').filter({hasText:email}).click();
 phase='TR/EN light/dark desktop/mobile';
 for(const lang of ['tr','en'])for(const theme of ['light','dark'])for(const width of [1536,390]){
  await page.setViewportSize({width,height:1024});await switchQaLocale(page,lang);
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
  await waitForQaIdle(page);await expect(detail).toContainText('Identity Design QA updated');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`page overflow ${lang}/${theme}/${width}`);
  const tabs=await desk.locator('.iad-tabs button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...tabs)-Math.min(...tabs)<3,'local tabs must stay horizontal');
  await capture(`desk-${lang}-${theme}-${width}`);
 }
 await page.setViewportSize({width:1536,height:1024});await switchQaLocale(page,'en');
 if(await page.locator('html').getAttribute('data-theme')!=='light')await page.locator('.theme-toggle:visible').click();
 await button('Roles & scope').click();await expect(detail.locator('.iad-permissions>div')).toHaveCount(8);await capture('scope-EN');
 phase='corporate profile persistence and honest metadata check';await button('Corporate sign-in').click();const profile=desk.locator('.iad-profile');
 await expect(profile).toContainText('Native OIDC/SAML login, MFA and SCIM are not enabled');
 await profile.getByLabel('Issuer URL',{exact:true}).fill('https://idp.example.test');await profile.getByLabel('Client ID',{exact:true}).fill('qa-client');await profile.getByLabel('Client secret / Bind secret',{exact:true}).fill('synthetic-qa-profile-secret');
 // View switches keep the unsaved draft; explicit refresh asks before discarding it.
 await button('Users').click();await button('Corporate sign-in').click();await expect(profile.getByLabel('Client ID',{exact:true})).toHaveValue('qa-client');await button('Refresh profile').click();await expect(profile).toContainText('Refreshing discards unsaved profile changes');await profile.getByRole('button',{name:'Keep editing'}).click();
 const save=page.waitForResponse(r=>r.url().endsWith('/api/integrations')&&r.request().method()==='PUT');await button('Save profile').click();assert.equal((await save).status(),200);await expect(profile).toContainText('Profile saved. This does not enable SSO sign-in.');await expect(profile.getByLabel('Client secret / Bind secret')).toHaveValue('');
 let row=(await api('GET','/api/integrations')).integrations.find(p=>p.kind==='identity');assert.equal(row.hasSecret,true);assert.equal(JSON.stringify(row).includes('synthetic-qa-profile-secret'),false);assert.equal(row.enabled,false);
 await page.route('**/api/integrations',route=>route.request().method()==='POST'?route.fulfill({json:{ok:true,message:'Simulated discovery response'}}):route.continue());await button('Metadata / bridge check').click();await expect(profile).toContainText('User sign-in, role and MFA remain unverified');await page.unroute('**/api/integrations');
 await capture('profile-preflight-EN');
 phase='profile dirty guards and failed reads';await profile.getByLabel('Client ID',{exact:true}).fill('unsaved-client');await expect(button('Metadata / bridge check')).toBeDisabled();await button('Refresh profile').click();await button('Discard and refresh').click();await expect(profile.getByLabel('Client ID',{exact:true})).toHaveValue('qa-client');
 await page.route('**/api/integrations',route=>route.request().method()==='GET'?route.fulfill({status:503,json:{}}):route.continue());await button('Refresh profile').click();await expect(profile.getByRole('alert')).toContainText('could not be verified');await expect(button('Save profile')).toBeDisabled();await expect(button('Metadata / bridge check')).toBeDisabled();await page.unroute('**/api/integrations');await button('Refresh profile').click();await expect(profile.getByLabel('Client ID',{exact:true})).toHaveValue('qa-client');
 phase='provider switch does not reuse secrets';await profile.getByLabel('Provider',{exact:true}).selectOption('saml');await expect(profile.getByLabel('Client secret / Bind secret')).toHaveValue('');await profile.getByLabel('IdP metadata URL',{exact:true}).fill('https://idp.example.test/metadata');await button('Save profile').click();await expect(profile).toContainText('Profile saved. This does not enable SSO sign-in.');row=(await api('GET','/api/integrations')).integrations.find(p=>p.kind==='identity');assert.equal(row.provider,'saml');assert.equal(row.hasSecret,false);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await capture('profile-mobile-EN');
 assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({result:'passed',checks:['filter and selection integrity','dirty dialogs and focus restoration','stale mutation rejected','read failures block mutation','8 bilingual theme layouts','module permission matrix','profile persistence and credential redaction','dirty profile and failed-read recovery','provider switch clears stored secret'],providerVerification:'Preflight result simulated. No real SSO, MFA or SCIM test.',screenshots,errors},null,2));console.log('IDENTITY_ACCESS_DESK_QA_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/failure.json`,JSON.stringify({phase,error:error.message,errors},null,2));throw error;}
finally{if(id){const user=(await api('GET','/api/users')).users.find(u=>u.id===id);if(user)await api('DELETE','/api/users',{id,email,expectedRevision:user.revision});}await browser.close();}
