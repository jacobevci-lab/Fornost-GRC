import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { qaPassword } from './qa-credentials.mjs';
const base = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const errors = [];
try {
 for (const mode of ['gateway', 'duplicate', 'lost-response', 'timeout']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  let writes = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth', async route => {
   if (route.request().method() !== 'POST') return route.continue();
   writes++;
   if (mode === 'gateway') return route.fulfill({ status: 503, body: '<html>Gateway unavailable</html>' });
   if (mode === 'lost-response') {
    const response = await route.fetch(); assert.equal(response.status(), 200);
    return route.fulfill({ response, body: '{' });
   }
   await pending;
   await route.fulfill({ status: 401, json: { error: 'QA rejected credentials' } }).catch(() => {});
  });
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Yerel Hesapla Giriş' })).toBeVisible();
  await page.locator('input[name=email]').fill('qa-admin@fornost.test');
  await page.locator('input[name=password]').fill(qaPassword());
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  if (mode === 'duplicate') {
   await expect(page.locator('form.auth-card')).toHaveAttribute('aria-busy', 'true');
   await page.locator('form.auth-card').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event('focus'));
   });
   await page.waitForTimeout(200); assert.equal(writes, 1);
   release();
  }
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 18000 });
  assert.equal(writes, 1, 'Authentication writes must never retry automatically');
  await expect(page.getByRole('button', { name: 'Giriş Yap', exact: true })).toBeEnabled();
  if (mode === 'timeout') await expect(page.getByRole('alert')).toContainText('zaman aşımına');
  release(); await page.unroute('**/api/auth');
  if (mode === 'lost-response') {
   await page.getByRole('button', { name: 'Oturum Durumunu Kontrol Et', exact: true }).click();
  } else {
   await expect(page.locator('input[name=email]')).toHaveValue('qa-admin@fornost.test');
   await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  }
  await expect(page.locator('.shell')).toBeVisible();
  await context.close();
 }
 assert.deepEqual(errors, []);
 console.log('LOCAL_LOGIN_RECOVERY_PASS: gateway recovery, duplicate-submit guard, focus during login, ambiguous committed response recovery, write timeout, preserved form values and successful real login.');
} finally { await browser.close(); }
