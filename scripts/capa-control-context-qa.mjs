import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Fixed loopback + explicit --local D1: synthetic lineage fixtures never target customer data.
// Actual collection, atomic persistence and canonical promotion run against SQLite in unit tests.
const base = 'http://127.0.0.1:4173', out = 'capa-control-qa-artifacts', password = 'Fornost-QA!2026-Branch';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const admin = await browser.newContext({ viewport: { width: 1536, height: 960 } }), page = await admin.newPage();
page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
let checks = 0;
async function api(context, path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); checks++; return response.json();
}
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
async function seed(content) {
  const file = `${out}/local-fixture.sql`; await fs.writeFile(file, content);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.d1.jsonc', '--file', file], { stdio: 'pipe', timeout: 60000 });
}
try {
  await api(admin, '/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password });
  const endpoint = '/api/findings/control-context';
  await api(admin, endpoint, 'GET', undefined, 400); await api(admin, `${endpoint}?findingId=missing`, 'GET', undefined, 404);
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const finding = await api(admin, '/api/findings', 'POST', { action: 'create', sourceType: 'control', sourceRef: 'QA-CONTEXT-RULE', sourceTitle: 'QA device compliance', findingType: 'control-deficiency', title: 'QA CAPA control context', description: 'The isolated QA device population has incomplete compliance coverage.', severity: 'high', owner: 'qa-owner@fornost.test', reviewer: 'qa-reviewer@fornost.test', rootCause: 'Device policy assignments are incomplete.', correctiveAction: 'Complete device policy assignments and verify the affected records.', preventiveAction: 'Review device policy assignments monthly with the assigned owner.', dueDate: due, riskRef: 'QA-CONTEXT-FINDING', controlRef: 'A.8.1' }, 201);
  assert.equal((await api(admin, `${endpoint}?findingId=${finding.id}`)).context.state, 'not-applicable');
  const stamp = new Date().toISOString(), hash = 'a'.repeat(64);
  const assessment = { templateId: 'intune-compliance', templateVersion: 1, status: 'fail', total: 3, passed: 1, failed: 1, unknown: 1, score: 33, evaluatedAt: stamp, scope: 'credential-visible', issuesTruncated: false, issues: [{ id: 'qa-device-2', name: 'QA Workstation', status: 'fail', reason: 'not-compliant' }, { id: 'qa-device-3', name: 'QA Unknown device', status: 'unknown', reason: 'missing-state' }] };
  const lineage = { automationFindingRef: 'QA-CONTEXT-FINDING', automationRuleRef: 'QA-CONTEXT-RULE', controlRef: 'A.8.1', originEvidenceReference: 'QA-CONTEXT-BASELINE', originEvidenceSha256: hash };
  await seed(`
    UPDATE enterprise_findings SET source_type='continuous-control' WHERE id=${sql(finding.id)};
    INSERT INTO enterprise_finding_events(id,finding_id,action,detail,evidence_reference,evidence_sha256,actor,created_at) VALUES('QA-CONTEXT-EVENT',${sql(finding.id)},'continuous-assurance-promotion','Isolated synthetic promotion fixture','QA-CONTEXT-BASELINE',${sql(hash)},'qa-reviewer@fornost.test',${sql(stamp)});
    INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('QA-CONTEXT-RULE','Intune device compliance','QA-CONTEXT-SOURCE','A.8.1','$','template','','daily',${sql(stamp)},${sql(stamp)},'qa');
    INSERT INTO evidence_automation_findings(id,rule_id,title,severity,owner,due_date,detail,created_at,updated_at,occurrence_count) VALUES('QA-CONTEXT-FINDING','QA-CONTEXT-RULE','QA device compliance','high','qa-owner@fornost.test',${sql(due)},'QA repeated failure',${sql(stamp)},${sql(stamp)},2);
    INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor,result_ref,completed_at) VALUES('QA-CONTEXT-WORK','QA-CONTEXT-FINDING','QA-CONTEXT-RULE','capa-promotion','completed',${sql(JSON.stringify({ candidate: { lineage } }))},${sql(stamp)},${sql(stamp)},'qa',${sql(finding.id)},${sql(stamp)});
    ${['BASELINE', 'LATEST'].map(key => `INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor,assessment_json) VALUES('QA-CONTEXT-${key}-RUN','QA-CONTEXT-RULE','Intune device compliance','Isolated QA fixture','fail',33,${sql(`QA ${key} result: 1 failed and 1 unverified device`)},${sql(hash)},'QA-CONTEXT-${key}',${sql(stamp)},'qa',${sql(JSON.stringify(assessment))});`).join('\n')}
  `);
  const persisted = (await api(admin, `${endpoint}?findingId=${finding.id}`)).context;
  assert.equal(persisted.state, 'available'); assert.equal(persisted.baseline.id, 'QA-CONTEXT-BASELINE-RUN'); assert.equal(persisted.latest.id, 'QA-CONTEXT-LATEST-RUN');
  for (const [role, scope] of [['Viewer', { mode: 'full' }], ['Editor', { mode: 'scoped', modules: { 'Risk Assessment': 'read' } }]]) {
    const email = `qa-capa-${role.toLowerCase()}@fornost.test`;
    await api(admin, '/api/users', 'POST', { name: `QA CAPA ${role}`, email, password, role, moduleAccess: scope }, 201);
    const actor = await browser.newContext(); await api(actor, '/api/auth', 'POST', { action: 'login', email, password });
    await api(actor, `${endpoint}?findingId=${finding.id}`, 'GET', undefined, role === 'Viewer' ? 200 : 403);
    if (role === 'Viewer') {
      const viewerPage = await actor.newPage(); await viewerPage.goto(base); await expect(viewerPage.locator('.shell')).toBeVisible();
      await viewerPage.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
      await viewerPage.locator('nav button[aria-label="Findings & CAPA"]').evaluate(el => el.click());
      await viewerPage.locator('.finding-table tbody tr').filter({ hasText: 'QA CAPA control context' }).click();
      await expect(viewerPage.locator('.finding-control-context')).toContainText('Latest control test');
      await expect(viewerPage.getByRole('button', { name: 'Start CAPA', exact: true })).toHaveCount(0);
    }
    await actor.close();
  }
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="Findings & CAPA"]').evaluate(el => el.click());
  await page.locator('.finding-table tbody tr').filter({ hasText: 'QA CAPA control context' }).click();
  const panel = page.locator('.finding-control-context'); await expect(panel).toContainText('QA LATEST result');
  await panel.getByRole('button', { name: 'Test used for CAPA promotion' }).click(); await expect(panel).toContainText('QA BASELINE result');
  await panel.getByRole('button', { name: 'Latest control test' }).click(); await panel.getByRole('button', { name: 'Show affected records', exact: true }).click();
  await expect(panel).toContainText('QA Workstation'); await expect(panel).toContainText('does not close CAPA');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1536, 390]) {
      await page.setViewportSize({ width, height: 960 }); await panel.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4);
      assert.ok(await panel.evaluate(el => el.scrollWidth - el.clientWidth) <= 4);
      await page.screenshot({ path: `${out}/capa-context-${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.route('**/api/findings/control-context?*', route => route.fulfill({ status: 503, json: { error: 'Isolated error fixture' } }));
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(panel.getByRole('alert')).toContainText('could not be loaded');
  await page.unroute('**/api/findings/control-context?*'); await panel.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(panel).toContainText('Latest control test');
  await seed("UPDATE evidence_automation_runs SET status='pass',detail='QA recovered control',assessment_json=NULL WHERE id='QA-CONTEXT-LATEST-RUN';");
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(panel).toContainText('QA recovered control');
  assert.equal((await api(admin, '/api/findings')).findings.find(row => row.id === finding.id).status, 'open');
  await seed("DELETE FROM continuous_assurance_work_items WHERE id='QA-CONTEXT-WORK';");
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(panel).toContainText('Verified promotion lineage is unavailable');
  assert.deepEqual(errors, []);
  console.log(`CAPA_CONTROL_QA_PASS: ${checks} API checks; real local endpoint lineage, Viewer/scoped boundaries, baseline/latest selection, affected records, both themes and widths, retry, missing lineage and passing-test closure protection`);
} catch (error) { await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error; }
finally { await browser.close(); }
