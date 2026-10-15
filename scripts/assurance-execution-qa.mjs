import {qaPassword} from './qa-credentials.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// Fixed localhost only. Real API/SQLite checks cover source invalidation and health.
// Explicit browser transport fixtures cover conflicts/batch feedback; concurrent
// collector requests and rollback are exercised by evidence-execution-consistency.test.ts.
const base='http://127.0.0.1:4173',out='assurance-execution-qa-artifacts',path='/api/evidence-automation';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=`${out}/fixture.sql`;await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function api(route=path,method='GET',data){const response=await context.request.fetch(base+route,{method,data,headers:{origin:base}});assert.equal(response.status(),200,await response.text());return response.json();}
let sourceId='',ruleId='',secondId='';
try{
  await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
  const source={action:'save-source',name:'QA Execution Source',vendor:'Custom',category:'Work & Custom',driver:'rest-json',baseUrl:'https://fixture.example/initial',authType:'none'};
  sourceId=(await api(path,'POST',source)).sourceId;
  const rule={action:'save-rule',name:'QA Execution Coverage',sourceId,controlRefs:'A.8.1',jsonPath:'coverage',operator:'gte',expected:'90',schedule:'daily',freshnessHours:24,autoFinding:false};
  ruleId=(await api(path,'POST',rule)).ruleId;
  secondId=(await api(path,'POST',{...rule,name:'QA Execution Second'})).ruleId;
  const now=new Date().toISOString();
  await seed(`UPDATE evidence_automation_rules SET last_status='pass',last_run_at=${q(now)},last_evidence_at=${q(now)},last_run_id='QA-EXECUTION-HISTORY' WHERE id=${q(ruleId)};
    INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,created_at,actor) VALUES('QA-EXECUTION-HISTORY',${q(ruleId)},'QA Execution Coverage','QA Execution Source','pass',100,'Explicit local QA history','qa-only',${q(now)},'qa');`);
  let health=await api(path+'/operations-health');let connector=health.connectors.find(x=>x.sourceId===sourceId);assert.equal(connector.healthyRules,1);assert.equal(connector.evidenceReadyRules,1);
  const changed=await api(path,'POST',{...source,sourceId,baseUrl:'https://fixture.example/changed'});assert.equal(changed.reassessmentRequired,true);
  let current=await api();let saved=current.rules.find(x=>x.id===ruleId);assert.equal(saved.lastStatus,null);assert.equal(saved.lastEvidenceAt,null);assert.ok(current.runs.some(x=>x.id==='QA-EXECUTION-HISTORY'));
  health=await api(path+'/operations-health');connector=health.connectors.find(x=>x.sourceId===sourceId);assert.equal(connector.healthyRules,0);assert.equal(connector.evidenceReadyRules,0);
  await seed(`UPDATE evidence_automation_rules SET last_status='pass',last_run_at=${q(now)},last_evidence_at='invalid-date',next_run_at=NULL WHERE id IN (${q(ruleId)},${q(secondId)});`);
  health=await api(path+'/operations-health');connector=health.connectors.find(x=>x.sourceId===sourceId);assert.equal(connector.healthyRules,0);assert.equal(connector.unhealthyRules,2);
  // Browser fixture controls only transport responses; it never writes fabricated evidence.
  let posts=[],refreshes=0,mode='conflict';
  await page.route('**/api/evidence-automation',async route=>{
    if(route.request().method()==='GET'){
      refreshes++;const response=await route.fetch(),body=await response.json();
      body.sources=body.sources.filter(x=>x.id===sourceId);body.rules=body.rules.filter(x=>[ruleId,secondId].includes(x.id));body.runs=[];body.findings=[];
      return route.fulfill({response,json:body});
    }
    const body=route.request().postDataJSON();if(body.action!=='run-rule')return route.continue();posts.push(body.ruleId);
    if(mode==='conflict'||body.ruleId===ruleId)return route.fulfill({status:409,json:{code:'EXECUTION_CONFLICT',error:'Fixture conflict'}});
    return route.fulfill({json:{ok:true,runId:'BROWSER-TRANSPORT-FIXTURE',status:'pass'}});
  });
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  for(const lang of ['EN','TR']){
    await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
    await page.locator(`nav button[aria-label="${lang==='EN'?'Evidence Automation':'Kanıt Otomasyonu'}"]`).evaluate(el=>el.click());
    await page.locator('.ea-tabs').getByRole('button',{name:lang==='EN'?'Continuous Controls':'Sürekli Kontroller',exact:true}).click();
    const row=page.locator('.ea-table tr').filter({hasText:'QA Execution Coverage'});await expect(row).toContainText(lang==='EN'?'Unverified':'Doğrulanamadı');
    const before=refreshes;await row.getByRole('button',{name:lang==='EN'?'Run':'Çalıştır',exact:true}).click();
    await expect(page.locator('.ea-message')).toContainText(lang==='EN'?'outdated result was not saved':'Eski sonuç kaydedilmedi');await expect.poll(()=>refreshes).toBeGreaterThan(before);
    for(const theme of ['light','dark'])for(const width of [1536,390]){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await page.setViewportSize({width,height:960});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/conflict-${lang}-${theme}-${width}.png`});
    }
    await page.setViewportSize({width:1536,height:960});
  }
  mode='batch';posts=[];
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('nav button[aria-label="Workflow Integrations"]').evaluate(el=>el.click());
  const overview=page.locator('.integrations-overview');await expect(overview).toBeVisible();
  await overview.getByRole('button',{name:/^Run due/}).click();
  await expect(overview.locator('.iov-bulk-feedback')).toContainText('1 results saved');await expect(overview.locator('.iov-bulk-feedback')).toContainText('1 runs without confirmed records');
  assert.deepEqual([...posts].sort(),[ruleId,secondId].sort());
  await page.screenshot({path:`${out}/batch.png`});
  assert.deepEqual(errors,[]);
  console.log('ASSURANCE_EXECUTION_QA_PASS: real source invalidation/history preservation and fail-closed health; EN/TR conflict refresh, light/dark desktop/mobile; batch continues after a rejected run. Vendor HTTP is substituted in SQLite tests.');
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{
  if(sourceId)await seed(`DELETE FROM evidence_automation_runs WHERE rule_id IN (${q(ruleId)},${q(secondId)});DELETE FROM evidence_automation_rules WHERE source_id=${q(sourceId)};DELETE FROM evidence_automation_sources WHERE id=${q(sourceId)};`).catch(()=>{});
  await browser.close();
}
