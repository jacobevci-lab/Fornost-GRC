import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {createQaContext,openQaModule,switchQaLocale} from './qa-browser-harness.mjs';
import {qaPassword} from './qa-credentials.mjs';
const production=process.argv.includes('--production');
const base=production?'https://app.fornostsecurity.com':'http://127.0.0.1:4173';
const headers=production&&process.env.CF_ACCESS_CLIENT_ID?{'CF-Access-Client-Id':process.env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':process.env.CF_ACCESS_CLIENT_SECRET}:{};
const email=production?process.env.FORNOST_SMOKE_EMAIL:'qa-admin@fornost.test',password=production?process.env.FORNOST_SMOKE_PASSWORD:qaPassword();
assert.ok(email&&password);
const prefix='QA-EVIDENCE-FIX-'+randomUUID(),owned=[],results=[],errors=[];
const output='evidence-integrity-qa-artifacts';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,headers,{viewport:{width:1536,height:960}});
let page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
const file={name:prefix+'.txt',mimeType:'text/plain',buffer:Buffer.from('Disposable Fornost evidence QA. No customer data.')};
async function api(path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,data,headers:{origin:base,...headers},timeout:20000});assert.equal(r.status(),status,`${method} ${path}: ${r.status()}`);return r.json()}
async function list(){return (await api('/api/grc')).rows}
async function upload(multipart,path='/api/evidence',status=201){const r=await context.request.post(base+path,{headers:{origin:base,...headers},multipart:{file,...multipart}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);const data=await r.json();if(path==='/api/evidence'&&status===201)owned.push(data.id);return data}
async function download(key,status=200,inline=false){const r=await context.request.get(base+`/api/evidence?key=${encodeURIComponent(key)}${inline?'&inline=1':''}`,{headers});assert.equal(r.status(),status);if(status===200)assert.deepEqual(await r.body(),file.buffer)}
async function step(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name)}
let evidenceId,controlId,keys=[];
try{
 if(production)assert.equal((await api('/api/health')).revision,process.env.FORNOST_EXPECTED_REVISION);
 await step('Sign in through the live browser login form',async()=>{
  await page.goto(base,{waitUntil:'domcontentloaded'});const login=page.locator('.auth-card');await expect(login).toBeVisible();
  await login.locator('[name=email]').fill(email);await login.locator('[name=password]').fill(password);
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth'&&r.request().method()==='POST');
  await login.locator('button.primary').click();assert.equal((await pending).status(),200);await expect(page.locator('.shell')).toBeVisible();await switchQaLocale(page,'en');
 });
 const control=await api('/api/grc','POST',{module:'Kontroller',data:{controlRef:prefix,controlTitle:prefix,owner:'QA',frequency:'Yıllık',implementation:'QA verification',status:'Taslak'}},201);controlId=control.id;owned.push(controlId);
 await openQaModule(page,'Evidence Library');await page.locator('.actions .primary').first().click();const form=page.locator('.record-dialog');
 await form.locator('input[type=file]').setInputFiles(file);
 for(const [name,value] of Object.entries({evidenceTitle:prefix,controlRef:'CTL-999999999',owner:'QA',period:'2026'}))await form.locator(`[name=${name}]`).fill(value);
 await step('Browser upload rejects a missing canonical control without a record',async()=>{
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/evidence'&&r.request().method()==='POST');await form.locator('.form-actions .primary').click();assert.equal((await pending).status(),422);await expect(form).toBeVisible();assert.ok(!(await list()).some(r=>JSON.parse(r.data_json).evidenceTitle===prefix));
 });
 await step('Valid browser upload receives a persistent short EVD code',async()=>{
  await form.locator('[name=controlRef]').fill(control.code);const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/evidence'&&r.request().method()==='POST');await form.locator('.form-actions .primary').click();const response=await pending;assert.equal(response.status(),201);const created=await response.json();evidenceId=created.id;owned.push(evidenceId);assert.match(created.code,/^EVD-\d{3,}$/);await expect(form).toBeHidden();
  const row=(await list()).find(r=>r.id===evidenceId);assert.equal(row.record_code,created.code);keys.push(JSON.parse(row.data_json).fileKey);await download(keys[0]);
  await page.getByPlaceholder('Search records...',{exact:true}).fill(prefix);await expect(page.getByRole('row').filter({hasText:prefix})).toContainText(created.code);await page.screenshot({path:output+'/short-code.png'});
 });
 await step('Version upload rejects new invalid and wrong-module links without changing history',async()=>{
  for(const refs of ['ctl-999999999',`${control.code}; AST-999999999`])await upload({evidenceId,changeNote:'Invalid reference check',controlRefs:refs},'/api/evidence/history',422);
  assert.equal((await api('/api/evidence/history?id='+evidenceId)).versions.length,1);
 });
 await step('Active current and historic file downloads survive a valid new version',async()=>{
  await upload({evidenceId,changeNote:'Second verified test version',controlRefs:control.code},'/api/evidence/history');
  const history=await api('/api/evidence/history?id='+evidenceId);assert.equal(history.versions.length,2);assert.equal(history.integrity.state,'verified');keys=history.versions.map(v=>v.fileKey);for(const key of keys){await download(key);await download(key,200,true)}
 });
 await step('Deleting through the browser revokes all versions while retaining history',async()=>{
  await page.close();page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'domcontentloaded'});await expect(page.locator('.shell')).toBeVisible();await switchQaLocale(page,'en');await openQaModule(page,'Evidence Library');await page.getByPlaceholder('Search records...',{exact:true}).fill(prefix);const row=page.getByRole('row').filter({hasText:prefix});
  page.once('dialog',d=>d.accept());const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/grc'&&r.request().method()==='DELETE');await row.getByRole('button',{name:'Delete',exact:true}).click();assert.equal((await pending).status(),200);await expect(row).toHaveCount(0);assert.ok(!(await list()).some(r=>r.id===evidenceId));
  for(const key of keys){await download(key,404);await download(key,404,true)}
  const retained=await api('/api/evidence/history?controlRef='+encodeURIComponent(control.code));assert.equal(retained.timeline.filter(v=>v.evidenceId===evidenceId).length,2);assert.ok(retained.timeline.filter(v=>v.evidenceId===evidenceId).every(v=>v.recordAvailable===false));
 });
 await step('Copied orphan file keys cannot revive deleted-owner access',async()=>{
  const other=await upload({evidenceTitle:prefix+' copy',controlRef:control.code,owner:'QA',period:'2026'});const row=(await list()).find(r=>r.id===other.id);await api('/api/grc','PATCH',{id:other.id,expectedUpdatedAt:row.updated_at,data:{...JSON.parse(row.data_json),fileKey:keys[0]}});await download(keys[0],404);
 });
 await step('Unauthenticated file access remains denied',async()=>{const anon=await createQaContext(browser,base,headers);const r=await anon.request.get(base+'/api/evidence?key='+encodeURIComponent(keys[0]),{headers});assert.equal(r.status(),401);await anon.close()});
 assert.deepEqual(errors,[]);
}catch(error){results.push({name:'failure',status:'failed',error:error.message});await page.screenshot({path:output+'/failure.png'}).catch(()=>{});process.exitCode=1;
}finally{
 for(const id of owned.reverse())try{if((await list()).some(r=>r.id===id))await api('/api/grc?id='+encodeURIComponent(id),'DELETE');assert.ok(!(await list()).some(r=>r.id===id))}catch(error){results.push({name:'cleanup',status:'failed',id,error:error.message});process.exitCode=1}
 await writeFile(output+'/report.json',JSON.stringify({environment:production?'production':'isolated',revision:process.env.FORNOST_EXPECTED_REVISION,results,pageErrors:errors},null,2));console.log('EVIDENCE_FIX_QA',JSON.stringify(results));await browser.close();
}
