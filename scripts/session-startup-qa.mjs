import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { qaPassword } from './qa-credentials.mjs';
const base = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [];
try {
 const login = await context.request.post(`${base}/api/auth`, { headers: { origin: base }, data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() } });
 assert.equal(login.status(), 200);
 const snapshot = await (await context.request.get(`${base}/api/auth`)).json();
 for (const mode of ['gateway', 'timeout-retry', 'invalid', 'timeout', 'overlap']) {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  let calls = 0, recover = false, release, superseded = false;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth', async route => {
   if (route.request().method() !== 'GET') return route.continue();
   calls++;
   if (recover) return route.fulfill({ json: snapshot });
   if (mode === 'gateway' && calls === 1) return route.fulfill({ status: 503, json: {} });
   if (mode === 'timeout-retry' && calls === 1) { await pending; return route.fulfill({ json: snapshot }).catch(() => {}); }
   if (mode === 'invalid') return route.fulfill({ json: { authenticated: true } });
   if (mode === 'timeout') { await pending; return route.fulfill({ json: snapshot }).catch(() => {}); }
   if (mode === 'overlap') {
    if (!superseded) { await pending; return route.fulfill({ json: snapshot }).catch(() => {}); }
    return route.fulfill({ json: { authenticated: false, bootstrapRequired: false } });
   }
   return route.fulfill({ json: snapshot });
  });
  await page.goto(base);
  if (mode === 'gateway' || mode === 'timeout-retry') {
   await expect(page.locator('.shell')).toBeVisible({ timeout: 14000 }); assert.ok(calls >= 2); // Copilot also reads identity after the shell mounts.
   await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
   await expect(page.locator('h1').first()).toHaveText('Dashboard');
  } else if (mode === 'overlap') {
   await expect.poll(() => calls).toBeGreaterThanOrEqual(1);
   superseded = true;
   await page.evaluate(() => window.dispatchEvent(new Event('focus')));
   await expect(page.getByRole('heading', { name: 'Yerel Hesapla Giriş' })).toBeVisible();
   release(); await page.waitForTimeout(300);
   await expect(page.locator('.shell')).toHaveCount(0);
  } else {
   await expect(page.getByRole('heading', { name: 'Oturum hazırlanamadı' })).toBeVisible({ timeout: 16000 });
   if (mode === 'timeout') await expect(page.locator('.auth-error')).toContainText('zaman aşımına');
   recover = true; release();
   await page.getByRole('button', { name: 'Tekrar Dene', exact: true }).click();
   await expect(page.locator('.shell')).toBeVisible();
  }
  release(); await page.close();
 }
 assert.deepEqual(errors, []);
 console.log('SESSION_STARTUP_PASS: mobile EN startup after gateway retry; invalid JSON recovery; bounded stalled check; superseded authenticated response cannot resurrect an ended session.');
} finally { await browser.close(); }
