import {qaPassword} from './qa-credentials.mjs';
import {seedCurrentAssessmentFixture} from './current-assessment-qa-fixture.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
// Fixed loopback, local D1, explicit synthetic receipts. Actual collector execution is covered by SQLite tests.
const base='http://127.0.0.1:4173',out='current-assessment-qa-artifacts',name='QA Current Assessment',sourceId='QA-PROJ-SOURCE',ruleId='QA-PROJ-RULE',controlRef='QA-PROJ-CONTROL';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));let checks=0,auditId='',seeded=false;const extraAuditIds=[];
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=`${out}/fixture.sql`;await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000})}
async function api(path,method='GET',data,status=200){const response=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(response.status(),status,`${path}: ${await response.text()}`);checks++;return response.json()}
const readiness=`/api/audits/readiness?auditName=${encodeURIComponent(name)}`;
try{
  await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
  for(const path of ['/api/grc','/api/evidence-automation','/api/continuous-assurance','/api/evidence/history','/api/findings'])await api(path);
  // Demo requirements intentionally predate engagements. Verify the incomplete signal,
  // then register only those local fixture scopes so the recovery case is meaningful.
  const beforePortfolio=await api('/api/executive-assurance');
  if(beforePortfolio.auditPortfolio.orphanRequirements){
    assert.equal(beforePortfolio.verified,false);assert.ok(beforePortfolio.issues.includes('orphan-requirements'));
    const existing=new Set((await api('/api/audits')).audits.map(a=>a.name));
    const core=await api('/api/grc');
    for(const auditName of new Set(core.rows.filter(r=>r.module==='Denetim Yönetimi').map(r=>JSON.parse(r.data_json).auditName))){
      if(auditName&&!existing.has(auditName)){extraAuditIds.push((await api('/api/audits','POST',{name:auditName,template:'Özel Denetim',auditOwner:'QA',auditType:'Diğer Denetim'},201)).id);existing.add(auditName);}
    }
  }
  const emptyAuditId=(await api('/api/audits','POST',{name:'QA Empty Portfolio Audit',template:'Özel Denetim',auditOwner:'QA',auditType:'Diğer Denetim'},201)).id;extraAuditIds.push(emptyAuditId);
  auditId=(await api('/api/audits','POST',{name,template:'Özel Denetim',auditOwner:'QA',auditor:'QA',auditType:'Diğer Denetim'},201)).id;
  const stamp=new Date().toISOString();
  const record=(id,module,data)=>`INSERT INTO simple_grc_records VALUES(${q(id)},${q(module)},${q(JSON.stringify(data))},${q(stamp)},${q(stamp)});`;
  seeded=true;
  await seed(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES(${q(sourceId)},'QA Projection Source','Custom','Custom','rest-json','{"baseUrl":"https://fixture.example/initial","authType":"none"}',${q(stamp)},${q(stamp)},'qa');
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,auto_finding,created_at,updated_at,updated_by) VALUES(${q(ruleId)},'QA Projection Coverage',${q(sourceId)},${q(controlRef)},'coverage','gte','90','daily',0,${q(stamp)},${q(stamp)},'qa');
    ${record('QA-PROJ-C','Kontroller',{controlRef,controlTitle:'QA Projection Control',owner:'QA',testOwner:'QA',nextTestDate:'2099-01-01'})}
    ${record('QA-PROJ-A','Denetim Yönetimi',{auditName:name,controlRef,requirementRef:controlRef,requirementTitle:'Current automated assessment',owner:'QA',status:'Başlanmadı'})}`);
  await seed(record('QA-PROJ-A2','Denetim Yönetimi',{auditName:name,controlRef,requirementRef:controlRef,status:'Kapatıldı',evidenceStatus:'Kanıt Tamam'}));
  const [initial]=await seedCurrentAssessmentFixture({ruleIds:[ruleId],prefix:'QA-PROJ-FIRST',out});
  assert.equal((await api(readiness)).gate,'ready');
  let snapshot=await api('/api/controls/assurance');const original=snapshot.rows.find(row=>row.id===initial.evidenceId);assert.equal(original.data.automationAssessment,'current');
  assert.equal(snapshot.rows.find(row=>row.data.identityRefs?.includes(ruleId)&&row.data.kind==='automation-rule')?.data.automationHealth,'healthy');
  const source={action:'save-source',sourceId,name:'QA Projection Source',vendor:'Custom',category:'Custom',driver:'rest-json',baseUrl:'https://fixture.example/changed',authType:'none'};
  assert.equal((await api('/api/evidence-automation','POST',source)).reassessmentRequired,true);
  snapshot=await api('/api/controls/assurance');assert.equal(snapshot.rows.find(row=>row.id===initial.evidenceId).data.automationAssessment,'configuration-changed');
  assert.notEqual((await api(readiness)).gate,'ready');assert.equal((await api(readiness)).evidence.current,0);
  const diagnostic={en:'Source or control settings changed; collect evidence with current settings.',tr:'Kaynak veya kontrol ayarı değişti; güncel ayarlarla yeni kanıt toplayın.'};
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  const executive=page.locator('.executive-dashboard-reference');
  await page.locator('nav button[aria-label="Dashboard"]').evaluate(el=>el.click());
  await expect(executive.locator('.evidence-assurance-status')).toHaveAttribute('data-state','ready');
  const evidenceSnapshot=await api('/api/executive-assurance');
  assert.equal(evidenceSnapshot.verified,true);assert.equal(evidenceSnapshot.rows.find(row=>row.id===initial.evidenceId).data.automationAssessment,'configuration-changed');
  assert.ok(!JSON.stringify(evidenceSnapshot).includes('secret_ciphertext'));
  assert.equal(evidenceSnapshot.auditPortfolio.audits.length,(await api('/api/audits')).audits.length);
  assert.equal(evidenceSnapshot.auditPortfolio.audits.find(a=>a.id===auditId).gate,'not-ready');
  assert.equal(evidenceSnapshot.auditPortfolio.audits.find(a=>a.id===auditId).requirements,1);
  assert.equal(evidenceSnapshot.auditPortfolio.audits.find(a=>a.id===emptyAuditId).gate,'empty');
  const portfolio=executive.locator('.audit-readiness-portfolio');await portfolio.locator(':scope > summary').click();
  while(await portfolio.getByRole('button',{name:'Show more audits',exact:true}).count())await portfolio.getByRole('button',{name:'Show more audits',exact:true}).click();
  const portfolioAudit=portfolio.locator(`[data-audit-id="${auditId}"]`);await expect(portfolioAudit).toContainText('Not ready');

  for(const lang of ['en','tr']){
    await page.locator('.language-switch:visible').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
    await expect(executive.locator('.executive-assessment-issues')).toContainText(diagnostic[lang]);
    for(const [theme,width] of [['light',1536],['dark',390]]){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await page.setViewportSize({width,height:960});
      await portfolioAudit.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);
      await page.screenshot({path:`${out}/executive-${lang}-${theme}-${width}.png`});
    }
  }
  await page.setViewportSize({width:1536,height:960});
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await portfolioAudit.getByRole('button',{name:'Review audit',exact:true}).click();
  await page.getByRole('tab',{name:'Assurance',exact:true}).click();
  await expect(page.locator('.audit-readiness-gate .audit-readiness-state>span')).toHaveText('NOT READY');
  await expect(page.locator('.audit-readiness-gate')).toContainText(name);
  await page.locator('nav button[aria-label="Reporting"]').evaluate(el=>el.click());
  const report=page.locator('.report-workspace'),assessmentStatus=report.locator('.evidence-assurance-status');
  await expect(assessmentStatus).toHaveAttribute('data-state','ready');
  await report.locator('.workspace-export>summary').click();
  for(const lang of ['en','tr']){
    await page.locator('.language-switch:visible').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
    const evaluated=await assessmentStatus.locator('time').getAttribute('datetime');
    const label=lang==='tr'?'Genel Güvence Paketi (ayrı kapsam)':'Global Assurance Pack (separate scope)';
    const [download]=await Promise.all([page.waitForEvent('download'),report.getByRole('button',{name:label,exact:true}).click()]);
    await download.saveAs(`${out}/executive-${lang}.html`);const document=await fs.readFile(`${out}/executive-${lang}.html`,'utf8');
    assert.ok(document.includes(diagnostic[lang]));assert.ok(document.includes(evaluated));assert.ok(document.includes(name));assert.ok(document.includes('QA Empty Portfolio Audit'));assert.ok(document.includes(lang==='tr'?'Kapsam boş':'Empty scope'));
  }
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  const pack=report.getByRole('button',{name:'Global Assurance Pack (separate scope)',exact:true});
  let failure='network';
  await page.route('**/api/executive-assurance',route=>failure==='network'?route.fulfill({status:503,json:{error:'QA unavailable'}}):route.fulfill({json:{...evidenceSnapshot,verified:false,issues:['integrity-incomplete']}}));
  await assessmentStatus.getByRole('button',{name:'Reassess assurance',exact:true}).click();
  await expect(assessmentStatus).toHaveAttribute('data-state','unavailable');await expect(pack).toBeDisabled();
  failure='partial';await assessmentStatus.getByRole('button',{name:'Reassess assurance',exact:true}).click();
  await expect(assessmentStatus).toHaveAttribute('data-state','unavailable');await expect(pack).toBeDisabled();
  await page.unroute('**/api/executive-assurance');await assessmentStatus.getByRole('button',{name:'Reassess assurance',exact:true}).click();
  await expect(assessmentStatus).toHaveAttribute('data-state','ready');await expect(pack).toBeEnabled();
  let firstRead=true,held=false,heldTime='',releaseRead,finishRead;
  const readBarrier=new Promise(resolve=>{releaseRead=resolve}),readFinished=new Promise(resolve=>{finishRead=resolve});
  await page.route('**/api/executive-assurance',async route=>{
    if(!firstRead){await route.continue();return;}firstRead=false;
    const response=await route.fetch();heldTime=(await response.json()).generatedAt;held=true;await readBarrier;
    try{await route.fulfill({response});}catch{/* superseded GET was cancelled */}finally{finishRead();}
  });
  await assessmentStatus.getByRole('button',{name:'Reassess assurance',exact:true}).click();
  await expect.poll(()=>held).toBe(true);await expect(pack).toBeDisabled();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  // Focus shares the pending snapshot. The bounded request must fail closed;
  // an explicit retry then replaces it before its late response is released.
  await expect(assessmentStatus).toHaveAttribute('data-state','loading');
  await expect(pack).toBeDisabled();
  await expect(assessmentStatus).toHaveAttribute('data-state','unavailable',{timeout:20000});
  await assessmentStatus.getByRole('button',{name:'Reassess assurance',exact:true}).click();
  await expect(assessmentStatus).toHaveAttribute('data-state','ready');
  await expect.poll(async()=>Date.parse(await assessmentStatus.locator('time').getAttribute('datetime')||'')>Date.parse(heldTime)).toBe(true);
  const newerTime=await assessmentStatus.locator('time').getAttribute('datetime');releaseRead();await readFinished;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // A timed-out response must never replace the newer explicit assessment.
  await expect.poll(async()=>Date.parse(await assessmentStatus.locator('time').getAttribute('datetime')||'')>=Date.parse(newerTime)).toBe(true);await expect(pack).toBeEnabled();
  await page.unroute('**/api/executive-assurance');
  await page.locator('nav button[aria-label="Control Library"]').evaluate(el=>el.click());
  const workspace=page.locator('.control-assurance-workspace'),disclosure=page.locator('.module-analysis-disclosure').filter({has:workspace});
  if(!(await disclosure.evaluate(el=>el.open)))await disclosure.locator(':scope > summary').click();
  await workspace.getByLabel('View',{exact:true}).selectOption('all');await workspace.getByLabel('Search controls').fill(controlRef);
  await workspace.getByRole('button',{name:`Review ${controlRef}`,exact:true}).click();
  const detail=workspace.locator('.control-assurance-drilldown'),evidenceStage=detail.locator('.control-assurance-stage').filter({has:page.locator('summary').filter({hasText:/^Evidence1$/})});
  await detail.getByRole('tab',{name:/^Evidence/}).click();
  await evidenceStage.locator('summary').click();await expect(detail).toContainText(diagnostic.en);
  for(const lang of ['en','tr']){
    await page.locator('.language-switch:visible').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();await expect(detail).toContainText(diagnostic[lang]);
    for(const theme of ['light','dark'])for(const width of [1536,390]){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await page.setViewportSize({width,height:960});await detail.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);assert.ok(await detail.evaluate(el=>el.scrollWidth-el.clientWidth)<=4);
      await page.screenshot({path:`${out}/projection-${lang}-${theme}-${width}.png`});
    }
    await page.setViewportSize({width:1536,height:960});
  }
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());
  // Exact portfolio navigation above already selected this audit; module switches preserve it.
  await page.getByRole('tab',{name:'Assurance',exact:true}).click();
  await expect(page.locator('.audit-readiness-gate')).toContainText(name);
  const gate=page.locator('.audit-readiness-gate');await expect(gate.locator('.audit-readiness-state>span')).toHaveText('NOT READY');
  await gate.locator('.audit-readiness-gaps>summary').click();await expect(gate).toContainText(diagnostic.en);
  const evaluatedAt=await gate.locator('.audit-readiness-actions time').getAttribute('datetime');
  const [htmlDownload]=await Promise.all([page.waitForEvent('download'),gate.getByRole('button',{name:'HTML Snapshot',exact:true}).click()]);await htmlDownload.saveAs(`${out}/projection.html`);
  const html=await fs.readFile(`${out}/projection.html`,'utf8');assert.ok(html.includes(diagnostic.en));assert.ok(html.includes(evaluatedAt));
  const [csvDownload]=await Promise.all([page.waitForEvent('download'),gate.getByRole('button',{name:'CSV',exact:true}).click()]);await csvDownload.saveAs(`${out}/projection.csv`);assert.ok((await fs.readFile(`${out}/projection.csv`,'utf8')).includes('configuration-changed'));
  await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();await expect(gate).toContainText(diagnostic.tr);await expect(gate.locator('.audit-readiness-state>span')).toHaveText('HAZIR DEĞİL');
  await gate.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/audit-tr-dark.png`});
  // A new current receipt restores readiness; the old evidence and its diagnostics remain historical.
  await seedCurrentAssessmentFixture({ruleIds:[ruleId],prefix:'QA-PROJ-SECOND',out});
  const recovered=await api(readiness);assert.equal(recovered.gate,'ready');assert.equal(recovered.evidence.requirements[0].currentEvidence,1);assert.equal(recovered.evidence.requirements[0].linkedEvidence,2);
  assert.equal((await api('/api/executive-assurance')).auditPortfolio.audits.find(a=>a.id===auditId).gate,'ready');
  await gate.getByRole('button',{name:'Hazırlığı yeniden kontrol et',exact:true}).click();await expect(gate.locator('.audit-readiness-state>span')).toHaveText('DENETİME HAZIR');
  snapshot=await api('/api/controls/assurance');const historical=snapshot.rows.find(row=>row.id===initial.evidenceId);assert.equal(historical.data.automationAssessment,'configuration-changed');assert.equal(historical.data.assessmentFingerprint,original.data.assessmentFingerprint);assert.equal(historical.data.collectedAt,original.data.collectedAt);
  // Returning the collector to its original configuration still requires another current test.
  await api('/api/evidence-automation','POST',{...source,baseUrl:'https://fixture.example/initial'});assert.notEqual((await api(readiness)).gate,'ready');
  await seedCurrentAssessmentFixture({ruleIds:[ruleId],prefix:'QA-PROJ-THIRD',out});assert.equal((await api(readiness)).gate,'ready');
  assert.deepEqual(errors,[]);await fs.writeFile(`${out}/summary.json`,JSON.stringify({checks,passed:true,errors,coverage:'Local D1 source-edit invalidation, recovery, A-B-A, historical proof, EN/TR executive/control/audit diagnostics, canonical executive audit portfolio, orphan scope detection, unique audit counting, empty scopes, exact audit navigation, unavailable/partial export gating and recovery, timestamped HTML/CSV, desktop/mobile light/dark. External collectors are substituted in unit tests.'},null,2));
  console.log(`CURRENT_ASSESSMENT_QA_PASS: ${checks} API checks; current source/run/evidence projection, recovery and A-B-A; bilingual executive/audit/control explanations and exports; failed/partial evidence snapshot recovery; responsive light/dark.`);
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,body:await page.locator('main').innerText().catch(()=>'' )},null,2));throw error}
finally{try{await page.close();if(seeded)await seed(`DELETE FROM simple_grc_record_codes WHERE record_id GLOB 'QA-PROJ-*';DELETE FROM simple_grc_records WHERE id GLOB 'QA-PROJ-*';DELETE FROM evidence_automation_runs WHERE rule_id=${q(ruleId)};DELETE FROM evidence_automation_rules WHERE id=${q(ruleId)};DELETE FROM evidence_automation_sources WHERE id=${q(sourceId)};`);for(const id of [auditId,...extraAuditIds].filter(Boolean))await seed(`DELETE FROM simple_grc_metadata WHERE key=${q('audit_catalog_'+id)};DELETE FROM simple_audits WHERE id=${q(id)};`)}finally{await browser.close()}}
