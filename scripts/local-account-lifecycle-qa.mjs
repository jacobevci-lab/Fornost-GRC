import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {createQaContext,openQaModule,switchQaLocale} from './qa-browser-harness.mjs';
import {qaPassword} from './qa-credentials.mjs';

const production=process.argv.includes('--production');
const origin=production?new URL(process.env.FORNOST_PROD_URL).origin:'http://127.0.0.1:4173';
if(production&&origin!=='https://app.fornostsecurity.com')throw Error('Unexpected production QA origin');
const access={};
if(production&&process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET){
 access['CF-Access-Client-Id']=process.env.CF_ACCESS_CLIENT_ID;access['CF-Access-Client-Secret']=process.env.CF_ACCESS_CLIENT_SECRET;
}
const adminEmail=production?process.env.FORNOST_SMOKE_EMAIL:'qa-admin@fornost.test';
const adminPassword=production?process.env.FORNOST_SMOKE_PASSWORD:qaPassword();
assert.ok(adminEmail&&adminPassword,'QA administrator is required');
const email='qa-local-'+randomUUID()+'@fornost.test',secret='Qa1!'+randomBytes(24).toString('hex');
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await createQaContext(browser,origin,access,{viewport:{width:1440,height:960}});
const subject=await createQaContext(browser,origin,access,{});
const page=await admin.newPage();page.setDefaultTimeout(20000);
async function api(ctx,path,method='GET',data){
 return ctx.request.fetch(origin+path,{method,data,headers:{origin,...access},maxRedirects:0,timeout:15000});
}
async function login(ctx,address,password){return (await api(ctx,'/api/auth','POST',{action:'login',email:address,password})).status();}
async function owned(){
 const r=await api(admin,'/api/users');assert.equal(r.status(),200);
 return (await r.json()).users.find(u=>u.email===email);
}
async function clickWrite(control,method,expected){
 const pending=page.waitForResponse(r=>r.url()===origin+'/api/users'&&r.request().method()===method);
 await control.click();const r=await pending;assert.equal(r.status(),expected,method+' local account');
 return r.json();
}
let attempted=false,id,phase="admin sign-in";
try{
 assert.equal(await login(admin,adminEmail,adminPassword),200);
 phase="open identity management";await page.goto(origin);await expect(page.locator('.shell')).toBeVisible();
 await switchQaLocale(page,'en');await openQaModule(page,'Identity & Access');
 phase="create scoped local account";const section=page.locator('.iad'),detail=section.locator('.iad-detail');
 await section.getByRole('button',{name:'Add user',exact:true}).click();
 const form=page.locator('.iad-dialog form');
 await expect(form.locator('input[name="name"]')).toBeVisible();
 await form.locator('[name=name]').fill('QA disposable account');await form.locator('[name=email]').fill(email);
 await form.locator('[name=password]').fill(secret);
 const grants=form.locator('.module-access-editor');await grants.locator('summary').click();
 await grants.getByLabel('Access scope',{exact:true}).selectOption('scoped');
 await grants.getByLabel('Access: BIA',{exact:true}).selectOption('read');
 attempted=true;
 id=(await clickWrite(form.getByRole('button',{name:'Create account'}),'POST',201)).id;
 assert.equal((await owned()).id,id);
 assert.equal(await login(subject,email,secret),200);
 phase="change display name, role and module scope";
 await expect(detail).toContainText(email);await detail.getByRole('button',{name:'Edit',exact:true}).click();
 await form.getByLabel('Full name',{exact:true}).fill('QA renamed account');
 await form.getByLabel('Role',{exact:true}).selectOption('Editor');
 const rowGrants=form.locator('.module-access-editor');await rowGrants.locator('summary').click();
 await rowGrants.getByLabel('Access: BIA',{exact:true}).selectOption('none');
 await rowGrants.getByLabel('Access: Asset Inventory',{exact:true}).selectOption('read');
 await clickWrite(form.getByRole('button',{name:'Save changes',exact:true}),'PATCH',200);
 await expect(detail.getByRole('heading',{name:'QA renamed account'})).toBeVisible();
 assert.equal((await api(subject,'/api/grc')).status(),401,'old session after access change');
 assert.equal(await login(subject,email,secret),200);
 const updated=(await (await api(subject,'/api/auth')).json()).user;
 assert.equal(updated.role,'Editor');assert.deepEqual(updated.moduleAccess,{mode:'scoped',modules:{'Varlık Envanteri':'read'}});
 phase="disable and reactivate";await detail.getByRole('button',{name:'Disable account',exact:true}).click();
 const confirm=detail.getByRole('group',{name:'Confirm account action'});
 await clickWrite(confirm.getByRole('button',{name:'Confirm action'}),'PATCH',200);
 assert.equal(await login(subject,email,secret),401);
 await expect(detail.getByRole('button',{name:'Activate account',exact:true})).toBeVisible();
 await detail.getByRole('button',{name:'Activate account',exact:true}).click();
 await clickWrite(confirm.getByRole('button',{name:'Confirm action'}),'PATCH',200);
 assert.equal(await login(subject,email,secret),200);
 phase="cancel and confirm deletion on mobile";const del=detail.getByRole('button',{name:'Delete account',exact:true});
 await del.click();await expect(confirm).toContainText(email);
 await confirm.getByRole('button',{name:'Cancel'}).click();assert.equal((await owned()).id,id);
 await page.setViewportSize({width:390,height:844});await del.click();
 await expect(confirm.getByRole('button',{name:'Confirm action'})).toBeDisabled();
 await confirm.getByLabel('Type the email address to confirm').fill(email);
 await clickWrite(confirm.getByRole('button',{name:'Confirm action'}),'DELETE',200);
 await expect(section.locator('.iad-user-select').filter({hasText:email})).toHaveCount(0);assert.equal((await api(subject,'/api/grc')).status(),401);
 assert.equal(await login(subject,email,secret),401);
 phase="verify retained audit";await section.getByRole('button',{name:'Access history',exact:true}).click();
 await expect(section.locator('.iad-history li').filter({hasText:'Local account deleted'}).filter({hasText:email})).toHaveCount(1);
 console.log('PASS create, rename, scoped permissions, session invalidation, disable, reactivate, cancel deletion, mobile delete, audit and denied re-login');
}catch(error){console.error("Local account browser QA stage:",phase);throw error;}finally{
 try{
  if(attempted){
   const row=await owned();
   if(row){
    assert.ok(row.email===email&&(!id||row.id===id),'cleanup identity mismatch');
    const deleted=await api(admin,'/api/users','DELETE',{id:row.id,email,expectedRevision:row.revision});
    if(deleted.status()!==200){
     const live=await owned();
     if(live&&live.id===row.id)await api(admin,'/api/users','PATCH',{id:live.id,role:'Viewer',status:'Disabled',moduleAccess:{mode:'scoped',modules:{}}});
    }
   }
   assert.equal(await owned(),undefined,'disposable QA account still exists');
   console.log('PASS cleanup verified; access audit retained');
  }
 }finally{await browser.close();}
}
