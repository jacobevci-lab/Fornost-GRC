import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Isolated product regression: never changes production records or settings.
const base = 'http://127.0.0.1:4173', out = 'visual-workspace-qa-artifacts';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1365, height: 935 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
async function open(label) {
  const moduleButton = page.locator(`nav button[aria-label=${JSON.stringify(label)}]`);
  // Expand the actual navigation group before clicking a visible module.
  if (!await moduleButton.isVisible()) {
    await moduleButton.locator('xpath=ancestor::div[contains(@class,"nav-group")]/preceding-sibling::button').click();
  }
  await moduleButton.click();
}
const metricSize = locator => expect.poll(async () => locator.first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(22);
try {
  const auth = await context.request.post(base + '/api/auth', { headers: { origin: base }, data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() } });
  assert.equal(auth.status(), 200);
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  for (const locale of ['tr', 'en']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
    const tr = locale === 'tr';
    await open(tr ? 'Gösterge Paneli' : 'Dashboard');
    await expect(page.locator('.executive-dashboard-reference')).toBeVisible();
    await expect(page.locator('.evidence-assurance-status')).not.toHaveAttribute('data-state', 'loading');
    assert.ok(await page.locator('.evidence-assurance-copy strong').innerText());
    assert.equal(await page.locator('.executive-dashboard-reference').getByText(tr ? 'Geciken denetim' : 'Overdue audits', { exact: true }).count(), 0);
    await expect(page.locator('.audit-remediation-panel')).toContainText(tr ? 'Geciken denetim maddesi' : 'Overdue audit requirements');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [1365, 768, 390]) {
        await page.setViewportSize({ width, height: 935 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4, 'Dashboard fits viewport');
        const grid = page.locator('.executive-dashboard-grid');
        if (width === 1365) assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateAreas), '"compliance risk" "assurance audit"');
        await page.screenshot({ path: `${out}/${locale}-${theme}-${width}-dashboard.png` });
        checks.push(`${locale}/${theme}/${width}: dashboard`);
      }
    }
    await page.setViewportSize({ width: 1365, height: 935 });
    await open(tr ? 'Benim İşlerim' : 'My Work');
    await expect(page.locator('.mw2-search')).toBeVisible();
    await metricSize(page.locator('.mw2-metrics strong'));
    await page.getByRole('button', { name: tr ? 'Organizasyon' : 'Organization', exact: true }).click();
    await expect(page.locator('.mw2-queue>header small')).toHaveText(tr ? 'KURUMSAL İŞ KUYRUĞU' : 'ORGANIZATION WORK QUEUE');
    for (const width of [1365, 768, 390]) {
      await page.setViewportSize({ width, height: 935 });
      const search = await page.locator('.mw2-search').boundingBox();
      assert.ok(search.height >= 36 && search.height <= 44, 'Search retains a single-line height');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4, 'Work queue fits viewport');
      await page.screenshot({ path: `${out}/${locale}-${width}-my-work.png` });
    }
    await page.setViewportSize({ width: 1365, height: 935 });
    await open(tr ? 'Varlık Envanteri' : 'Asset Inventory');
    await metricSize(page.locator('.module-overview>div>article>strong'));
    checks.push(`${locale}: metrics, work scope and responsive filters`);
  }
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  let vendorMode = 'failure';
  await page.route('**/api/third-party-risk', route => vendorMode === 'failure'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic source failure"}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vendors: [], profiles: [], assessments: [], findings: [], summary: { total: 0, unmanaged: 0, critical: 0, reviewDue: 0, openFindings: 0, overdueFindings: 0, highRisk: 0, contractsDue: 0 } }) }));
  await open('Vendor Management');
  await expect(page.locator('.tprm-load-state[role="alert"]')).toBeVisible();
  assert.equal(await page.locator('.tprm-metrics').count(), 0, 'Failed source never renders reassuring zero counts');
  vendorMode = 'empty';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.tprm-empty').first()).toContainText('No third parties assessed yet');
  await metricSize(page.locator('.tprm-metrics b'));
  await page.getByRole('button', { name: 'Open third-party inventory', exact: true }).click();
  await expect(page.locator('.tprm-table')).toContainText('No third party.');
  checks.push('Vendor load failure, retry, honest empty state and inventory navigation');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/summary.json`, JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  await fs.writeFile(`${out}/failure.json`, JSON.stringify({ message: error.message, checks, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
