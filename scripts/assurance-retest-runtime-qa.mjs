import { qaPassword } from "./qa-credentials.mjs";
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Fixed localhost origin and --local D1. Vendor HTTP is substituted in SQLite unit tests.
const base = 'http://127.0.0.1:4173', out = 'assurance-retest-qa-artifacts', password = qaPassword();
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const admin = await browser.newContext({ viewport: { width: 1536, height: 960 } }), checker = await browser.newContext(), page = await admin.newPage();
page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
let checks = 0, schemasReady = false;
async function api(context, path, method = 'GET', data, expected = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), expected, `${path}: ${await response.text()}`); checks++; return response.json();
}
const q = value => `'${String(value).replaceAll("'", "''")}'`;
async function seed(content) {
  const file = `${out}/local-fixture.sql`; await fs.writeFile(file, content);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.d1.jsonc', '--file', file], { stdio: 'pipe', timeout: 60000 });
}
const route = '/api/continuous-assurance', findingId = 'QA-RETEST-FINDING', ruleId = 'QA-RETEST-RULE';
try {
  await api(admin, '/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password });
  await api(admin, '/api/evidence-automation'); await api(admin, route);
  schemasReady = true;
  const email = 'qa-retest-checker@fornost.test';
  await api(admin, '/api/users', 'POST', { name: 'QA Retest Checker', email, password, role: 'Admin' }, 201);
  await api(checker, '/api/auth', 'POST', { action: 'login', email, password });
  const stamp = new Date().toISOString(), earlier = seconds => new Date(Date.now() - seconds * 1000).toISOString(), hash = 'b'.repeat(64), due = stamp.slice(0, 10);
  const risk = { title: 'QA Retest risk', owner: 'qa-risk-owner@fornost.test', status: 'Kapalı', category: 'Compliance', asset: 'QA only', inherentLikelihood: '4', inherentImpact: '4', residualLikelihood: '2', residualImpact: '3', residualRiskReviewRequired: true, riskReviewRequestedAt: earlier(600) };
  await seed(`
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES(${q(ruleId)},'QA Retest Coverage','QA-RETEST-SOURCE','A.8.1','coverage','gte','90','daily',${q(stamp)},${q(stamp)},'qa');
    INSERT INTO evidence_automation_findings(id,rule_id,title,severity,owner,due_date,status,detail,created_at,updated_at,closed_at,closure_evidence_ref,closure_evidence_sha256) VALUES(${q(findingId)},${q(ruleId)},'QA Retest finding','high','qa-risk-owner@fornost.test',${q(due)},'closed','Synthetic closed remediation',${q(earlier(240))},${q(earlier(180))},${q(earlier(180))},'QA-CLOSURE',${q(hash)});
    INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(${q(findingId)},'Risk Assessment',${q(JSON.stringify(risk))},${q(stamp)},${q(stamp)});
    INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor,reviewed_by,reviewed_at) VALUES('QA-RETEST-WORK',${q(findingId)},${q(ruleId)},'control-retest','approved-awaiting-retest',${q(JSON.stringify({ riskRef: findingId, targetControlRef: 'A.8.1' }))},${q(earlier(160))},${q(earlier(120))},'qa-maker@fornost.test','qa-checker@fornost.test',${q(earlier(120))});
    INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,created_at,actor,error_code) VALUES('QA-RETEST-ERROR',${q(ruleId)},'QA Retest Coverage','Synthetic QA','error',0,'QA connector unavailable',${q(hash)},${q(earlier(60))},'qa','SOURCE_REQUEST_FAILED');
  `);
  await seed(`INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at,retest_required,retest_work_item_id,lifecycle_updated_at) VALUES('QA-RETEST-EXCEPTION',${q(findingId)},${q(ruleId)},'A.8.1',${q(findingId)},'Synthetic expired exception for retry closure',${q(due)},'QA-EVD',${q(hash)},'expired','qa',${q(earlier(240))},1,'QA-RETEST-WORK',${q(earlier(150))});`);
  let work = (await api(admin, route)).items.find(row => row.id === 'QA-RETEST-WORK');
  assert.equal((await api(admin,route+'/governance')).exceptions.find(row=>row.id==='QA-RETEST-EXCEPTION').retestRequired,true);
  assert.equal(work.status, 'retest-error'); assert.equal(work.retestOutcome.reason, 'collection-error'); assert.equal(work.retestOutcome.riskUpdate, 'applied');
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el => el.click());
  await page.locator('.connected-grc').getByRole('button', { name: 'Assurance', exact: true }).click();
  const queue = page.locator('.assurance-work-queue');
  const item = queue.locator('.work-retest-error').filter({ hasText: 'QA Retest finding' });
  await expect(item).toBeVisible(); await item.getByRole('button', { name: 'View Test Result', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Re-test result', exact: true });
  await expect(dialog).toContainText('Collection or assessment did not complete'); await expect(dialog).toContainText('QA connector unavailable');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1536, 390]) {
      await page.setViewportSize({ width, height: 960 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4);
      assert.ok(await dialog.evaluate(el => el.scrollWidth - el.clientWidth) <= 4);
      await page.screenshot({ path: `${out}/retest-result-${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1536, height: 960 }); await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const queuedResponse = page.waitForResponse(response => response.url().endsWith(route) && response.request().method() === 'POST');
  await item.getByRole('button', { name: 'Request New Test', exact: true }).click();
  const queuedHttp = await queuedResponse; assert.equal(queuedHttp.status(), 201); const queued = await queuedHttp.json();
  await expect(queue.locator('.work-pending-review').filter({ hasText: 'QA Retest finding' }).getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  for(const filter of ['review','active','retest']){
    const result=await api(admin,`${route}?filter=${filter}&q=${encodeURIComponent(queued.id)}&lang=en`);
    assert.equal(result.filter,filter);
    assert.equal(result.coverage.complete,true);
    assert.deepEqual(result.items.map(row=>row.id),filter==='retest'?[]:[queued.id]);
  }
  const attention=await api(admin,`${route}?filter=attention&q=${encodeURIComponent(queued.id)}&lang=en`);
  assert.equal(attention.filter,'attention');assert.equal(attention.coverage.complete,true);
  assert.equal(attention.items.length,0);assert.equal(attention.scanned,1);
  assert.equal(new Date(attention.assessmentAt).toISOString(),attention.assessmentAt);
  for(const at of ['invalid','2099-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z'])await api(admin,`${route}?filter=attention&at=${encodeURIComponent(at)}`,'GET',undefined,400);
  for(const filter of ['unknown-filter','REVIEW',"' OR 1=1 --"]){
    await api(admin,`${route}?filter=${encodeURIComponent(filter)}`,'GET',undefined,400);
  }
  await api(admin, route, 'POST', { action: 'review-work-item', workItemId: queued.id, decision: 'approve' }, 409);
  // Both approval paths must reject broken source links, including stale CAPA snapshots.
  for(const state of ['missing-finding','missing-rule','rule-mismatch']){
    try{
      const mutation=state==='missing-finding'?`UPDATE continuous_assurance_work_items SET finding_id='QA-MISSING-FINDING' WHERE id=${q(queued.id)};`:state==='missing-rule'?`UPDATE continuous_assurance_work_items SET rule_id='QA-MISSING-RULE' WHERE id=${q(queued.id)};`:`UPDATE evidence_automation_findings SET rule_id='QA-OTHER-RULE' WHERE id=${q(findingId)};`;
      await seed(mutation);
      assert.equal((await api(admin,route)).items.find(row=>row.id===queued.id).sourceState,state);
      for(const action of ['control-retest','capa-promotion']){
        await seed(`UPDATE continuous_assurance_work_items SET action=${q(action)} WHERE id=${q(queued.id)};`);
        const rejected=await api(checker,route,'POST',{action:'review-work-item',workItemId:queued.id,decision:'approve'},409);
        assert.match(rejected.error,/Kaynak bulgu\/kural bağlantısı/);
      }
    }finally{
      await seed(`UPDATE continuous_assurance_work_items SET finding_id=${q(findingId)},rule_id=${q(ruleId)},action='control-retest' WHERE id=${q(queued.id)}; UPDATE evidence_automation_findings SET rule_id=${q(ruleId)} WHERE id=${q(findingId)};`);
    }
  }
  assert.equal((await api(admin,route)).items.find(row=>row.id===queued.id).sourceState,'linked');
  // Approval revalidates remediation, even if it was valid when the work was queued.
  await seed(`UPDATE evidence_automation_findings SET status='acknowledged' WHERE id=${q(findingId)};`);
  await api(checker, route, 'POST', { action: 'review-work-item', workItemId: queued.id, decision: 'approve' }, 409);
  await seed(`UPDATE evidence_automation_findings SET status='closed' WHERE id=${q(findingId)};`);
  await api(checker, route, 'POST', { action: 'review-work-item', workItemId: queued.id, decision: 'approve' });
  await api(checker, route, 'POST', { action: 'review-work-item', workItemId: queued.id, decision: 'approve' }, 409);
  const passedAt = new Date().toISOString(), evidenceId = 'QA-RETEST-PASS-EVD';
  const evidence = { evidenceTitle: 'QA passing retest', validationStatus: 'pass', responseHash: hash, collectedAt: passedAt, freshUntil: new Date(Date.now() + 86400000).toISOString(), controlRef: 'A.8.1' };
  await seed(`
    INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(${q(evidenceId)},'Kanıtlar',${q(JSON.stringify(evidence))},${q(passedAt)},${q(passedAt)});
    INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor) VALUES('QA-RETEST-PASS',${q(ruleId)},'QA Retest Coverage','Synthetic QA','pass',100,'QA passing retest with fresh proof',${q(hash)},${q(evidenceId)},${q(passedAt)},'qa');
    ${Array.from({ length: 26 }, (_, i) => `INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor) VALUES('QA-RETEST-HISTORY-${i}',${q(findingId)},${q(ruleId)},'capa-promotion','rejected','{}',${q(earlier(500))},${q(earlier(500))},'qa');`).join('\n')}
  `);
  work = (await api(admin, route)).items.find(row => row.id === queued.id);
  assert.equal(work.status, 'completed'); assert.equal(work.resultRef, 'QA-RETEST-PASS'); assert.equal(work.retestOutcome.reason, 'passed');
  const completedException=(await api(admin,route+'/governance')).exceptions.find(row=>row.id==='QA-RETEST-EXCEPTION');
  assert.equal(completedException.retestRequired,false);assert.equal(completedException.retestResultRef,'QA-RETEST-PASS');assert.equal(completedException.retestWorkItemId,queued.id);assert.ok(completedException.retestCompletedAt);assert.equal(completedException.status,'expired');
  const governance=page.locator('.assurance-governance'),disclosure=governance.locator('xpath=ancestor::details[1]');if(!(await disclosure.evaluate(el=>el.open)))await disclosure.locator(':scope > summary').click();
  await governance.getByRole('button',{name:'Refresh governance',exact:true}).click();await expect(governance.getByRole('button',{name:'Refresh governance',exact:true})).toBeEnabled();await governance.getByLabel('Search risks, proposals or exceptions').fill('QA-RETEST-EXCEPTION');await expect(governance).toContainText('RE-TEST COMPLETED');await governance.locator('.ag-grid>article').nth(1).screenshot({path:`${out}/exception-completed.png`});
  const riskAfter = JSON.parse((await api(admin, '/api/grc')).rows.find(row => row.id === findingId).data_json);
  assert.equal(riskAfter.residualRiskReviewRequired, true); assert.equal(riskAfter.residualScore, '6'); assert.equal(riskAfter.riskReviewRequestedAt, risk.riskReviewRequestedAt);
  await queue.getByRole('button', { name: 'Refresh', exact: true }).click();
  await queue.locator('.assurance-work-filters').getByRole('button', { name: 'All', exact: true }).click();
  await expect(queue.locator('.assurance-work-list>article')).toHaveCount(25);
  await queue.getByRole('button', { name: 'Show more', exact: true }).click();
  assert.ok(await queue.locator('.assurance-work-list>article').count() > 25);
  await page.route('**/api/continuous-assurance', route => route.request().method() === 'GET' ? route.fulfill({ status: 503, json: { error: 'Isolated error fixture' } }) : route.continue());
  await queue.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(queue.getByRole('alert')).toContainText('could not be loaded');
  await expect(queue.locator('.assurance-work-empty')).toHaveCount(0);
  await page.unroute('**/api/continuous-assurance'); await queue.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(queue.getByRole('alert')).toHaveCount(0);
  // Mandatory exception retries may test an open finding, but must inherit an approved error work item.
  await seed(`UPDATE evidence_automation_findings SET status='acknowledged' WHERE id=${q(findingId)};
    INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor,reviewed_by,reviewed_at) VALUES('QA-MANDATORY-ERROR',${q(findingId)},${q(ruleId)},'control-retest','retest-error',${q(JSON.stringify({source:'assurance-exception',mandatory:true,exceptionId:'QA-EXCEPTION',riskRef:findingId,controlRef:'A.8.1'}))},${q(stamp)},${q(stamp)},'qa-original-maker@fornost.test','qa-original-checker@fornost.test',${q(stamp)});`);
  await api(admin, route, 'POST', {action:'queue-retest',findingId},409);
  await api(admin, route, 'POST', {action:'queue-retest',findingId,previousWorkItemId:'not-the-approved-work'},409);
  const mandatory=await api(admin, route, 'POST', {action:'queue-retest',findingId,previousWorkItemId:'QA-MANDATORY-ERROR'},201);
  await api(checker, route, 'POST', {action:'review-work-item',workItemId:mandatory.id,decision:'approve'});
  assert.deepEqual(errors, []);
} catch (error) { await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error; }
finally {
  try {
    await page.close();
    if (schemasReady) {
      // These deliberately minimal local fixtures must not become seeds for later CRUD suites.
      // Include API-generated work IDs; never delete other scenarios' records.
      await seed(`
        DELETE FROM continuous_assurance_exceptions WHERE id='QA-RETEST-EXCEPTION';
        DELETE FROM continuous_assurance_work_items WHERE finding_id=${q(findingId)} AND rule_id=${q(ruleId)};
        DELETE FROM evidence_automation_runs WHERE rule_id=${q(ruleId)};
        DELETE FROM simple_grc_record_codes WHERE record_id IN (${q(findingId)},'QA-RETEST-PASS-EVD');
        DELETE FROM simple_grc_records WHERE id IN (${q(findingId)},'QA-RETEST-PASS-EVD');
        DELETE FROM evidence_automation_findings WHERE id=${q(findingId)} AND rule_id=${q(ruleId)};
        DELETE FROM evidence_automation_rules WHERE id=${q(ruleId)};
      `);
      const remainingWork = (await api(admin, route)).items;
      assert.ok(!remainingWork.some(row => row.findingId === findingId || row.ruleId === ruleId));
      const remainingRecords = (await api(admin, '/api/grc')).rows;
      assert.ok(!remainingRecords.some(row => [findingId, 'QA-RETEST-PASS-EVD'].includes(row.id)));
    }
  } finally { await browser.close(); }
}
console.log(`ASSURANCE_RETEST_QA_PASS: ${checks} API checks; real reconciliation, UI results and retry, independent approval/revalidation, fresh proof, completed exception retry lineage, preserved risk review, pagination, load failure recovery, desktop/mobile in both themes and fixture cleanup`);
