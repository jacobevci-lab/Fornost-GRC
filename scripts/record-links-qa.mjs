import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='record-links-qa-artifacts',stamp=Date.now();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext({viewport:{width:1440,height:960},permissions:['clipboard-read','clipboard-write']}),reader=await browser.newContext();
const page=await admin.newPage(),peer=await reader.newPage(),created=[],errors=[],checks=[];let user,settings;
for(const p of [page,peer]){p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));}
const fragment=t=>'#fornost-record?'+new URLSearchParams(t);
const endpoint=t=>'/api/record-links?'+new URLSearchParams(t);
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,await r.text());return r.json();}
async function english(p){await expect(p.locator('.shell')).toBeVisible();await p.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();}
try{
 await mkdir(out,{recursive:true});await api(admin,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const seeds=(await api(admin,'/api/grc')).rows;
 const keys={'Risk Assessment':'title',BIA:'process','Varlık Envanteri':'title',Uyum:'controlTitle','Tedarikçiler':'title',Kontroller:'controlTitle',Kanıtlar:'evidenceTitle','Denetim Yönetimi':'requirementTitle'};
 for(const [module,titleKey]of Object.entries(keys)){
  const seed=seeds.find(r=>r.module===module);assert.ok(seed,module);const title=`QA Link ${stamp} ${module}`,data={...JSON.parse(seed.data_json),[titleKey]:title,owner:`QA Link ${stamp}`};if(module==='Kontroller')data.controlRef=`QA-LINK-${stamp}`;
  // A preceding lifecycle scenario may leave an offboarded vendor. This is a new register intake.
  if(module==='Tedarikçiler')data.status='Aktif';
  // Audit seeds can retain historical links from earlier isolated scenarios. New intake
  // must use this scenario's live targets; do not relax the application's reference guard.
  if(module==='Denetim Yönetimi')Object.assign(data,{biaRef:'',controlRef:created.find(r=>r.module==='Kontroller').id,requirementRef:created.find(r=>r.module==='Uyum').id,riskRef:created.find(r=>r.module==='Risk Assessment').id,evidenceRef:created.find(r=>r.module==='Kanıtlar').id});
  const row=await api(admin,'/api/grc','POST',{module,data},201);created.push({...row,module,title,target:{module,kind:'record',ref:row.id}});
 }
 await page.goto(base);await english(page);
 for(const row of created){
  assert.deepEqual((await api(admin,endpoint(row.target))).target,row.target);
  await page.goto(base+'/'+fragment(row.target));const focus=page.locator('.core-record-focus:not(.record-link-entry)');if(row.module==='Tedarikçiler'){await expect(page.locator('.tprm-page .enterprise-work-focus')).toContainText(row.id);await expect(page.locator('.tprm-page .table-wrap tbody')).toContainText(row.title);await page.locator('.tprm-page').getByRole('button',{name:'Copy record link',exact:true}).click();}else{await expect(focus).toContainText(row.code);await expect(focus).toContainText('Selected record');await focus.getByRole('button',{name:'Copy record link',exact:true}).click();}assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),base+'/'+fragment(row.target));
 }
 checks.push('eight real registers: authorized resolve, exact focus and copied link round-trip');
 const bia=created.find(r=>r.module==='BIA'),hidden=created.find(r=>r.module==='Kanıtlar');
 const email=`qa-links-${stamp}@fornost.test`;await api(admin,'/api/users','POST',{name:'QA Link Reader',email,password:qaPassword(),role:'Viewer',moduleAccess:{mode:'scoped',modules:{BIA:'read'}}},201);user=(await api(admin,'/api/users')).users.find(u=>u.email===email);
 await api(reader,endpoint(bia.target),'GET',undefined,401);
 await peer.goto(base+'/'+fragment(bia.target));await expect(peer.locator('.auth-card')).toBeVisible();await peer.locator('input[name="email"]').fill(email);await peer.locator('input[name="password"]').fill(qaPassword());await peer.getByRole('button',{name:'Giriş Yap',exact:true}).click();await english(peer);await expect(peer.locator('.core-record-focus:not(.record-link-entry)')).toContainText(bia.code);
 await api(reader,endpoint(hidden.target),'GET',undefined,404);await peer.goto(base+'/'+fragment(hidden.target));await expect(peer.locator('.record-link-entry')).toContainText('access is unavailable');await expect(peer.locator('.record-link-entry')).not.toContainText(hidden.title);
 checks.push('local sign-in retains link; scoped viewer can read only assigned module; forbidden target is uniformly unavailable');
 await page.goto(base+'/'+fragment(bia.target)+'&ref=OTHER');await expect(page.locator('.record-link-entry')).toContainText('Invalid record link');
 let fail=true;await page.route('**/api/record-links?**',route=>fail?route.fulfill({status:503,contentType:'application/json',body:'{"error":"retry"}'}):route.continue());
 await page.goto(base+'/'+fragment(bia.target));await expect(page.locator('.record-link-entry')).toContainText('could not be verified');fail=false;await page.locator('.record-link-entry').getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.core-record-focus:not(.record-link-entry)')).toContainText(bia.code);await page.unroute('**/api/record-links?**');
 checks.push('malformed duplicate references rejected and transient resolver failure recovers without losing target');
 await page.evaluate(()=>{const original=window.fetch;window.qaLinkFetch=original;window.fetch=(input,init)=>String(input).includes('/api/record-links?')?new Promise(resolve=>{window.qaReleaseLink=resolve;init?.signal?.addEventListener('abort',()=>{window.qaLinkAborted=true;});}):original(input,init);});
 await page.goto(base+'/'+fragment(bia.target));await expect(page.locator('.record-link-entry')).toContainText('Verifying linked record');
 await page.locator('nav button[aria-label="My Work"]').evaluate(el=>el.click());await expect(page.locator('main>header h1')).toHaveText('My Work');
 assert.equal(await page.evaluate(()=>window.qaLinkAborted),true);
 await page.evaluate(async target=>{window.fetch=window.qaLinkFetch;window.qaReleaseLink(new Response(JSON.stringify({target}),{status:200}));await new Promise(resolve=>setTimeout(resolve,0));},bia.target);
 await expect(page.locator('main>header h1')).toHaveText('My Work');await expect(page.locator('.record-link-entry')).toHaveCount(0);assert.equal(new URL(page.url()).hash,'');
 checks.push('new menu navigation cancels pending record links and ignores late resolver responses');
 await page.goto(base+'/'+fragment(bia.target));await expect(page.locator('.core-record-focus:not(.record-link-entry)')).toContainText(bia.code);

 for(const lang of ['EN','TR']){await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();for(const theme of ['light','dark'])for(const width of [1440,390]){await page.setViewportSize({width,height:960});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:`${out}/${lang}-${theme}-${width}.png`,fullPage:true});}}
 const violations=(await new AxeBuilder({page}).include('.core-record-focus').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations;assert.deepEqual(violations,[]);
 await page.setViewportSize({width:1440,height:960});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 settings=(await api(admin,'/api/integrations')).integrations.find(r=>r.kind==='email')||{provider:'smtp-bridge',enabled:false,config:{}};
 await api(admin,'/api/integrations','PUT',{kind:'email',provider:settings.provider,enabled:false,config:{...settings.config,applicationUrl:'https://grc.example.test/fornost-grc/'},secret:''});
 await page.locator('nav button[aria-label="Email & Notifications"]').evaluate(e=>e.click());await expect(page.getByLabel('Application URL (task links)',{exact:true})).toHaveValue('https://grc.example.test/fornost-grc/');
 await page.getByLabel('Application URL (task links)',{exact:true}).fill('https://grc.example.test:8443/fornost-grc/');await page.locator('.integration-card').getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.integration-message')).toContainText('saved securely');assert.equal((await api(admin,'/api/integrations')).integrations.find(r=>r.kind==='email').config.applicationUrl,'https://grc.example.test:8443/fornost-grc/');
 await api(admin,'/api/integrations','PUT',{kind:'email',provider:settings.provider,enabled:false,config:{...settings.config,applicationUrl:'https://user:secret@grc.example.test/'}},400);
 checks.push('email installation URL UI persistence and credential-bearing URL rejection; no external email sent');
 await api(admin,`/api/grc?id=${bia.id}`,'DELETE');bia.deleted=true;await page.goto(base+'/'+fragment(bia.target));await expect(page.locator('.record-link-entry')).toContainText('Record not found');
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks,errors},null,2));console.log('RECORD_LINKS_QA_PASS: '+checks.join('; '));
}catch(e){await writeFile(`${out}/failure.json`,JSON.stringify({message:e.message,stack:e.stack,checks,errors},null,2));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await peer.screenshot({path:`${out}/reader-failure.png`,fullPage:true}).catch(()=>{});throw e;}
finally{try{if(settings)await api(admin,'/api/integrations','PUT',{kind:'email',provider:settings.provider,enabled:settings.enabled,config:settings.config,secret:''});for(const row of [...created].reverse())if(!row.deleted)await api(admin,`/api/grc?id=${row.id}`,'DELETE');if(user)await api(admin,'/api/users','PATCH',{id:user.id,role:'Viewer',status:'Disabled'});await writeFile(`${out}/cleanup.json`,JSON.stringify({recordsDeleted:created.length,accountDisabled:!!user,emailRestored:!!settings}));}finally{await browser.close();}}
