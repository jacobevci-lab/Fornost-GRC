import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='ai-model-lifecycle-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(20000);
const ids=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function sql(statement){const file=`${out}/fixture.sql`;await fs.writeFile(file,statement);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function call(method,data,expected=200){const response=await context.request.fetch(base+'/api/ai/models',{method,headers:{origin:base},data});assert.equal(response.status(),expected,await response.text());return response.json();}
const values={systemName:'QA lifecycle assistant',modelName:'QA local model',vendor:'Internal',purpose:'Validate governed model decision safety',owner:'qa-admin@fornost.test',deployment:'On-Prem',region:'TR',dataClassification:'Internal',autonomy:'Advisory',affectedUsers:1,impact:3,likelihood:3,dataSensitivity:3,autonomyRisk:2,controlMaturity:3,controls:'RBAC and human approval',reviewDate:'2027-01-01'};
const model=async id=>(await call('GET')).models.find(row=>row.id===id);
const decision=(id,status,version)=>({id,status,expectedUpdatedAt:version,note:'QA reviewed current model',confirmation:status==='approved'?'ONAYLA':'ASKIYA AL'});
async function failAudit(action){await sql(`CREATE TRIGGER qa_model_audit_failure BEFORE INSERT ON ai_activity_logs WHEN NEW.action=${q(action)} BEGIN SELECT RAISE(ABORT,'QA model audit failure'); END;`);}
const restoreAudit=()=>sql('DROP TRIGGER qa_model_audit_failure;');
try{
 assert.equal((await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}})).status(),200);
 const beforeCreate=(await call('GET')).models;await failAudit('model-inventory-create');await call('POST',values,503);assert.deepEqual((await call('GET')).models,beforeCreate);await restoreAudit();
 const {id}=await call('POST',values,201);ids.push(id);
 const original=await model(id);
 for(const [method,action,data] of [['PUT','model-inventory-edit',{...values,id,expectedUpdatedAt:original.updatedAt,systemName:'QA should roll back'}],['DELETE','model-inventory-delete',{id,expectedUpdatedAt:original.updatedAt,confirmation:'SİL'}]]){await failAudit(action);await call(method,data,503);assert.deepEqual(await model(id),original);await restoreAudit();}
 for(const [path,key] of [['models','models'],['assurance-alerts','alerts'],['findings','findings']]){
  const missing=await context.request.get(`${base}/api/ai/${path}?id=QA-missing-exact`);assert.equal(missing.status(),200);assert.deepEqual((await missing.json())[key],[]);
  const invalid=await context.request.get(`${base}/api/ai/${path}?id=one&id=two`);assert.equal(invalid.status(),400);
 }
 const exact=await context.request.get(`${base}/api/ai/models?id=${encodeURIComponent(id)}`);assert.equal(exact.status(),200);assert.deepEqual((await exact.json()).models.map(m=>m.id),[id]);

 await call('PATCH',decision(id,'approved',undefined),409);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el=>el.click());
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-loading','false');
 await page.locator('.cg-filters input').fill(id);
 await page.locator('.cg-detail>header').getByRole('button',{name:/Open record/}).click();
 const root=page.locator('.ai-model-inventory'),record=root.locator(`[data-record-id="${id}"]`);
 await expect(root.locator('.ai-record-focus')).toHaveAttribute('data-state','found');
 // A linked draft must remain available, including after an accepted delete confirmation.
 const measurementId=`QA-DELETE-GUARD-${crypto.randomUUID()}`;
 await sql(`INSERT INTO ai_model_monitoring(id,model_id,accuracy,error_rate,drift_score,bias_score,p95_latency_ms,sample_size,health,recorded_by,recorded_at) VALUES(${q(measurementId)},${q(id)},99,1,1,1,10,100,'healthy','QA',${q(new Date().toISOString())});`);
 await call('DELETE',{id,expectedUpdatedAt:original.updatedAt,confirmation:'SİL'},409);assert.deepEqual(await model(id),original);
 page.once('dialog',dialog=>dialog.accept());await record.getByRole('button',{name:'Sil',exact:true}).click();await expect(root.locator('.ai-inventory-notice')).toContainText('bağlı kayıtları var');await expect(record.getByRole('button',{name:'Düzenle',exact:true})).toBeEnabled();assert.deepEqual(await model(id),original);
 await sql(`DELETE FROM ai_model_monitoring WHERE id=${q(measurementId)};`);

 // Two editors cannot overwrite or delete a newer draft; the UI retains unsaved text.
 await record.getByRole('button',{name:'Düzenle',exact:true}).click();const form=root.locator('form');await form.locator('input').first().fill('QA local unsaved edit');
 await call('PUT',{...values,id,systemName:'QA newer editor',expectedUpdatedAt:original.updatedAt});
 await form.getByRole('button',{name:'Güncelle',exact:true}).click();await expect(root.locator('.ai-inventory-notice')).toContainText('Model değişti');await expect(form.locator('input').first()).toHaveValue('QA local unsaved edit');await expect(form.getByRole('button',{name:'Güncelle',exact:true})).toBeDisabled();
 await call('DELETE',{id,expectedUpdatedAt:original.updatedAt,confirmation:'SİL'},409);await call('PUT',{...values,id},409);
 await record.getByRole('button',{name:'Düzenle',exact:true}).click();await expect(form.locator('input').first()).toHaveValue('QA newer editor');await form.locator('input').first().fill('QA corrected draft');await form.getByRole('button',{name:'Güncelle',exact:true}).click();await expect(form).toHaveCount(0);await expect(record).toContainText('QA corrected draft');
 // Aborted writes must release busy state without replaying the request.
 let intercepted=0;const path='**/api/ai/models';await page.route(path,route=>{if(route.request().method()==='PUT'){intercepted++;return route.abort('failed');}return route.continue();});
 await record.getByRole('button',{name:'Düzenle',exact:true}).click();await form.getByRole('button',{name:'Güncelle',exact:true}).click();await expect(root.locator('.ai-inventory-notice')).toContainText('Kayıt sonucu doğrulanamadı');await expect(form.getByRole('button',{name:'Güncelle',exact:true})).toBeDisabled();await expect(record.getByRole('button',{name:'Düzenle',exact:true})).toBeEnabled();assert.equal(intercepted,1);await page.unroute(path);await form.getByRole('button',{name:'Vazgeç',exact:true}).click();
 const current=await model(id);
 await record.getByRole('button',{name:'Onayla',exact:true}).click();
 await record.locator('.ai-inventory-decision textarea').fill('QA approve the displayed revision');
 await record.locator('.ai-inventory-decision input').fill('ONAYLA');
 await call('PUT',{...values,id,expectedUpdatedAt:current.updatedAt,systemName:'QA lifecycle changed assistant'});
 assert.notEqual((await model(id)).updatedAt,original.updatedAt);
 await record.getByRole('button',{name:'Kararı uygula'}).click();
 await expect(root.locator('.ai-inventory-notice')).toContainText('Model değişti');
 await expect(record).toContainText('QA lifecycle changed assistant');
 await expect(record.locator('.ai-inventory-decision')).toHaveCount(0);
 assert.equal((await model(id)).status,'draft');
 await record.getByRole('button',{name:'Onayla',exact:true}).click();
 await record.locator('.ai-inventory-decision textarea').fill('QA reviewed the updated model');
 await record.locator('.ai-inventory-decision input').fill('ONAYLA');
 const beforeFailedApproval=await model(id);await failAudit('model-inventory-approved');
 await record.getByRole('button',{name:'Kararı uygula'}).click();await expect(root.locator('.ai-inventory-notice')).toContainText('Model kararı kaydedilemedi');await expect(record.locator('.ai-inventory-decision')).toHaveCount(0);await expect(record.getByRole('button',{name:'Onayla',exact:true})).toBeEnabled();assert.deepEqual(await model(id),beforeFailedApproval);await restoreAudit();
 await record.getByRole('button',{name:'Onayla',exact:true}).click();await record.locator('.ai-inventory-decision textarea').fill('QA retry after audit recovery');await record.locator('.ai-inventory-decision input').fill('ONAYLA');
 await record.getByRole('button',{name:'Kararı uygula'}).click();
 await expect(record.locator('strong.approved')).toBeVisible();
 await expect(record.getByRole('button',{name:'Onayla',exact:true})).toBeDisabled();
 const approved=await model(id);assert.equal(approved.status,'approved');
 await record.getByRole('button',{name:'Activity history',exact:true}).click();const history=record.locator('.ai-record-history-panel');await expect(history).toContainText('Model approved');await expect(history).toContainText('qa-admin@fornost.test');
 const historyResponse=await context.request.get(`${base}/api/ai/audit?id=${encodeURIComponent(id)}&limit=50`);assert.equal(historyResponse.status(),200);const historyBody=await historyResponse.json();assert.ok(historyBody.logs.length>=2);assert.ok(historyBody.logs.every(log=>log.contextRefs.includes(id)));
 const unknownHistory=await context.request.get(`${base}/api/ai/audit?id=QA-unknown-history`);assert.deepEqual((await unknownHistory.json()).logs,[]);assert.equal((await context.request.get(`${base}/api/ai/audit?id=one&id=two`)).status(),400);
 const historyRoute='**/api/ai/audit?*';await page.route(historyRoute,route=>route.fulfill({status:503,json:{error:'QA history unavailable'}}));await history.getByRole('button',{name:'Refresh',exact:true}).click();await expect(history.getByRole('alert')).toContainText('History could not be loaded');await expect(history.locator('li')).toHaveCount(0);await page.unroute(historyRoute);await history.getByRole('button',{name:'Refresh',exact:true}).click();await expect(history).toContainText('Model approved');
 for(const theme of ['light','dark'])for(const width of [1536,390]){await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await page.setViewportSize({width,height:960});assert.ok(await history.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/record-history-${theme}-${width}.png`});}await page.setViewportSize({width:1536,height:960});await record.getByRole('button',{name:'Activity history',exact:true}).click();await expect(history).toHaveCount(0);

 await call('PATCH',decision(id,'suspended',original.updatedAt),409);
 await failAudit('model-inventory-suspended');await call('PATCH',decision(id,'suspended',approved.updatedAt),503);assert.deepEqual(await model(id),approved);await restoreAudit();
 await call('PATCH',decision(id,'suspended',approved.updatedAt));
 const suspended=await model(id);await call('PATCH',decision(id,'approved',suspended.updatedAt));
 const beforeRetire=await model(id);
 await sql(`UPDATE ai_model_inventory SET status='retired',updated_at='2026-10-05T00:00:00.000Z',decision_note='QA completed retirement' WHERE id=${q(id)};`);
 const retired=await model(id);
 for(const status of ['approved','suspended'])for(const version of [retired.updatedAt,beforeRetire.updatedAt])await call('PATCH',decision(id,status,version),409);
 assert.deepEqual(await model(id),retired);
 const critical=await call('POST',{...values,systemName:'QA critical lifecycle',impact:5,likelihood:5,dataSensitivity:5,autonomyRisk:5,controlMaturity:1},201);ids.push(critical.id);
 const criticalModel=await model(critical.id);assert.equal(criticalModel.riskTier,'Critical');
 await call('PATCH',decision(critical.id,'approved',criticalModel.updatedAt),409);
 await call('PATCH',decision(critical.id,'suspended',criticalModel.updatedAt));
 const deletable=await call('POST',{...values,systemName:'QA atomic deletion'},201);ids.push(deletable.id);await call('DELETE',{id:deletable.id,expectedUpdatedAt:(await model(deletable.id)).updatedAt,confirmation:'SİL'});assert.equal(await model(deletable.id),undefined);
 await page.screenshot({path:`${out}/decision-recovery.png`});
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',realApi:true,scopedRecordHistory:true,historyFailureRecovery:true,historyResponsiveThemes:true,linkedDraftDeletionBlocked:true,linkedDeletionUiRecovery:true,atomicModelWrites:true,auditFailureRollback:true,uiApprovalAuditRecovery:true,versionedDraftEditDelete:true,preservedStaleDraft:true,failedEditRecovered:true,uiStaleDecisionRecovery:true,retiredDecisionsBlocked:4,criticalRiskBlocked:true}));
}finally{try{await page.close();await sql('DROP TRIGGER IF EXISTS qa_model_audit_failure;');if(ids.length)await sql(`DELETE FROM ai_model_monitoring WHERE model_id IN (${ids.map(q).join(',')});DELETE FROM ai_model_inventory WHERE id IN (${ids.map(q).join(',')}); DELETE FROM ai_activity_logs WHERE ${ids.map(id=>`detail LIKE ${q(id+' %')}`).join(' OR ')};`);}finally{await browser.close();}}
