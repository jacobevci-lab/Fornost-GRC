import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 assert.equal((await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}})).status(),200);
 const endpoint=base+'/api/continuous-assurance/traceability';
 assert.equal((await context.request.get(endpoint+'?workIds=%5B%5D')).status(),400);
 const exact=await context.request.get(endpoint+'?'+new URLSearchParams({workIds:JSON.stringify(['QA-MISSING-WORK'])}));assert.equal(exact.status(),200);assert.deepEqual((await exact.json()).coverage,{loaded:0,complete:true});
 const anon=await browser.newContext();assert.equal((await anon.request.get(endpoint)).status(),401);await anon.close();
 const works=Array.from({length:51},(_,i)=>({id:`W-${i}`,findingId:`F-${i}`,action:'capa-promotion',status:'completed',resultRef:`C-${i}`}));
 let mode='valid',calls=[];
 await page.route('**/api/evidence-automation/operations-insights',r=>r.fulfill({json:{available:true,state:'critical',generatedAt:new Date().toISOString(),summary:{attentionConnectors:1},insights:[{sourceId:'SOURCE',sourceName:'QA old CAPA',code:'control-health',state:'critical'}]}}));
 await page.route('**/api/evidence-automation',r=>r.fulfill({json:{sources:[{id:'SOURCE',enabled:true}],rules:[{id:'RULE',sourceId:'SOURCE',enabled:true,health:'failing',controlRefs:'CTRL'}],findings:[{id:'F-0',ruleId:'RULE',status:'open'}],runs:[]}}));
 await page.route('**/api/continuous-assurance',r=>r.fulfill({json:{items:works}}));
 await page.route('**/api/continuous-assurance/traceability?*',r=>{
  const ids=JSON.parse(new URL(r.request().url()).searchParams.get('workIds'));calls.push(ids);
  const items=ids.map(id=>{const w=works.find(w=>w.id===id);return {workItemId:id,findingId:w.findingId,resultRef:w.resultRef,completedAt:'2020-01-01T00:00:00Z',enterpriseFinding:mode==='missing'?null:{id:mode==='foreign'?'WRONG':w.resultRef,code:'CAPA-'+id,status:'closed',evidenceReference:'E1',verificationEvidenceReference:'E2',recurrenceCount:1}};});
  if(mode==='partial')items.pop();
  return r.fulfill({json:{available:true,items,coverage:{loaded:items.length,complete:true}}});
 });
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible({timeout:30000});
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Workflow Integrations"]').evaluate(n=>n.click());
 const panel=page.locator('.ca-attention'),lifecycle=panel.locator('[aria-label="CAPA remediation lifecycle"]');
 await expect(lifecycle).toContainText('Closed and verified',{timeout:30000});assert.ok(calls.some(c=>c.length===50));assert.ok(calls.some(c=>c.length===1));assert.ok(calls.every(c=>c.length<=50));
 for(const invalid of ['foreign','partial']){
  mode=invalid;await panel.locator('.ca-attention-head button').click();await expect(lifecycle).toContainText('Remediation state unavailable');await expect(lifecycle).not.toContainText('evidence ✓');
 }
 mode='missing';await panel.locator('.ca-attention-head button').click();await expect(lifecycle).toContainText('Enterprise finding linkage unresolved');
 mode='valid';await panel.locator('.ca-attention-head button').click();await expect(lifecycle).toContainText('Closed and verified');
 assert.deepEqual(errors,[]);console.log('CAPA_TRACEABILITY_QA_PASS: real auth/input boundaries, exact batched lookup, foreign/missing/partial distinction and recovery');
}finally{await browser.close();}
