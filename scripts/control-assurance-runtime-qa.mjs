import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Fixtures and persistence are confined to fixed loopback and explicit local D1.
const base = 'http://127.0.0.1:4173', out = 'control-assurance-qa-artifacts', password = 'Fornost-QA!2026-Branch';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const admin = await browser.newContext({ viewport: { width: 1536, height: 960 } }), page = await admin.newPage();
page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
let seeded = false, checks = 0, requests = 0;
page.on('request', request => { if (request.url().endsWith('/api/controls/assurance')) requests++; });
const q = value => `'${String(value).replaceAll("'", "''")}'`;
async function seed(sql) {
  const file = `${out}/local-fixture.sql`; await fs.writeFile(file, sql);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.d1.jsonc', '--file', file], { stdio: 'pipe', timeout: 60000 });
}
async function api(context, path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); checks++; return response.json();
}
const workspace = page.locator('.control-assurance-workspace');
async function openWorkspace() {
  await page.locator('nav button[aria-label="Control Library"]').evaluate(el => el.click());
  const disclosure = page.locator('.module-analysis-disclosure').filter({ has: workspace });
  if (!(await disclosure.evaluate(el => el.open))) await disclosure.locator(':scope > summary').click();
  await expect(workspace.getByRole('button', { name: 'Refresh assurance', exact: true })).toBeEnabled();
}
try {
  await api(admin, '/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password });
  await api(admin, '/api/grc'); await api(admin, '/api/evidence-automation'); await api(admin, '/api/evidence/history'); await api(admin, '/api/findings');
  const stamp = new Date().toISOString();
  const record = (id, module, data) => `INSERT INTO simple_grc_records VALUES(${q(id)},${q(module)},${q(JSON.stringify(data))},${q(stamp)},${q(stamp)});`;
  const evidence = i => ({ evidenceTitle: `QA CS evidence ${i}`, controlRef: 'QA-CS-11', owner: 'QA', period: '2026', status: i === 0 ? 'Taslak' : 'Onaylandı', freshUntil: new Date(Date.now() + (i === 1 ? -86400000 : 86400000)).toISOString() });
  seeded = true;
  await seed([
    ...Array.from({ length: 12 }, (_, i) => record(`QA-CS-C${i}`, 'Kontroller', { controlRef: `QA-CS-${String(i).padStart(2,'0')}`, controlTitle: `QA CS control ${i}`, owner: 'QA', testOwner: 'QA', nextTestDate: '2099-01-01' })),
    record('QA-CS-A', 'Denetim Yönetimi', { auditName: 'QA CS audit', controlRef: 'QA-CS-11', requirementRef: 'QA-CS-11', requirementTitle: 'QA CS requirement', riskRef: 'QA-CS-R' }),
    record('QA-CS-R', 'Risk Assessment', { riskTitle: 'QA CS linked risk', owner: 'QA', status: 'Açık' }),
    ...Array.from({ length: 7 }, (_, i) => record(`QA-CS-E${i}`, 'Kanıtlar', evidence(i))),
  ].join('\n'));
  const initial = await api(admin, '/api/controls/assurance'); assert.equal(initial.verified, true); assert.ok(initial.rows.some(row => row.id === 'QA-CS-C11'));
  const anonymous = await browser.newContext(); await api(anonymous, '/api/controls/assurance', 'GET', undefined, 401); await anonymous.close();
  for (const [role, moduleAccess, expected] of [['Viewer', { mode: 'full' }, 200], ['Editor', { mode: 'scoped', modules: { Kontroller: 'write', Kanıtlar: 'read' } }, 403]]) {
    const email = `qa-control-assurance-${role.toLowerCase()}@fornost.test`;
    await api(admin, '/api/users', 'POST', { name: `QA Control ${role}`, email, password, role, moduleAccess }, 201);
    const actor = await browser.newContext(); await api(actor, '/api/auth', 'POST', { action: 'login', email, password }); await api(actor, '/api/controls/assurance', 'GET', undefined, expected); await actor.close();
  }
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await openWorkspace(); await expect(workspace.getByRole('alert')).toHaveCount(0);
  await workspace.getByLabel('View', { exact: true }).selectOption('all'); await workspace.getByLabel('Search controls').fill('QA-CS');
  await expect(workspace.locator('.control-assurance-list>article')).toHaveCount(8);
  await workspace.getByRole('button', { name: 'Next', exact: true }).click(); await expect(workspace.locator('.control-assurance-list>article')).toHaveCount(4);
  await workspace.getByRole('button', { name: 'Review QA-CS-11', exact: true }).click();
  const detail = workspace.locator('.control-assurance-drilldown'); await expect(detail).toBeVisible();
  await expect(detail.locator('.control-impact-lens')).toContainText('1 risks');
  const evidenceStage = detail.locator('.control-assurance-stage').filter({ has: page.locator('summary').filter({ hasText: /^Evidence7$/ }) });
  await evidenceStage.locator('summary').click(); await expect(evidenceStage.locator('.control-assurance-stage-records>article')).toHaveCount(7);
  await expect(evidenceStage.locator('small').filter({ hasText: 'Current evidence' })).toHaveCount(5);
  await expect(evidenceStage.locator('small').filter({ hasText: 'Eligibility not established' })).toHaveCount(2);
  const lastEvidence = evidenceStage.locator('article').filter({ hasText: 'QA CS evidence 6' });
  await lastEvidence.scrollIntoViewIfNeeded(); await expect(lastEvidence).toBeInViewport();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1536, 390]) {
      await page.setViewportSize({ width, height: 960 }); await detail.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4);
      assert.ok(await workspace.evaluate(el => el.scrollWidth - el.clientWidth) <= 4);
      await page.screenshot({ path: `${out}/control-assurance-${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  const requestCount = requests;
  await page.locator('.language-switch:visible').getByRole('button', { name: 'TR', exact: true }).click();
  await expect(workspace.getByRole('button', { name: 'Güvenceyi yenile', exact: true })).toBeEnabled();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  assert.equal(requests, requestCount, 'Language/selection changes must not trigger extra source loads');
  const priorEvaluation = await workspace.locator('.control-assurance-evaluation').textContent();
  await page.route('**/api/controls/assurance', route => route.fulfill({ status: 503, json: { error: 'Isolated transport fixture' } }));
  await workspace.getByRole('button', { name: 'Refresh assurance', exact: true }).click(); await expect(workspace.getByRole('alert')).toContainText('could not be loaded');
  await expect(workspace.locator('.control-assurance-kpis strong').first()).toHaveText('—');
  await expect(workspace.locator('.control-assurance-evaluation')).toContainText(priorEvaluation);
  await page.unroute('**/api/controls/assurance');
  await workspace.getByRole('button', { name: 'Refresh assurance', exact: true }).click(); await expect(workspace.getByRole('alert')).toHaveCount(0);
  await seed("UPDATE simple_grc_records SET data_json='broken-json' WHERE id='QA-CS-E0';");
  assert.equal((await api(admin, '/api/controls/assurance')).verified, false);
  await workspace.getByRole('button', { name: 'Refresh assurance', exact: true }).click(); await expect(workspace.getByRole('alert')).toContainText('incomplete');
  await expect(workspace.locator('.control-assurance-kpis strong').first()).toHaveText('—');
  await seed(`UPDATE simple_grc_records SET data_json=${q(JSON.stringify(evidence(0)))} WHERE id='QA-CS-E0';`);
  await workspace.getByRole('button', { name: 'Refresh assurance', exact: true }).click(); await expect(workspace.getByRole('alert')).toHaveCount(0);
  const evidenceCode = await lastEvidence.locator('b').innerText();
  await lastEvidence.getByRole('button', { name: /Open record/ }).click();
  await expect(page.locator('.core-record-focus')).toContainText(evidenceCode);
  await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);
  await expect(page.locator('.table-card .table-wrap')).toContainText('QA CS evidence 6');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/summary.json`, JSON.stringify({ apiChecks: checks, pageErrors: errors, requests, passed: true }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  await fs.writeFile(`${out}/failure.json`, JSON.stringify({ message: String(error), pageErrors: errors, requests, body: await page.locator('main').innerText().catch(() => '') }, null, 2)); throw error;
} finally {
  try { await page.close(); if (seeded) await seed("DELETE FROM simple_grc_record_codes WHERE record_id GLOB 'QA-CS-*'; DELETE FROM simple_grc_records WHERE id GLOB 'QA-CS-*';"); }
  finally { await browser.close(); }
}
console.log(`CONTROL_ASSURANCE_QA_PASS: ${checks} API checks; role boundaries, complete pagination/relationships, exact evidence eligibility, scoped record navigation, one native evaluation, error and malformed record recovery, both themes at desktop/mobile`);
