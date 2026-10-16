import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

// Mutations are deliberately restricted to the isolated CI application.
const base = 'http://127.0.0.1:4173', out = 'full-browser-regression-artifacts';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await createQaContext(browser, base, {}, { viewport: { width: 1536, height: 960 } });
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
async function verifyPinnedRegister(register, row, file) {
  await expect(row).toBeVisible(); await register.scrollIntoViewIfNeeded();
  await register.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  const bounds = await register.boundingBox(), identity = await row.locator('td').first().boundingBox(), actions = await row.locator('.row-actions-cell').boundingBox();
  assert.ok(identity.x >= bounds.x - 1 && identity.x + identity.width < actions.x, 'Record identity stays visible without overlapping actions');
  assert.ok(actions.x + actions.width <= bounds.x + bounds.width + 1, 'Record actions remain visible during horizontal scrolling');
  for (const heading of [register.locator('thead th').first(), register.locator('.row-actions-heading')]) {
    assert.equal(await heading.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const visibleNode = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return visibleNode === node || node.contains(visibleNode);
    }), true, 'Pinned identity/action headings remain unobscured by scrolled column headings');
  }
  await page.screenshot({ path: `${out}/${file}.png` });
}
try {
  await api('/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() });
  // A slow initial register must not start assurance reads against an empty,
  // temporary row scope and then abort them when the real records arrive.
  const assuranceReads = [], initialFailures = [];
  const isAssurance = request => ['/api/executive-assurance', '/api/continuous-assurance/executive'].includes(new URL(request.url()).pathname);
  const observeAssurance = request => { if (isAssurance(request)) assuranceReads.push(request.url()); };
  const observeInitialFailure = request => { if (isAssurance(request)) initialFailures.push({ url: request.url(), error: request.failure()?.errorText }); };
  page.on('request', observeAssurance); page.on('requestfailed', observeInitialFailure);
  let releaseRows, rowsHeld = false, rowsReads = 0;
  const rowsGate = new Promise(resolve => { releaseRows = resolve; });
  await page.route('**/api/grc', async route => { rowsHeld = true; rowsReads++; await rowsGate; await route.continue(); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.shell')).toBeVisible();
  await expect.poll(() => rowsHeld).toBe(true);
  await expect(page.getByRole('status').filter({ hasText: 'Gösterge paneli yükleniyor' })).toHaveAttribute('aria-busy', 'true');
  assert.equal(assuranceReads.length, 0, 'Dashboard waits for its initial record scope');
  releaseRows();
  await waitForQaIdle(page);
  await expect(page.locator('.executive-dashboard-reference')).toBeVisible();
  assert.ok(assuranceReads.some(url => url.endsWith('/api/executive-assurance')));
  assert.ok(assuranceReads.some(url => url.endsWith('/api/continuous-assurance/executive')));
  assert.deepEqual(initialFailures, [], 'Initial assurance reads complete without scope replacement aborts');
  let releaseSnapshot, snapshotReads = 0;
  const snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; });
  await page.route('**/api/executive-assurance', async route => { snapshotReads++; await snapshotGate; await route.continue(); });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => snapshotReads).toBe(1);
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    // Let browser request/abort events cross to the test process while the
    // response remains held; a duplicate refresh must not replace that read.
    await new Promise(resolve => setTimeout(resolve, 200));
  });
  assert.equal(snapshotReads, 1, 'Concurrent focus/visibility refreshes share the pending read');
  assert.deepEqual(initialFailures, [], 'Duplicate refresh signals do not abort the snapshot');
  releaseSnapshot();
  await waitForQaIdle(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => snapshotReads).toBe(2);
  await waitForQaIdle(page);
  assert.deepEqual(initialFailures, [], 'A later focus still refreshes after the prior read completes');
  assert.equal(rowsReads, 1, 'Unchanged session checks preserve the loaded record scope');
  await page.unroute('**/api/executive-assurance');
  page.off('request', observeAssurance); page.off('requestfailed', observeInitialFailure);
  await page.unroute('**/api/grc');
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

  // Long operational status badges must not squeeze dashboard headings into vertical letters on phones.
  for (const language of ['tr', 'en']) {
    await locale(language); await openModule(language === 'tr' ? 'Gösterge Paneli' : 'Dashboard');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [360, 390]) {
        await page.setViewportSize({ width, height: 960 });
        const summary = page.locator('.executive-operational-detail>summary');
        await expect(summary).toBeVisible();
        const title = await summary.locator(':scope>span').first().boundingBox();
        const badge = await summary.locator(':scope>span').nth(1).boundingBox();
        assert.ok(title.width >= 180 && title.height < 130, 'Mobile operational heading retains readable width');
        assert.ok(badge.y >= title.y + title.height - 1, 'Operational status is placed below its mobile heading');
        await summary.screenshot({ path: `${out}/dashboard-operational-${language}-${theme}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1536, height: 960 });
  }

  for (const language of ['tr', 'en']) {
    await locale(language); await openModule(language === 'tr' ? 'Denetim Yönetimi' : 'Audit Management');
    await expect(page.locator('.audit-readiness-gate')).toHaveAttribute('aria-busy', 'false');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [360, 390]) {
        await page.setViewportSize({ width, height: 960 });
        const actions = page.locator('.audit-readiness-actions');
        for (const button of await actions.getByRole('button').all()) {
          const box = await button.boundingBox();
          assert.ok(box.width >= 95 && box.height < 90, 'Audit actions retain readable phone-sized labels');
        }
        await actions.screenshot({ path: `${out}/audit-actions-${language}-${theme}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1536, height: 960 });
  }

  // Source counts must not squeeze the CAPA introduction into one-letter lines.
  for (const language of ['tr', 'en']) {
    await locale(language); await openModule(language === 'tr' ? 'Bulgular ve CAPA' : 'Findings & CAPA');
    await expect(page.locator('.finding-page')).toHaveAttribute('aria-busy', 'false');
    const strip = page.locator('.finding-source-strip');
    await expect(strip.locator(':scope>span')).toHaveCount(4);
    await expect(strip.locator(':scope>span small')).toHaveText(language === 'tr'
      ? ['Sürekli kontrol', 'Üçüncü taraf', 'Yapay zekâ güvencesi', 'Mevzuat']
      : ['Continuous control', 'Third party', 'AI assurance', 'Regulatory']);
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [360, 390, 1024]) {
        await page.setViewportSize({ width, height: 960 });
        const title = await strip.locator(':scope>div').boundingBox();
        assert.ok(title.width >= 180 && title.height < 130, 'CAPA source introduction retains readable width');
        for (const signal of await strip.locator(':scope>span').all()) {
          const box = await signal.boundingBox();
          assert.ok(box.width >= 95 && box.height < 130, 'Source counts retain readable labels');
          if (width < 700) assert.ok(box.y >= title.y + title.height, 'Phone source counts appear below the introduction');
        }
        await strip.screenshot({ path: `${out}/finding-source-${language}-${theme}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1536, height: 960 });
  }

  // Display-only source fixture; no external request or fake database record is created.
  const sourceLayout = async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(), body = await response.json();
    body.sources = [{ id: 'qa-source-layout', name: 'Microsoft Intune device compliance', vendor: 'Microsoft Intune', category: 'Cloud & SaaS', driver: 'provider-v1', enabled: true, hasSecret: false, config: { providerId: 'intune', dataset: 'managed-devices' } }];
    await route.fulfill({ response, json: body });
  };
  await page.route('**/api/evidence-automation', sourceLayout);
  try {
    for (const language of ['tr', 'en']) {
      await locale(language); await openModule(language === 'tr' ? 'Kanıt Otomasyonu' : 'Evidence Automation');
      const wrap = page.locator('.ea-page>.ea-table>.table-wrap'), row = wrap.locator('tbody tr').first();
      await expect(row).toContainText('Microsoft Intune device compliance');
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
        for (const width of [360, 390]) {
          await page.setViewportSize({ width, height: 960 });
          await wrap.evaluate(node => { node.scrollLeft = 0; });
          const first = await row.locator('td').first().boundingBox(), bounds = await row.boundingBox();
          assert.ok(first.width >= 180 && bounds.height < 220, 'Evidence source rows retain readable widths and compact height');
          await wrap.screenshot({ path: `${out}/evidence-source-${language}-${theme}-${width}.png` });
          await wrap.evaluate(node => { node.scrollLeft = node.scrollWidth; });
          await expect(row.getByRole('button', { name: language === 'tr' ? 'Düzenle' : 'Edit', exact: true })).toBeInViewport();
          for (const button of await row.getByRole('button').all()) {
            const box = await button.boundingBox();
            assert.ok(box.width >= 120 && box.height < 80, 'Evidence source actions stay readable after horizontal scrolling');
          }
          await wrap.screenshot({ path: `${out}/evidence-source-actions-${language}-${theme}-${width}.png` });
        }
      }
      await page.setViewportSize({ width: 1536, height: 960 });
    }
  } finally { await page.unroute('**/api/evidence-automation', sourceLayout); }

  await locale('en'); await openModule('Risk Assessment');
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
    await verifyPinnedRegister(page.locator('.table-card .table-wrap'), page.locator('.risk-table tbody tr').first(), `risk-register-pinned-${theme}`);
  }

  // A PATCH may complete before the following GET: the edit must stay locked until the new version is visible.
  const asset = await api('/api/grc', 'POST', { module: 'Varlık Envanteri', data: { title: `${prefix} asset`, assetType: 'Uygulama', businessUnit: 'Bilgi Güvenliği', owner: 'QA', criticality: 'Düşük', status: 'Aktif' } }, 201);
  createdRecords.push(asset.id);
  await page.reload(); await expect(page.locator('.shell')).toBeVisible(); await locale('en'); await openModule('Asset Inventory');
  const row = page.getByRole('row').filter({ hasText: `${prefix} asset` }); await expect(row).toBeVisible();
  await verifyPinnedRegister(page.locator('.table-card .table-wrap'), row, 'register-identity-and-actions');
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
  await expect(dialog.locator('[name=auditName]')).toHaveValue(`${prefix} absent audit`);
  await dialog.locator('[name=auditName]').selectOption(auditName);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toBeHidden(); await expect(orphanRow).toHaveCount(0);
  const current = (await api('/api/grc')).rows.find(item => item.id === orphan.id);
  assert.equal(JSON.parse(current.data_json).auditName, auditName);
  await openModule('Audit Management'); await page.locator('.audit-card-open').filter({ hasText: auditName }).click();
  const requirementRow = page.getByRole('row').filter({ hasText: `${prefix} orphan` });
  await expect(requirementRow).toBeVisible();
  page.once('dialog', d => d.accept());
  const requirementDeleted = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes(orphan.id));
  await requirementRow.getByRole('button', { name: 'Delete', exact: true }).click();
  assert.equal((await requirementDeleted).status(), 200); await expect(requirementRow).toHaveCount(0);
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
  await locale('en'); await openModule('AI Governance');
  const portfolio = page.locator('.ai-portfolio');
  await expect(portfolio.getByRole('heading', { name: 'AI Executive Overview', exact: true })).toBeVisible();
  await expect(portfolio).toContainText('No AI systems yet.');
  const unavailable = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA source unavailable' }) });
  await page.route('**/api/ai/portfolio', unavailable);
  await portfolio.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.ai-portfolio[role=alert]')).toContainText('Assurance assessment is unavailable');
  await expect(portfolio.locator('.stats')).toHaveCount(0);
  await page.screenshot({ path: `${out}/ai-portfolio-unavailable.png` });
  await page.unroute('**/api/ai/portfolio', unavailable);
  await portfolio.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(portfolio.getByRole('heading', { name: 'AI Executive Overview', exact: true })).toBeVisible();
  await expect(portfolio).toContainText('No AI systems yet.');
  assert.deepEqual(pageErrors, []);
  await fs.writeFile(`${out}/summary.json`, JSON.stringify({ navigation, dashboardInitialScope: true, assuranceRefreshCoalescing: true, delayedSave: true, immediateDelete: true, auditCreateRepairDelete: true, languages: ['tr','en'], viewports: [390,1536], pageErrors }, null, 2));
  console.log('FULL_BROWSER_REGRESSION_PASS: delayed dashboard scope, 54 visible menu visits, save-refresh race, immediate deletion, audit create/orphan repair/delete, TR/EN light/dark responsive layouts and localized incident form');
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
