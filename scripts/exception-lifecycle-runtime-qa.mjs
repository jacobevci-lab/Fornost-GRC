import { qaPassword } from "./qa-credentials.mjs";
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
// These mutation/failure fixtures are restricted to loopback and local D1.
const base='http://127.0.0.1:4173',endpoint='/api/continuous-assurance/governance',out='exception-lifecycle-qa-artifacts',password=qaPassword();
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined}),admin=await browser.newContext(),maker=await browser.newContext(),viewer=await browser.newContext();
let checks=0;
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=`${out}/fixture.sql`;await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);checks++;return r.json();}
const post=(ctx,data,status=200)=>api(ctx,endpoint,'POST',data,status);
const read=()=>api(admin,endpoint);
const risk=async()=>JSON.parse((await api(admin,'/api/grc')).rows.find(r=>r.id==='QA-EX-RISK').data_json);
try{
 await api(admin,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password});
 await api(admin,'/api/grc');await api(admin,'/api/evidence-automation');await read();
 for(const [name,role,ctx] of [['maker','Editor',maker],['viewer','Viewer',viewer]]){await api(admin,'/api/users','POST',{name:`QA Exception ${name}`,email:`qa-ex-${name}@fornost.test`,password,role,moduleAccess:{mode:'full'}},201);await api(ctx,'/api/auth','POST',{action:'login',email:`qa-ex-${name}@fornost.test`,password});}
 const stamp=new Date().toISOString(),day=stamp.slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
 await seed(`INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES('QA-EX-RISK','Risk Assessment',${q(JSON.stringify({title:'QA exception lifecycle risk',owner:'QA owner',assuranceState:'ineffective',residualLikelihood:'4',residualImpact:'4'}))},${q(stamp)},${q(stamp)});`);
 const proposal={action:'create-exception',riskRef:'QA-EX-RISK',findingId:'QA-EX-FIND',ruleId:'QA-EX-RULE',reason:'A documented temporary exception with independent review.',expiresAt:tomorrow,evidenceReference:'QA-EX-EVD',evidenceSha256:'a'.repeat(64)};
 await post(viewer,proposal,403);const first=await post(maker,proposal,201);
 await post(maker,{action:'review-exception',exceptionId:first.id,decision:'approve'},403);
 const own=await post(admin,{...proposal,riskRef:'',findingId:'QA-EX-OWN'},201);await post(admin,{action:'review-exception',exceptionId:own.id,decision:'approve'},409);
 await post(admin,{action:'review-exception',exceptionId:first.id,decision:'approve'});
 assert.equal((await risk()).assuranceState,'ineffective');assert.equal((await risk()).residualLikelihood,'4');
 await post(admin,{action:'review-exception',exceptionId:first.id,decision:'reject',note:'Cannot change a completed review'},409);
 // The same independent caller and clock may race; exactly one terminal transition must win.
 const request={action:'revoke-exception',exceptionId:first.id,note:'The temporary exception must now end.'};
 const outcomes=await Promise.all([admin.request.post(base+endpoint,{data:request,headers:{origin:base}}),admin.request.post(base+endpoint,{data:request,headers:{origin:base}})]);
 assert.deepEqual(outcomes.map(r=>r.status()).sort(),[200,409]);checks+=2;
 let row=(await read()).exceptions.find(x=>x.id===first.id);assert.equal(row.status,'revoked');assert.ok(row.retestWorkItemId);assert.equal(row.retestRequired,true);assert.equal('lifecycleToken' in row,false);assert.equal((await risk()).residualRiskReviewRequired,true);
 // Force a real SQLite failure after the decision claim. Every write must roll back.
 const failed=await post(maker,{...proposal,findingId:'QA-EX-ROLLBACK'},201);await post(admin,{action:'review-exception',exceptionId:failed.id,decision:'approve'});
 await seed("CREATE TRIGGER qa_ex_fail BEFORE INSERT ON continuous_assurance_work_items WHEN NEW.finding_id='QA-EX-ROLLBACK' BEGIN SELECT RAISE(ABORT,'QA exception rollback'); END;");
 const bad=await admin.request.post(base+endpoint,{data:{...request,exceptionId:failed.id},headers:{origin:base}});assert.ok(bad.status()>=400);checks++;
 row=(await read()).exceptions.find(x=>x.id===failed.id);assert.equal(row.status,'active');assert.equal(row.retestRequired,false);assert.equal(row.retestWorkItemId,'');
 await seed('DROP TRIGGER qa_ex_fail;');await post(admin,{...request,exceptionId:failed.id});
 // Final-day inclusion and automatic expiration are checked through the real GET route.
 for(const [id,expiry] of [['QA-EX-TODAY',day],['QA-EX-PAST',yesterday]])await seed(`INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at) VALUES(${q(id)},'QA-EX-EXPIRY','QA-EX-RULE','QA-EX-RISK','Documented expiration fixture',${q(expiry)},'QA-EX-EVD',${q('a'.repeat(64))},'active','qa-ex-maker@fornost.test',${q(stamp)});`);
 const before=await read(),past=before.exceptions.find(x=>x.id==='QA-EX-PAST');assert.equal(past.storedStatus,'expired');assert.ok(past.retestWorkItemId);assert.equal(before.exceptions.find(x=>x.id==='QA-EX-TODAY').storedStatus,'active');assert.equal((await read()).exceptions.find(x=>x.id==='QA-EX-PAST').retestWorkItemId,past.retestWorkItemId);
 const page=await admin.newPage();await page.goto(base);await page.locator('.shell').waitFor();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el=>el.click());await page.getByRole('group',{name:'Map view',exact:true}).getByRole('button',{name:'Assurance',exact:true}).click();const panel=page.locator('.assurance-governance'),disclosure=panel.locator('xpath=ancestor::details[1]');if(!(await disclosure.evaluate(el=>el.open)))await disclosure.locator(':scope > summary').click();await expect(panel.getByRole('button',{name:'Refresh governance',exact:true})).toBeEnabled();await expect(panel.getByRole('alert')).toHaveCount(0);await panel.getByLabel('Search risks, proposals or exceptions').fill('QA-EX');const exceptions=panel.locator('.ag-grid>article').nth(1);await expect(exceptions.locator('.ag-row')).toHaveCount(4);await expect(exceptions).toContainText('expired');await expect(exceptions).toContainText('revoked');await expect(exceptions).toContainText('RE-TEST REQUIRED');await exceptions.screenshot({path:`${out}/lifecycle.png`});await page.close();
 await fs.writeFile(`${out}/summary.json`,JSON.stringify({passed:true,apiChecks:checks,checks:['role boundaries','maker-checker','single terminal winner','rollback/retry','canonical risk preservation','mandatory re-test','expiry boundary','idempotent reconciliation','governance render']},null,2));
}finally{
 try{await seed("DROP TRIGGER IF EXISTS qa_ex_fail; DELETE FROM continuous_assurance_work_items WHERE finding_id GLOB 'QA-EX-*'; DELETE FROM continuous_assurance_exceptions WHERE finding_id GLOB 'QA-EX-*' OR id GLOB 'QA-EX-*'; DELETE FROM simple_grc_record_codes WHERE record_id='QA-EX-RISK'; DELETE FROM simple_grc_records WHERE id='QA-EX-RISK';");}finally{await browser.close();}
}
console.log(`EXCEPTION_LIFECYCLE_QA_PASS: ${checks} API checks; independent decisions, concurrency, real transaction failure/rollback/retry, expiry, mandatory re-tests and risk preservation`);
