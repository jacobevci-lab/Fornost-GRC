import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Fixed loopback origin: these account and record mutations must never target production.
const base='http://127.0.0.1:4173',out='module-access-qa-artifacts',password='Fornost-QA!2026-Branch';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext({viewport:{width:1536,height:960}}),restricted=await browser.newContext({viewport:{width:1536,height:960}});
const page=await admin.newPage(),userPage=await restricted.newPage();page.setDefaultTimeout(15000);userPage.setDefaultTimeout(15000);
const errors=[];for(const p of [page,userPage])p.on('pageerror',error=>errors.push(error.message));
let checks=0;const created=[];
async function api(context,path,method='GET',data,expected=200){const response=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(response.status(),expected,`${method} ${path}: ${await response.text()}`);checks++;return response.json().catch(()=>null);}
const login=(context,email)=>api(context,'/api/auth','POST',{action:'login',email,password});
const email='qa-module-editor@fornost.test';
try{
 await login(admin,'qa-admin@fornost.test');
 const all=(await api(admin,'/api/grc')).rows;
 const access={mode:'scoped',modules:{'Risk Assessment':'write',BIA:'read'}};
 await api(admin,'/api/users','POST',{name:'QA Module Editor',email,password,role:'Editor',moduleAccess:access},201);
 const users=await api(admin,'/api/users'),user=users.users.find(x=>x.email===email);assert.deepEqual(user.moduleAccess,access);
 await login(restricted,email);
 const scoped=(await api(restricted,'/api/grc')).rows;assert.ok(scoped.length);assert.ok(scoped.every(row=>['Risk Assessment','BIA'].includes(row.module)));
 const risk=all.find(row=>row.module==='Risk Assessment'),bia=all.find(row=>row.module==='BIA'),hidden=all.find(row=>row.module==='Kanıtlar');
 const riskData={...JSON.parse(risk.data_json),title:'QA Scoped Risk'};
 const record=await api(restricted,'/api/grc','POST',{module:'Risk Assessment',data:riskData},201);created.push(record.id);
 await api(restricted,'/api/grc','PATCH',{id:record.id,data:{...riskData,title:'QA Scoped Risk Updated'}});
 await api(restricted,'/api/grc','PATCH',{id:bia.id,module:'Risk Assessment',data:JSON.parse(bia.data_json)},403);
 await api(restricted,'/api/grc','PATCH',{id:hidden.id,module:'Risk Assessment',data:{}},403);
 for(const body of [{module:'BIA',data:{}},{module:'BIA',rows:[{}]},{module:'Kanıtlar',data:{}}])await api(restricted,'/api/grc','POST',body,403);
 await api(restricted,`/api/grc?id=${record.id}`,'DELETE',undefined,403);
 for(const path of ['/api/evidence?key=evidence/hidden','/api/evidence/history','/api/audits','/api/third-party-risk','/api/findings','/api/executive-metrics','/api/continuous-assurance/dashboard','/api/evidence-automation','/api/ai/drafts','/api/ai/agents','/api/users'])await api(restricted,path,'GET',undefined,403);
 await api(restricted,"/api/ai/knowledge/search","POST",{query:"risk"},403);
 await api(restricted,`/api/ai/source-target?sourceId=${encodeURIComponent(hidden.id)}`,'GET',undefined,404);
 await api(restricted,`/api/ai/source-target?sourceId=${encodeURIComponent(risk.id)}`);
 const status=await api(restricted,'/api/ai/status');assert.equal(status.moduleScope,'scoped');assert.equal(status.capabilities.agents,false);assert.equal(status.capabilities.retrieval,false);
 await userPage.goto(base);await expect(userPage.locator('.shell[data-module-scope="scoped"]')).toBeVisible();
 await userPage.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await expect(userPage.locator('.module-scope-home')).toContainText('My workspace');await expect(userPage.locator('nav button[aria-label="Reporting"]')).toHaveCount(0);await expect(userPage.locator('nav button[aria-label="Evidence Library"]')).toHaveCount(0);
 await userPage.locator('nav button[aria-label="Business Impact Analysis (BIA)"]').evaluate(el=>el.click());await expect(userPage.locator('.module-head')).toContainText('BIA');await expect(userPage.locator('.module-head .primary')).toHaveCount(0);
 await userPage.locator('nav button[aria-label="Risk Assessment"]').evaluate(el=>el.click());await expect(userPage.locator('.module-head .primary')).toBeVisible();
 await userPage.locator('.context-ai-trigger').click();await expect(userPage.locator('#fornost-ai-panel')).toBeVisible();await expect(userPage.locator('.fornost-ai-tabs')).toHaveCount(0);await expect(userPage.locator('#fornost-ai-panel')).toContainText('izinli modüllerdeki');await userPage.getByRole('button',{name:'Kapat',exact:true}).click();
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Identity & Access"]').evaluate(el=>el.click());
 const row=page.locator('.local-user-list>div').filter({hasText:email}),editor=row.locator('.module-access-editor');await editor.locator('summary').click();await expect(editor.getByLabel('Access: Risk Assessment',{exact:true})).toHaveValue('write');
 for(const theme of ['light','dark']){
  for(const p of [page,userPage])await p.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);
  for(const width of [1536,390]){
   for(const p of [page,userPage])await p.setViewportSize({width,height:960});
   await editor.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/editor-${theme}-${width}.png`});
   assert.ok(await userPage.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await userPage.screenshot({path:`${out}/scoped-risk-${theme}-${width}.png`});
  }
 }
 await page.setViewportSize({width:1536,height:960});await editor.getByLabel('Access: Risk Assessment',{exact:true}).selectOption('read');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/users')&&r.request().method()==='PATCH');await row.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await saved).status(),200);
 await api(restricted,'/api/grc','GET',undefined,401);await login(restricted,email);await api(restricted,'/api/grc','POST',{module:'Risk Assessment',data:riskData},403);
 const after=await api(admin,'/api/users');assert.ok(after.events.some(event=>event.user_id===user.id&&JSON.parse(event.after_json).moduleAccess.modules['Risk Assessment']==='read'));
 // Check every register through the real scoped read path and UI, including audit and vendor fallback.
 for(const moduleName of ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Tedarikçiler','Kontroller','Kanıtlar','Denetim Yönetimi']){
  await api(admin,'/api/users','PATCH',{id:user.id,role:'Editor',status:'Active',moduleAccess:{mode:'scoped',modules:{[moduleName]:'read'}}});await login(restricted,email);
  const result=(await api(restricted,'/api/grc')).rows;assert.ok(result.length,moduleName);assert.ok(result.every(row=>row.module===moduleName),moduleName);
  await userPage.reload();await expect(userPage.locator('.module-scope-cards button')).toHaveCount(1);await userPage.locator('.module-scope-cards button').click();await expect(userPage.locator('.module-scope-home')).toHaveCount(0);
  if(moduleName==='Denetim Yönetimi')await api(restricted,'/api/audits');
  if(moduleName==='Kanıtlar'){await api(restricted,'/api/evidence/history');await api(restricted,'/api/evidence?key=evidence/not-found','GET',undefined,404);}
 }
 await api(admin,'/api/users','PATCH',{id:user.id,role:'Viewer',status:'Active',moduleAccess:{mode:'scoped',modules:{'Risk Assessment':'write'}}});await login(restricted,email);await api(restricted,'/api/grc','POST',{module:'Risk Assessment',data:riskData},403);
 await api(admin,'/api/users','PATCH',{id:user.id,role:'Editor',status:'Active',moduleAccess:{mode:'scoped',modules:{}}});await login(restricted,email);assert.deepEqual((await api(restricted,'/api/grc')).rows,[]);
 await api(admin,'/api/users','PATCH',{id:user.id,role:'Editor',status:'Active',moduleAccess:{mode:'scoped',modules:{BIA:'admin'}}},400);
 await api(admin,'/api/users','PATCH',{id:user.id,role:'Editor',status:'Active',moduleAccess:{mode:'full'}});await login(restricted,email);assert.equal((await api(restricted,'/api/auth')).user.moduleAccess.mode,'full');await api(restricted,'/api/ai/drafts');
 await api(admin,'/api/users','PATCH',{id:user.id,role:'Editor',status:'Disabled',moduleAccess:{mode:'full'}});await api(restricted,'/api/grc','GET',undefined,401);
 for(const id of created)await api(admin,`/api/grc?id=${id}`,'DELETE');
 assert.deepEqual(errors,[]);console.log(`MODULE_ACCESS_QA_PASS: ${checks} real API checks, 8 scoped registers, grant editor/save/readback, session revocation, role ceilings and both themes at desktop/mobile`);
}catch(error){await page.screenshot({path:`${out}/admin-failure.png`}).catch(()=>{});await userPage.screenshot({path:`${out}/user-failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
