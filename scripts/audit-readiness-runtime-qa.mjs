import {seedCurrentAssessmentFixture} from './current-assessment-qa-fixture.mjs';
import { qaPassword } from "./qa-credentials.mjs";
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Synthetic fixtures are confined to the fixed loopback app and explicitly local D1.
const base = 'http://127.0.0.1:4173', out = 'audit-readiness-qa-artifacts', password = qaPassword();
const name = 'QA Audit Readiness', endpoint = `/api/audits/readiness?auditName=${encodeURIComponent(name)}`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const admin = await browser.newContext({ viewport: { width: 1536, height: 960 } }), page = await admin.newPage();
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  window.__qaDownloadTrace = [];
  const original = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    window.__qaDownloadTrace.push({ action: 'create-blob', type: blob.type, size: blob.size, active: navigator.userActivation.isActive });
    return original(blob);
  };
  for (const action of ['pointerdown', 'pointerup', 'click']) document.addEventListener(action, event => {
    const target = event.target.closest?.('button,a[download]');
    if (target) window.__qaDownloadTrace.push({ action, label: target.textContent, file: target.getAttribute('download'), trusted: event.isTrusted, active: navigator.userActivation.isActive, x: event.clientX, y: event.clientY, scroll: scrollY });
  }, true);
});
let checks = 0, auditId = '', seeded = false;
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /same key/.test(message.text())) errors.push(message.text()); });
const q = value => `'${String(value).replaceAll("'", "''")}'`;
async function seed(sql) {
  const file = `${out}/local-fixture.sql`; await fs.writeFile(file, sql);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.d1.jsonc', '--file', file], { stdio: 'pipe', timeout: 60000 });
}
async function api(context, path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); checks++; return response.json();
}
try {
  await api(admin, '/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password });
  await api(admin, '/api/evidence-automation'); await api(admin, '/api/continuous-assurance');
  await api(admin, `${endpoint}${'x'.repeat(170)}`, 'GET', undefined, 400);
  auditId = (await api(admin, '/api/audits', 'POST', { name, template: 'Özel Denetim', auditOwner: 'QA', auditor: 'QA', auditType: 'Diğer Denetim' }, 201)).id;
  const stamp = new Date().toISOString(), date = stamp.slice(0, 10);
  const record = (id, module, data) => `INSERT INTO simple_grc_records VALUES(${q(id)},${q(module)},${q(JSON.stringify(data))},${q(stamp)},${q(stamp)});`;
  const evidence = i => ({ evidenceTitle: `QA readiness evidence ${i}`, controlRef: `QA-READY-CONTROL-${i}`, owner: 'QA', period: date, status: 'Onaylandı', freshUntil: new Date(Date.now() + 86400000).toISOString() });
  seeded = true;
  await seed([
    ...Array.from({ length: 10 }, (_, i) => record(`QA-READY-AUD-${i}`, 'Denetim Yönetimi', { auditName: name, controlRef: `QA-READY-CONTROL-${i}`, requirementRef: `QA-READY-CONTROL-${i}`, requirementTitle: `QA requirement ${i}`, owner: 'QA', status: 'Başlanmadı', dueDate: date })),
    record('QA-READY-EVD-0', 'Kanıtlar', evidence(0)),
    record('QA-READY-PENDING', 'Kanıtlar', {...evidence(1),status:'Taslak',reviewStatus:'pending'}),
    record('QA-READY-EXPIRED', 'Kanıtlar', {...evidence(2),freshUntil:'2020-01-01T00:00:00Z'}),
    record('QA-READY-AUD-DUP','Denetim Yönetimi',{auditName:name,controlRef:'QA-READY-CONTROL-2',requirementTitle:'Duplicate source',owner:'QA'}),
    ...Array.from({ length: 117 }, (_, i) => `INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,last_status,last_evidence_at,created_at,updated_at,updated_by) VALUES('QA-READY-RULE-${i}',${q(i < 110 ? `AA outside ${i}` : `ZZ QA readiness rule ${i}`)},'QA-READY-SOURCE',${q(i < 110 ? `QA-OUTSIDE-${i}` : `QA-OUTSIDE-${i}; QA-READY-CONTROL-${i - 110}`)},'value','eq','1','daily','fail',${q(stamp)},${q(stamp)},${q(stamp)},'qa');`),
  ].join('\n'));
  await seed(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('QA-READY-SOURCE','QA Readiness','Custom','Custom','rest-json','{}',${q(stamp)},${q(stamp)},'qa');`);
  const ruleIds=Array.from({length:117},(_,i)=>`QA-READY-RULE-${i}`);
  await seedCurrentAssessmentFixture({ruleIds,prefix:'QA-READY-FAIL',out,status:'fail'});
  const dashboard = await api(admin, '/api/continuous-assurance/dashboard');
  assert.ok(dashboard.priorities.every(row => !Array.from({ length: 7 }, (_, i) => `QA-READY-RULE-${i + 110}`).includes(row.ruleId)));
  const snapshot = await api(admin, endpoint);
  assert.equal(snapshot.gate, 'not-ready'); assert.equal(snapshot.verified, true); assert.equal(snapshot.blockerCount, 7); assert.equal(snapshot.evidence.total, 10); assert.equal(snapshot.evidence.requirements.find(row => row.reference === 'QA-READY-CONTROL-0').linkedEvidence, 1);
  assert.ok(snapshot.signals.every(row => row.targetControlRef.startsWith('QA-READY-CONTROL-')));
  assert.equal((await api(admin, '/api/audits/readiness?auditName=QA-NOT-EXISTING')).gate, 'empty');
  const anonymous = await browser.newContext(); await api(anonymous, endpoint, 'GET', undefined, 401); await anonymous.close();
  for (const [role, moduleAccess, expected] of [['Viewer', { mode: 'full' }, 200], ['Editor', { mode: 'scoped', modules: { 'Denetim Yönetimi': 'write', Kanıtlar: 'read' } }, 403]]) {
    const email = `qa-readiness-${role.toLowerCase()}@fornost.test`;
    await api(admin, '/api/users', 'POST', { name: `QA Readiness ${role}`, email, password, role, moduleAccess }, 201);
    const actor = await browser.newContext(); await api(actor, '/api/auth', 'POST', { action: 'login', email, password }); await api(actor, endpoint, 'GET', undefined, expected); await actor.close();
  }
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="Audit Management"]').evaluate(el => el.click());
  await page.locator('.audit-card-open').filter({ hasText: name }).click();
  const gate = page.locator('.audit-readiness-gate'); await expect(gate.locator('.audit-readiness-state>span')).toHaveText('NOT READY');
  // KPI cards operate within this audit; source links resolve one exact row or stay explicit about ambiguity.
  const requirements = gate.locator('.audit-readiness-gaps'), rows = requirements.locator('.audit-readiness-gap');
  await gate.locator('.audit-readiness-metrics button').nth(0).click();
  await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('QA-READY-CONTROL-0');
  await rows.first().getByRole('button',{name:'Open requirement',exact:true}).click();
  await expect(page.locator('.core-record-focus')).toContainText('QA-READY-AUD-0');
  await expect(gate).toHaveAttribute('aria-busy','false'); await expect(gate.locator('.audit-readiness-state>span')).toHaveText('NOT READY');
  await page.locator('.core-record-focus').getByRole('button',{name:'Show all records',exact:true}).click();
  await expect(gate.locator('.audit-readiness-metrics button').nth(1)).toBeEnabled();
  await gate.locator('.audit-readiness-metrics button').nth(1).click();
  await expect(rows).toHaveCount(2); await expect(requirements).toContainText('Evidence has not been approved.');
  await expect(requirements).toContainText('Validity expired or the date is invalid.');
  const duplicate=rows.filter({hasText:'QA-READY-CONTROL-2'});
  await expect(duplicate).toContainText('2 source requirements share this reference');
  await expect(duplicate.getByRole('button',{name:'Open requirement',exact:true})).toHaveCount(0);
  await gate.locator('.audit-readiness-metrics button').nth(2).click(); await expect(rows).toHaveCount(7);
  await gate.locator('.audit-readiness-metrics button').nth(3).click(); await expect(rows).toHaveCount(8);
  await gate.getByRole('button',{name:/Show more requirements/}).click(); await expect(rows).toHaveCount(10);
  await gate.getByRole('searchbox',{name:'Search requirements'}).fill('CONTROL-2'); await expect(rows).toHaveCount(1);
  const [filteredDownload]=await Promise.all([page.waitForEvent('download'),gate.getByRole('button',{name:'CSV',exact:true}).click()]);
  await filteredDownload.saveAs(`${out}/filtered-full-scope.csv`);
  const filteredCsv=await fs.readFile(`${out}/filtered-full-scope.csv`,'utf8');
  assert.equal(filteredCsv.split('\r\n').filter(line=>line.startsWith('"requirement",')).length,10);
  assert.ok(filteredCsv.includes('approval-required'));assert.ok(filteredCsv.includes('expired'));assert.ok(filteredCsv.includes('QA-READY-CONTROL-9'));
  await gate.getByRole('searchbox',{name:'Search requirements'}).fill('');
  await gate.getByRole('combobox',{name:'Requirement view',exact:true}).selectOption('gaps');

  await expect(gate.locator('.audit-readiness-gaps .audit-readiness-gap')).toHaveCount(8);
  await gate.getByRole('button', { name: /Show more gaps/ }).click(); await expect(gate.locator('.audit-readiness-gaps .audit-readiness-gap')).toHaveCount(9);
  await gate.locator('.audit-readiness-gaps .audit-readiness-gap').last().scrollIntoViewIfNeeded();
  await expect(gate.locator('.audit-readiness-gaps .audit-readiness-gap').last()).toBeInViewport();
  await gate.locator('.audit-readiness-assurance>summary').click();
  await expect(gate.locator('.audit-readiness-assurance .audit-readiness-gap')).toHaveCount(6);
  await gate.getByRole('button', { name: /Show more signals/ }).click(); await expect(gate.locator('.audit-readiness-assurance .audit-readiness-gap')).toHaveCount(7);
  await gate.locator('.audit-readiness-metrics button').nth(4).click();
  await expect(gate.getByRole('button',{name:'Blockers only',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(gate.locator('.audit-readiness-assurance .audit-readiness-gap')).toHaveCount(6);
  await gate.getByRole('button',{name:/Show more signals/}).click();
  // Compare the report with the evaluation actually rendered, not a request that may be superseded.
  await expect(gate).toContainText(`Scope: ${name}`);
  const evaluatedAt = await gate.locator('.audit-readiness-actions time').getAttribute('datetime');
  assert.ok(Number.isFinite(Date.parse(evaluatedAt)));
  const [download] = await Promise.all([page.waitForEvent('download'), gate.getByRole('button', { name: 'HTML Snapshot', exact: true }).click()]);
  await download.saveAs(`${out}/readiness.html`);
  const report = await fs.readFile(`${out}/readiness.html`, 'utf8'); assert.ok(report.includes(evaluatedAt)); assert.ok(report.includes('QA readiness rule 116'));
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1536, 390]) {
      await page.setViewportSize({ width, height: 960 }); await gate.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4);
      assert.ok(await gate.evaluate(el => el.scrollWidth - el.clientWidth) <= 4);
      await page.screenshot({ path: `${out}/audit-readiness-${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.route('**/api/audits/readiness?*', route => route.fulfill({ status: 503, json: { error: 'Isolated transport fixture' } }));
  await gate.getByRole('button', { name: 'Recheck readiness', exact: true }).click();
  await expect(gate.getByRole('alert')).toContainText('could not be loaded');
  await expect(gate.locator('.audit-readiness-state>span')).toHaveText('UNVERIFIED'); await expect(gate.getByRole('button', { name: 'HTML Snapshot', exact: true })).toBeDisabled();
  await page.unroute('**/api/audits/readiness?*');
  await gate.getByRole('button', { name: 'Recheck readiness', exact: true }).click(); await expect(gate.getByRole('alert')).toHaveCount(0);
  // A real invalid persisted record must return an unverified evaluation, not an empty pass.
  await seed("UPDATE simple_grc_records SET data_json='broken-json' WHERE id='QA-READY-EVD-0';");
  assert.equal((await api(admin, endpoint)).gate, 'unverified');
  await gate.getByRole('button', { name: 'Recheck readiness', exact: true }).click(); await expect(gate.getByRole('alert')).toContainText('incomplete or unreadable');
  await seed(`UPDATE simple_grc_records SET data_json=${q(JSON.stringify(evidence(0)))} WHERE id='QA-READY-EVD-0';
    DELETE FROM simple_grc_records WHERE id IN ('QA-READY-PENDING','QA-READY-EXPIRED');
    ${Array.from({ length: 9 }, (_, i) => record(`QA-READY-EVD-${i + 1}`, 'Kanıtlar', evidence(i + 1))).join('\n')}
    `);
  await seedCurrentAssessmentFixture({ruleIds,prefix:'QA-READY-PASS',out});
  await gate.getByRole('button', { name: 'Recheck readiness', exact: true }).click(); await expect(gate.locator('.audit-readiness-state>span')).toHaveText('AUDIT READY');
  await expect(gate.getByRole('button', { name: 'HTML Snapshot', exact: true })).toBeEnabled();
  let localeReloads=0;const countLocaleReload=request=>{if(new URL(request.url()).pathname==='/api/grc')localeReloads++;};page.on('request',countLocaleReload);
  await page.locator('.language-switch:visible').getByRole('button', { name: 'TR', exact: true }).click(); await expect(gate.locator('.audit-readiness-state>span')).toHaveText('DENETİME HAZIR');
  // Keep the click error visible instead of masking it with an earlier download timeout.
  const pendingTurkish = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await gate.getByRole('button', { name: 'HTML Özeti', exact: true }).click();
  const turkishDownload = await pendingTurkish;
  assert.ok(turkishDownload, 'Turkish report click completed but no download was emitted');
  await turkishDownload.saveAs(`${out}/readiness-tr.html`); assert.ok((await fs.readFile(`${out}/readiness-tr.html`, 'utf8')).includes('Denetim Hazırlık Özeti'));
  assert.equal(localeReloads,0,'Changing display language must not reload records or invalidate the readiness snapshot');page.off('request',countLocaleReload);
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), gate.getByRole('button', { name: 'CSV', exact: true }).click()]);
  await csvDownload.saveAs(`${out}/readiness.csv`);
  const csv = await fs.readFile(`${out}/readiness.csv`, 'utf8'); assert.ok(csv.includes('QA-READY-CONTROL-9')); assert.ok(csv.includes('"audit_name","evaluated_at","gate"'));
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  const diagnostics = { message: String(error), pageErrors: errors, trace: await page.evaluate(() => window.__qaDownloadTrace).catch(() => []), buttons: await page.locator('.audit-readiness-actions button').allTextContents().catch(() => []) };
  console.log('AUDIT_READINESS_FAILURE', JSON.stringify(diagnostics));
  await fs.writeFile(`${out}/failure.json`, JSON.stringify(diagnostics, null, 2));
  throw error;
}
finally {
  try {
    await page.close();
    if (seeded) await seed(`DELETE FROM simple_grc_record_codes WHERE record_id GLOB 'QA-READY-*';
      DELETE FROM simple_grc_records WHERE id GLOB 'QA-READY-*';
      DELETE FROM evidence_automation_runs WHERE rule_id GLOB 'QA-READY-RULE-*';
      DELETE FROM evidence_automation_rules WHERE id GLOB 'QA-READY-RULE-*';
      DELETE FROM evidence_automation_sources WHERE id='QA-READY-SOURCE';`);
    if (auditId) await seed(`DELETE FROM simple_audits WHERE id=${q(auditId)};`);
    if (seeded) assert.equal((await api(admin, endpoint)).evidence.total, 0);
  } finally { await browser.close(); }
}
console.log(`AUDIT_READINESS_QA_PASS: ${checks} API checks; full scope beyond dashboard window, multi-control linkage, role boundaries, real invalid-record recovery, scoped KPI filters/search, exact source links, ambiguous-source handling, complete gap/signal lists, full-scope filtered CSV, timestamped bilingual exports, load failure recovery and both themes at desktop/mobile`);
