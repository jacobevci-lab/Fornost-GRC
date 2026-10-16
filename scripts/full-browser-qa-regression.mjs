import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';

// Mutations are deliberately restricted to the isolated CI application.
const base = 'http://127.0.0.1:4173', out = 'full-browser-regression-artifacts';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const pageErrors = [], createdRecords = [], createdAudits = [], navigation = [];
page.on('pageerror', error => pageErrors.push(error.message));
const prefix = `QA-BROWSER-${Date.now()}`;
async function api(path, method = 'GET', data, expected = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), expected, `${method} ${path}: ${(await response.text()).slice(0,400)}`);
  return response.json();
}
async function openModule(label) {
  const button = page.locator('#fornost-navigation .nav-group-items button').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  const group = page.locator('#fornost-navigation .nav-group').filter({ has: page.getByRole('button', { name: label, exact: true, includeHidden: true }) });
  const toggle = group.locator('.nav-group-trigger');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(button).toBeVisible(); await button.click();
}
async function locale(value) { await page.locator('.language-switch:visible').getByRole('button', { name: value.toUpperCase(), exact: true }).click(); }
try {
  await api('/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() });
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  // Traverse actual visible groups and controls. A hidden DOM click cannot pass this check.
  for (const language of ['tr', 'en']) {
    await locale(language);
    const groups = page.locator('#fornost-navigation .nav-group');
    for (let groupIndex = 0; groupIndex < await groups.count(); groupIndex++) {
      const group = groups.nth(groupIndex), trigger = group.locator('.nav-group-trigger');
      if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
      const labels = await group.locator('.nav-group-items button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
      for (const label of labels) {
        const button = group.getByRole('button', { name: label, exact: true });
        await expect(button).toBeVisible(); await button.click();
        if (label === 'Ask Fornost') {
          const panel = page.locator('#fornost-ai-panel'); await expect(panel).toBeVisible();
          await expect(panel.getByRole('heading', { name: 'Ask Fornost', exact: true })).toBeVisible();
          await panel.locator('.fornost-ai-head button[data-escape-close]').click(); await expect(panel).toBeHidden();
        } else await expect(page.locator('main>header h1')).toHaveText(label);
        navigation.push({ language, label });
      }
    }
    assert.equal(navigation.filter(item => item.language === language).length, 27);
  }

  // A PATCH may complete before the following GET: the edit must stay locked until the new version is visible.
  const asset = await api('/api/grc', 'POST', { module: 'Varlık Envanteri', data: { title: `${prefix} asset`, assetType: 'Uygulama', businessUnit: 'Bilgi Güvenliği', owner: 'QA', criticality: 'Düşük', status: 'Aktif' } }, 201);
  createdRecords.push(asset.id);
  await page.reload(); await expect(page.locator('.shell')).toBeVisible(); await locale('en'); await openModule('Asset Inventory');
  const row = page.getByRole('row').filter({ hasText: `${prefix} asset` }); await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.locator('.record-dialog'); await dialog.locator('[name=title]').fill(`${prefix} asset edited`);
  let release, delayed = 0; const gate = new Promise(resolve => { release = resolve; });
  const handler = async route => { if (route.request().method() === 'GET') { delayed++; await gate; } await route.continue(); };
  await page.route('**/api/grc', handler);
  try {
    const patched = page.waitForResponse(response => response.url().endsWith('/api/grc') && response.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal((await patched).status(), 200);
    await expect.poll(() => delayed).toBeGreaterThan(0);
    await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${out}/save-waits-for-current-version.png` });
    release(); await expect(dialog).toBeHidden(); await expect(row).toContainText('asset edited');
  } finally { release(); await page.unroute('**/api/grc', handler); }
  page.once('dialog', d => d.accept());
  const deleted = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes(asset.id));
  await row.getByRole('button', { name: 'Delete', exact: true }).click(); assert.equal((await deleted).status(), 200);
  await expect(row).toHaveCount(0);

  // Create an audit through the UI, then repair one explicitly orphaned requirement through the UI.
  await openModule('Audit Management'); await page.getByRole('button', { name: '+ New Audit', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose and add an audit' });
  await picker.getByLabel('Template / option', { exact: true }).selectOption('Custom Audit');
  const auditName = `${prefix} audit`; await picker.getByLabel('Audit name', { exact: true }).fill(auditName);
  const auditCreated = page.waitForResponse(response => response.url().endsWith('/api/audits') && response.request().method() === 'POST');
  await picker.getByRole('button', { name: 'Add to Portfolio', exact: true }).click();
  const auditResponse = await auditCreated; assert.equal(auditResponse.status(), 201); const audit = await auditResponse.json(); createdAudits.push(audit.id);
  await expect(picker).toBeHidden();
  const orphan = await api('/api/grc', 'POST', { module: 'Denetim Yönetimi', data: { auditName: `${prefix} absent audit`, auditType: 'Diğer Denetim', auditOwner: 'QA', startDate: '2026-10-01', endDate: '2026-12-31', dueDate: '2026-12-01', businessUnit: 'Bilgi Güvenliği', requirementRef: `${prefix}-REQ`, requirementTitle: `${prefix} orphan`, owner: 'QA', status: 'Başlanmadı', progress: 0 } }, 201);
  createdRecords.push(orphan.id);
  await page.reload(); await expect(page.locator('.shell')).toBeVisible(); await openModule('Dashboard');
  const unassignedLink = page.getByRole('button', { name: 'Review unassigned requirements', exact: true });
  await expect(unassignedLink).toBeVisible(); await unassignedLink.click();
  await expect(page.locator('main>header h1')).toHaveText('Audit Management');
  const unassigned = page.getByRole('region', { name: 'Unassigned audit requirements', exact: true });
  const orphanRow = unassigned.getByRole('row').filter({ hasText: `${prefix} orphan` }); await expect(orphanRow).toBeVisible();
  for (const language of ['tr', 'en']) {
    await locale(language);
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [390, 1536]) {
        await page.setViewportSize({ width, height: 960 });
        await expect(page.locator('.audit-unassigned')).toBeVisible();
        assert.ok(await page.locator('.audit-unassigned').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        await page.locator('.audit-unassigned').screenshot({ path: `${out}/unassigned-${language}-${theme}-${width}.png` });
      }
    }
  }
  await orphanRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.locator('[name=auditName]').fill(auditName);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toBeHidden(); await expect(orphanRow).toHaveCount(0);
  const current = (await api('/api/grc')).rows.find(item => item.id === orphan.id);
  assert.equal(JSON.parse(current.data_json).auditName, auditName);
  await openModule('Audit Management'); await page.locator('.audit-card-open').filter({ hasText: auditName }).click();
  await expect(page.getByRole('row').filter({ hasText: `${prefix} orphan` })).toBeVisible();
  await page.getByRole('button', { name: '← All audits', exact: true }).click();
  const auditCard = page.locator('.audit-card').filter({ hasText: auditName });
  page.once('dialog', d => d.accept()); await auditCard.getByRole('button', { name: 'Delete Audit', exact: true }).click(); await expect(auditCard).toHaveCount(0);

  await locale('tr'); await openModule('Risk İştahı ve KRI'); await expect(page.getByRole('button', { name: 'KRI Ölçümleri', exact: true })).toBeVisible();
  await openModule('Güvenlik Olayları ve Kriz');
  await expect(page.getByRole('combobox', { name: 'Durum filtresi', exact: true }).locator('option[value=declared]')).toHaveText('İlan edildi');
  await page.getByRole('button', { name: '+ Olay İlan Et', exact: true }).click();
  const incident = page.getByRole('dialog', { name: 'Yeni güvenlik olayı', exact: true }); await expect(incident).toBeVisible();
  await expect(incident.getByLabel('Olay yöneticisi', { exact: true })).toBeVisible();
  await incident.getByLabel('Kategori', { exact: true }).selectOption('phishing'); await expect(incident.getByLabel('Kategori', { exact: true })).toHaveValue('phishing');
  await page.screenshot({ path: `${out}/incident-tr.png` }); await page.keyboard.press('Escape'); await expect(incident).toBeHidden();
  assert.deepEqual(pageErrors, []);
  await fs.writeFile(`${out}/summary.json`, JSON.stringify({ navigation, delayedSave: true, immediateDelete: true, auditCreateRepairDelete: true, languages: ['tr','en'], viewports: [390,1536], pageErrors }, null, 2));
  console.log('FULL_BROWSER_REGRESSION_PASS: 54 visible menu visits, save-refresh race, immediate deletion, audit create/orphan repair/delete, TR/EN light/dark responsive layouts and localized incident form');
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  await fs.writeFile(`${out}/failure.json`, JSON.stringify({ message: error.message, navigation, pageErrors }, null, 2));
  throw error;
} finally {
  await page.close();
  for (const id of createdAudits) { const response = await context.request.delete(`${base}/api/audits?id=${encodeURIComponent(id)}`, { headers: { origin: base } }); assert.ok([200,404].includes(response.status())); }
  for (const id of createdRecords) { const response = await context.request.delete(`${base}/api/grc?id=${encodeURIComponent(id)}`, { headers: { origin: base } }); assert.ok([200,404].includes(response.status())); }
  await browser.close();
}
