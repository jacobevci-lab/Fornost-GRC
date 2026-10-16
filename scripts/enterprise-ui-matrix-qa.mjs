import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { qaPassword } from './qa-credentials.mjs';

// Read-only visual review in the isolated application; never visits a remote URL.
const base = 'http://127.0.0.1:4173', out = 'enterprise-ui-matrix-artifacts';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const results = [], errors = [], pending = new Set();
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() === 'GET' && request.url().startsWith(`${base}/api/`)) pending.add(request); });
page.on('requestfinished', request => pending.delete(request));
page.on('requestfailed', request => pending.delete(request));
async function settle() {
  await expect.poll(() => pending.size, { timeout: 15000 }).toBe(0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
}
async function open(label) {
  const mobile = page.locator('.mobile-nav-toggle');
  if (await mobile.isVisible() && await mobile.getAttribute('aria-expanded') !== 'true') await mobile.click();
  const item = page.locator('#fornost-navigation .nav-group-items').getByRole('button', { name: label, exact: true, includeHidden: true });
  const group = page.locator('#fornost-navigation .nav-group').filter({ has: page.getByRole('button', { name: label, exact: true, includeHidden: true }) });
  const trigger = group.locator('.nav-group-trigger');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await item.click();
  if (label === 'Ask Fornost') await expect(page.locator('#fornost-ai-panel')).toBeVisible();
  else await expect(page.locator('main>header h1')).toHaveText(label);
  await settle();
}
try {
  const login = await context.request.post(`${base}/api/auth`, { headers: { origin: base }, data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() } });
  assert.equal(login.status(), 200);
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  assert.ok(await page.locator('#fornost-navigation .nav-group').count() <= 8, 'Product navigation complexity budget');
  for (const language of ['tr', 'en']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: language.toUpperCase(), exact: true }).click();
    const labels = await page.locator('#fornost-navigation .nav-group-items button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    assert.equal(labels.length, 27);
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [1536, 1024, 390]) {
        await page.setViewportSize({ width, height: 960 });
        for (const [index, label] of labels.entries()) {
          const id = `${language}-${theme}-${width}-${String(index + 1).padStart(2, '0')}`;
          const result = { id, language, theme, width, label, passed: false };
          try {
            await open(label);
            result.dom = await page.locator('main').evaluate(main => {
              const visible = node => !!(node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
              const name = node => (node.getAttribute('aria-label') || node.innerText || node.getAttribute('title') || node.querySelector('img')?.alt || '').trim();
              const links = [...main.querySelectorAll('a')].filter(visible).map(node => ({ name: name(node), href: node.getAttribute('href') }));
              const buttons = [...main.querySelectorAll('button')].filter(visible);
              const tables = [...main.querySelectorAll('table')].filter(visible).map(node => ({ columns: node.querySelectorAll('thead th').length, rows: node.querySelectorAll('tbody tr').length, width: Math.round(node.getBoundingClientRect().width) }));
              return {
                pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
                mainOverflow: main.scrollWidth - main.clientWidth,
                headings: [...main.querySelectorAll('h1,h2,h3')].filter(visible).map(node => node.innerText),
                unnamedButtons: buttons.filter(node => !name(node)).map(node => node.outerHTML.slice(0, 180)),
                invalidLinks: links.filter(link => !link.name || !link.href || /^javascript:/i.test(link.href)),
                links, tables,
                defaultFields: [...main.querySelectorAll('input,select,textarea')].filter(visible).length,
                primaryActions: buttons.filter(node => node.classList.contains('primary')).length,
              };
            });
            await page.screenshot({ path: `${out}/${id}.png`, fullPage: true });
            assert.ok(result.dom.pageOverflow <= 2, `${label}: page overflow ${result.dom.pageOverflow}px`);
            assert.deepEqual(result.dom.invalidLinks, [], `${label}: invalid or unnamed links`);
            assert.deepEqual(result.dom.unnamedButtons, [], `${label}: unnamed controls`);
            result.passed = true;
          } catch (error) {
            result.error = error.message;
            await page.screenshot({ path: `${out}/${id}-failure.png`, fullPage: true }).catch(() => {});
          } finally {
            const close = page.locator('#fornost-ai-panel .fornost-ai-head button[data-escape-close]');
            if (await close.isVisible().catch(() => false)) await close.click();
          }
          results.push(result);
        }
      }
      console.log(`ENTERPRISE_UI_MATRIX_PROGRESS: ${language}/${theme}, ${results.length} views, ${results.filter(item => !item.passed).length} findings`);
    }
  }
} finally {
  await fs.writeFile(`${out}/summary.json`, JSON.stringify({ expectedViews: 324, views: results, pageErrors: errors }, null, 2));
  await browser.close();
}
assert.equal(results.length, 324, 'Every module in both languages/themes at three viewports');
for (const result of results.filter(item => !item.passed)) console.error('ENTERPRISE_UI_FINDING', result.id, result.label, result.error);
assert.equal(results.filter(item => !item.passed).length, 0, 'Visual and navigation findings must be fixed');
assert.deepEqual(errors, []);
console.log('ENTERPRISE_UI_MATRIX_PASS: 324 real visible menu visits with screenshots, layout, link/control names and all module inventories');
