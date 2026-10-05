import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='ai-retirement-qa-artifacts',email='qa-retirement-reviewer@fornost.test',password=qaPassword();
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const maker=await browser.newContext(),reviewer=await browser.newContext({viewport:{width:1536,height:960}}),page=await reviewer.newPage();page.setDefaultTimeout(20000);
let userId,modelId,planId,findingId;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function sql(statement){const file=`${out}/fixture.sql`;await fs.writeFile(file,statement);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function api(ctx,path,method='GET',data,expected=200){const response=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(response.status(),expected,`${method} ${path}: ${await response.text()}`);return response.json();}
const plan=async()=>(await api(maker,'/api/ai/decommission')).plans.find(p=>p.id===planId);
const model=async()=>(await api(maker,'/api/ai/models')).models.find(m=>m.id===modelId);
async function act(ctx,action,expected=200){const p=await plan();return api(ctx,'/api/ai/decommission','PATCH',{id:planId,expectedUpdatedAt:p.updatedAt,action,note:'QA independent retirement review',confirmation:{approve:'PLANI ONAYLA',start:'EMEKLİLİĞİ BAŞLAT',verify:'İMHAYI DOĞRULA'}[action],evidenceReference:'EVD-QA-retirement',evidenceSha256:'a'.repeat(64),trafficDisabled:true,accessRevoked:true,secretsRevoked:true,dependenciesMigrated:true,dataDispositioned:true,artifactsDispositioned:true,monitoringClosed:true},expected);}
try{
 await api(maker,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password});
 await api(maker,'/api/users','POST',{name:'QA Retirement Reviewer',email,password,role:'Admin'},201);
 userId=(await api(maker,'/api/users')).users.find(u=>u.email===email).id;
 await api(reviewer,'/api/auth','POST',{action:'login',email,password});
 const m=await api(maker,'/api/ai/models','POST',{systemName:'QA atomic retirement model',modelName:'QA model',vendor:'Internal',purpose:'Validate atomic governed model retirement',owner:'qa-admin@fornost.test',deployment:'On-Prem',region:'TR',dataClassification:'Internal',autonomy:'Advisory',affectedUsers:1,impact:3,likelihood:3,dataSensitivity:3,autonomyRisk:2,controlMaturity:3,controls:'RBAC and human review',reviewDate:'2027-01-01'},201);modelId=m.id;
 const text='QA reviewed dependencies and execution evidence';
 const f=await api(maker,'/api/ai/findings','POST',{modelId,domain:'model',sourceRef:'QA-retirement-review',title:'QA versioned finding',description:text,rootCause:text,correctiveAction:text,preventiveAction:text,owner:'qa-admin@fornost.test',severity:'High',dueDate:new Date().toISOString().slice(0,10)},201);findingId=f.id;
 const finding=async()=>(await api(maker,`/api/ai/findings?id=${encodeURIComponent(findingId)}`)).findings[0];
 async function findingAction(ctx,action,expected=200,version){const current=await finding();return api(ctx,'/api/ai/findings','PATCH',{id:findingId,expectedUpdatedAt:version===undefined?current.updatedAt:version,action,note:'QA reviewed current finding',confirmation:{start:'AKSİYONU BAŞLAT',submit:'DOĞRULAMAYA GÖNDER',resolve:'BULGUYU KAPAT',reopen:'BULGUYU YENİDEN AÇ'}[action],evidenceReference:'EVD-QA-finding',evidenceSha256:'b'.repeat(64)},expected);}
 const firstVersion=(await finding()).updatedAt;await findingAction(maker,'start',409,'');await findingAction(maker,'start');await findingAction(maker,'submit',409,firstVersion);await findingAction(maker,'submit');
 await sql(`UPDATE ai_findings SET submitted_by=' QA-ADMIN@FORNOST.TEST ' WHERE id=${q(findingId)};`);await findingAction(maker,'resolve',409);await findingAction(reviewer,'resolve');const closedVersion=(await finding()).updatedAt;await findingAction(reviewer,'reopen');await findingAction(reviewer,'submit',409,closedVersion);

 const p=await api(maker,'/api/ai/decommission','POST',{modelId,reason:'QA atomic retirement plan',owner:'qa-admin@fornost.test',plannedAt:new Date().toISOString().slice(0,10),dependencies:text,stakeholderPlan:text,rollbackPlan:text,dataDisposition:'delete',retentionBasis:'',disposalMethod:text,artifactPlan:text,accessPlan:text,evidencePlan:text},201);planId=p.id;
 await act(maker,'approve',409);await act(reviewer,'approve');await act(maker,'start');await act(maker,'verify',409);
 await sql(`CREATE TRIGGER qa_retirement_audit_failure BEFORE INSERT ON ai_activity_logs WHEN NEW.action='ai-decommission-verify' AND NEW.context_refs_json LIKE ${q('%'+planId+'%')} BEGIN SELECT RAISE(ABORT,'QA audit failure'); END;`);
 await act(reviewer,'verify',503);assert.equal((await plan()).status,'executing');assert.equal((await model()).status,'draft');
 await sql('DROP TRIGGER qa_retirement_audit_failure;');
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="AI Governance"]').evaluate(el=>el.click());
 await page.locator('.ai-section-picker>summary').click();await page.locator('.fornost-ai-tabs').getByRole('button',{name:'AI Bulgular',exact:true}).click();
 const findingRoot=page.locator('.ai-findings');await expect(findingRoot.locator(`[data-record-id="${findingId}"]`)).toHaveCount(1);await findingRoot.getByRole('textbox',{name:'Kayıt ara',exact:true}).fill(findingId);const findingRecord=findingRoot.locator(`[data-record-id="${findingId}"]`);
 await findingRecord.getByRole('button',{name:'Doğrulamaya Gönder',exact:true}).click();await findingRecord.locator('.action textarea').fill('QA stale finding submission');await findingRecord.getByPlaceholder('Kanıt referansı',{exact:true}).fill('EVD-QA-stale');await findingRecord.getByPlaceholder('64 karakter SHA-256',{exact:true}).fill('c'.repeat(64));await findingRecord.getByPlaceholder('DOĞRULAMAYA GÖNDER',{exact:true}).fill('DOĞRULAMAYA GÖNDER');
 await findingAction(maker,'submit');await findingRecord.getByRole('button',{name:'İşlemi Uygula',exact:true}).click();await expect(findingRoot.locator('.notice')).toContainText('Bulgu değişti');await expect(findingRecord.locator('.action')).toHaveCount(0);assert.equal((await finding()).evidenceSha256,'b'.repeat(64));
 await page.locator('.ai-section-picker>summary').click();await page.locator('.fornost-ai-tabs').getByRole('button',{name:'AI Emeklilik',exact:true}).click();
 const root=page.locator('.ai-decommission'),record=root.locator('.list>article').filter({hasText:planId});await expect(record).toHaveCount(1);
 async function fill(){await record.getByRole('button',{name:'İmhayı Doğrula',exact:true}).click();await record.locator('.action textarea').fill('QA independent verified execution');await record.getByPlaceholder('Kanıt referansı / URI').fill('EVD-QA-retirement');await record.getByPlaceholder('64 karakter SHA-256').fill('a'.repeat(64));for(const checkbox of await record.locator('.checklist input').all())await checkbox.check();await record.getByPlaceholder('İMHAYI DOĞRULA',{exact:true}).fill('İMHAYI DOĞRULA');}
 await fill();await sql(`UPDATE ai_decommission_plans SET updated_at=${q(new Date().toISOString())} WHERE id=${q(planId)};`);
 await record.getByRole('button',{name:'İşlemi Uygula'}).click();await expect(root.locator('.notice')).toContainText('planı değişti');await expect(record.locator('.action')).toHaveCount(0);
 await fill();await record.getByRole('button',{name:'İşlemi Uygula'}).click();await expect(record).toHaveClass('completed');assert.equal((await model()).status,'retired');await act(reviewer,'verify',409);
 // UI-only response fixtures exercise pagination, empty/error states and retry without extra writes.
 const payload=await api(reviewer,'/api/ai/decommission');const completed=payload.plans.find(p=>p.id===planId);
 await expect(root.locator('form')).toHaveCount(0);
 await root.getByRole('button',{name:'Yeni emeklilik planı',exact:true}).click();await expect(root.locator('form')).toBeVisible();
 await root.getByRole('button',{name:'Formu kapat',exact:true}).click();await expect(root.locator('form')).toHaveCount(0);
 const route='**/api/ai/decommission';
 await page.route(route,r=>r.fulfill({json:{...payload,plans:Array.from({length:12},(_,i)=>({...completed,id:`QA-UI-${i}`,reason:`Workspace test ${i}`}))}}));
 await root.getByRole('button',{name:'Listeyi yenile',exact:true}).click();await expect(root.locator('.list>article')).toHaveCount(10);
 await root.getByRole('button',{name:'Sonraki',exact:true}).click();await expect(root.locator('.list>article')).toHaveCount(2);
 await root.getByRole('textbox',{name:'Plan ara',exact:true}).fill('QA-UI-11');await expect(root.locator('.list>article')).toHaveCount(1);
 await root.getByRole('combobox',{name:'Plan durumu',exact:true}).selectOption('draft');await expect(root.locator('.list>article')).toHaveCount(0);await expect(root.locator('.retirement-empty')).toContainText('Aramanıza uygun');
 await root.getByRole('textbox',{name:'Plan ara',exact:true}).fill('');await root.getByRole('combobox',{name:'Plan durumu',exact:true}).selectOption('all');
 await page.unroute(route);await page.route(route,r=>r.fulfill({status:503,json:{error:'QA load failure'}}));
 await root.getByRole('button',{name:'Listeyi yenile',exact:true}).click();await expect(root.getByRole('alert')).toContainText('yüklenemedi');await expect(root.locator('.list>article')).toHaveCount(0);await expect(root.locator('.stats b').first()).toHaveText('—');await expect(root.getByRole('button',{name:'Yeni emeklilik planı',exact:true})).toBeDisabled();
 await page.unroute(route);await root.getByRole('button',{name:'Listeyi yenile',exact:true}).click();await expect(record).toHaveCount(1);await expect(root.getByRole('alert')).toHaveCount(0);
 await page.screenshot({path:`${out}/completed.png`});await record.getByRole('button',{name:'Planın modelini aç',exact:true}).click();await expect(page.locator('.ai-model-inventory [data-record-id]')).toHaveCount(1);await expect(page.locator('.ai-model-inventory [data-record-id]')).toHaveAttribute('data-record-id',modelId);assert.deepEqual(errors,[]);await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',realApi:true,versionedFindingWorkflow:true,normalizedFindingSeparation:true,staleFindingUiRecovery:true,independentAccounts:2,auditFailureRolledBack:true,staleUiRecovered:true,workspaceFiltersPaginationAndRetry:true,retiredModelNavigation:true}));
}finally{try{await page.close();await sql(`DROP TRIGGER IF EXISTS qa_retirement_audit_failure;${findingId?`DELETE FROM ai_findings WHERE id=${q(findingId)};`:''}${planId?`DELETE FROM ai_decommission_plans WHERE id=${q(planId)};`:''}${modelId?`DELETE FROM ai_model_inventory WHERE id=${q(modelId)};DELETE FROM ai_activity_logs WHERE context_refs_json LIKE ${q('%'+modelId+'%')} OR detail LIKE ${q(modelId+' %')};`:''}${userId?`DELETE FROM local_sessions WHERE user_id=${q(userId)};DELETE FROM user_module_access WHERE user_id=${q(userId)};DELETE FROM user_access_events WHERE user_id=${q(userId)};DELETE FROM local_users WHERE id=${q(userId)};`:''}`);}finally{await browser.close();}}
