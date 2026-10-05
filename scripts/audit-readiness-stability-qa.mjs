import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
// Transport fixtures only; no writes outside the isolated loopback application.
const base = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext();
const errors = [];
try {
  const login = await context.request.post(`${base}/api/auth`, { headers: { origin: base }, data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() } });
  assert.equal(login.status(), 200);
  const gap = { reference: 'QA-1', title: 'Delayed evidence', owner: 'QA', dueDate: '', status: 'missing', linkedEvidence: 0, currentEvidence: 0, staleEvidence: 0 };
  const snapshot = { generatedAt: new Date().toISOString(), gate: 'not-ready', verified: true, issues: [], unmonitored: ['QA-1'], signals: [], blockerCount: 0, evidence: { total: 1, current: 0, stale: 0, missing: [gap], gaps: [gap], requirements: [gap], coverage: 0, readiness: 0 } };
  for (const lang of ['tr', 'en']) for (const theme of ['light', 'dark']) for (const width of [1536, 390]) {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 960 });
    let release, mode = 'initial';
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/audits/readiness?*', async route => {
      if (mode === 'initial') await pending;
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'QA transport failure' } });
      const body = mode === 'incomplete' ? { ...snapshot, verified: false, gate: 'unverified', issues: ['records-incomplete', 'rules-unavailable', 'findings-incomplete', 'work-unavailable', 'integrity-incomplete'] } : snapshot;
      await route.fulfill({ json: body });
    });
    await page.goto(base);
    await expect(page.locator('.shell')).toBeVisible();
    await page.locator('.language-switch:visible').getByRole('button', { name: lang.toUpperCase(), exact: true }).click();
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.locator(`nav button[aria-label="${lang === 'tr' ? 'Denetim Yönetimi' : 'Audit Management'}"]`).evaluate(el => el.click());
    const gate = page.locator('.audit-readiness-gate');
    await expect(gate).toHaveAttribute('aria-busy', 'true');
    await expect(gate.locator('.audit-readiness-metrics strong').first()).toHaveText('—');
    const height = () => gate.evaluate(el => el.getBoundingClientRect().height);
    const baseline = await height();
    mode = 'loaded'; release();
    await expect(gate).toHaveAttribute('aria-busy', 'false');
    assert.ok(Math.abs(await height() - baseline) <= 1, `${lang}/${theme}/${width}: delayed data changed height`);
    for (mode of ['error', 'incomplete', 'loaded']) {
      await gate.locator('button.refresh').click();
      await expect(gate).toHaveAttribute('aria-busy', 'false');
      assert.ok(Math.abs(await height() - baseline) <= 1, `${lang}/${theme}/${width}/${mode}: height changed`);
      await expect(gate.getByRole('button', { name: 'CSV', exact: true }))[mode === 'loaded' ? 'toBeEnabled' : 'toBeDisabled']();
      if (mode !== 'loaded') await expect(gate.getByRole('alert')).toBeVisible();
    }
    assert.ok(await gate.evaluate(el => el.scrollWidth - el.clientWidth) <= 1);
    await gate.locator('.audit-readiness-gaps>summary').focus();
    await page.keyboard.press('Enter');
    await expect(gate.locator('.audit-readiness-gap').first()).toBeVisible();
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('READINESS_STABILITY_PASS: TR/EN, light/dark, desktop/mobile; delayed initial response, error, incomplete data, recovery, export gate and keyboard expansion.');
} finally { await browser.close(); }
