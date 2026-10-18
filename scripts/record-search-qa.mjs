import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
// All mutations are confined to the isolated loopback QA database.
const base = 'http://127.0.0.1:4173', out = 'record-search-qa-artifacts', stamp = Date.now();
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } }), scoped = await browser.newContext();
const page = await context.newPage(), scopedPage = await scoped.newPage(), errors = [], checks = [], created = [];
page.setDefaultTimeout(15000); scopedPage.setDefaultTimeout(15000);
for (const p of [page, scopedPage]) p.on('pageerror', e => errors.push(e.message));
async function api(ctx, path, method = 'GET', data, status = 200) {
  const response = await ctx.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${method} ${path}: ${await response.text()}`);
  return response.json().catch(() => null);
}
async function openSearch(p = page) {
  await p.locator('.command-trigger').click();
  const dialog = p.getByRole('dialog', { name: /Quick navigation|Hızlı navigasyon/ });
  await dialog.getByRole('button', { name: /^(Records|Kayıtlar)$/ }).click();
  return dialog;
}
const input = p => p.getByRole('combobox', { name: /Find a record|Kayıt ara/ });
async function module(name) { await page.locator(`nav button[aria-label="${name}"]`).evaluate(button => button.click()); }
try {
  await mkdir(out, { recursive: true });
  await api(context, '/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() });
  const initial = (await api(context, '/api/grc')).rows;
  const titleKeys = { 'Risk Assessment': 'title', BIA: 'process', 'Varlık Envanteri': 'title', Uyum: 'controlTitle', 'Tedarikçiler': 'title', Kontroller: 'controlTitle', Kanıtlar: 'evidenceTitle', 'Denetim Yönetimi': 'requirementTitle' };
  for (const [moduleName, titleKey] of Object.entries(titleKeys)) {
    const seed = initial.find(row => row.module === moduleName); assert.ok(seed, `Missing seed ${moduleName}`);
    const title = `İŞ SÜREKLİLİĞİ ${stamp} ${moduleName}`, data = { ...JSON.parse(seed.data_json), [titleKey]: title, owner: `QA Search ${stamp}` };
    if (moduleName === 'Kontroller') data.controlRef = `QA-SEARCH-${stamp}`;
    const result = await api(context, '/api/grc', 'POST', { module: moduleName, data }, 201);
    created.push({ ...result, module: moduleName, title, data });
    assert.equal((await api(context, `/api/search?q=${encodeURIComponent(result.code)}`)).results[0].id, result.id);
  }
  const marker = `Pager${stamp}`, bia = created.find(x => x.module === 'BIA');
  await api(context, '/api/grc', 'POST', { module: 'BIA', rows: Array.from({ length: 29 }, (_, i) => ({ ...bia.data, process: `${marker} ${i}` })) }, 201);
  const paged = await api(context, `/api/search?q=${marker}`); assert.equal(paged.results.length, 25);
  const second = await api(context, `/api/search?q=${marker}&cursor=${encodeURIComponent(paged.nextCursor)}`); assert.equal(second.results.length, 4);
  for (const row of [...paged.results, ...second.results]) created.push(row);
  checks.push('Real API: eight modules, public codes, Turkish titles and pagination');
  const anonymous = await browser.newContext(); await api(anonymous, `/api/search?q=${stamp}`, 'GET', undefined, 401); await anonymous.close();
  const email = `qa-search-${stamp}@fornost.test`, access = { mode: 'scoped', modules: { BIA: 'read' } };
  await api(context, '/api/users', 'POST', { name: 'QA Search Reader', email, password: qaPassword(), role: 'Viewer', moduleAccess: access }, 201);
  const user = (await api(context, '/api/users')).users.find(u => u.email === email);
  await api(scoped, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  const scopedResults = await api(scoped, `/api/search?q=${stamp}`); assert.ok(scopedResults.results.length); assert.ok(scopedResults.results.every(row => row.module === 'BIA'));
  await api(scoped, `/api/search?q=${stamp}&module=Kan%C4%B1tlar`, 'GET', undefined, 400);
  await api(scoped, '/api/search', 'POST', {}, 405);
  await scopedPage.goto(base); await expect(scopedPage.locator('.shell')).toBeVisible();
  await scopedPage.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  let dialog = await openSearch(scopedPage); await input(scopedPage).fill(bia.code);
  await expect(dialog.getByRole('option')).toHaveCount(1); await input(scopedPage).press('Enter');
  await expect(scopedPage.locator('.core-record-focus')).toContainText(bia.code);
  await expect(scopedPage.locator('tbody')).toContainText(bia.title);
  await api(context, '/api/users', 'PATCH', { id: user.id, role: 'Viewer', status: 'Active', moduleAccess: { mode: 'scoped', modules: {} } });
  await api(scoped, `/api/search?q=${stamp}`, 'GET', undefined, 401);
  await api(scoped, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  assert.deepEqual((await api(scoped, `/api/search?q=${stamp}`)).results, []);
  checks.push('Viewer/scoped isolation, forbidden module rejection, revoked session and empty grants');
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  for (const record of created.slice(0, 8)) {
    dialog = await openSearch(); await input(page).fill(record.code);
    await expect(dialog.getByRole('option')).toHaveCount(1); await expect(dialog.getByRole('option')).toContainText(record.title);
    await input(page).press('Enter'); await expect(dialog).toHaveCount(0);
    const focus = page.locator(record.module === 'Tedarikçiler' ? '.enterprise-work-focus' : '.core-record-focus');
    await expect(focus).toContainText(record.module === 'Tedarikçiler' ? record.id : record.code);
    await expect(page.locator('main')).toContainText(record.title);
    assert.ok(!(await focus.innerText()).includes('unavailable'), record.module);
  }
  checks.push('Keyboard exact record navigation in all eight modules, including vendor and audit workspaces');
  await module('Risk Assessment');
  const registerQuery = page.getByRole('textbox', { name: 'Search records', exact: true });
  await registerQuery.fill('Preserve this search');
  await page.locator('.register-toolbar').getByRole('button', { name: /Filters/ }).click();
  const filter = page.locator('.register-filters select').first();
  const filterValue = await filter.locator('option').nth(1).getAttribute('value'); await filter.selectOption(filterValue);
  await module('Business Impact Analysis (BIA)'); await page.getByRole('textbox', { name: 'Search records', exact: true }).fill('BIA context');
  await module('Risk Assessment'); await expect(registerQuery).toHaveValue('Preserve this search');
  await page.locator('.register-toolbar').getByRole('button', { name: /Filters/ }).click(); await expect(filter).toHaveValue(filterValue);
  const risk = created.find(x => x.module === 'Risk Assessment');
  dialog = await openSearch(); await input(page).fill(risk.code); await expect(dialog.getByRole('option')).toHaveCount(1); await input(page).press('Enter');
  await expect(page.locator('.core-record-focus')).toContainText(risk.code); await expect(registerQuery).toHaveValue('');
  await page.getByRole('button', { name: 'Return to previous view', exact: true }).click(); await expect(registerQuery).toHaveValue('Preserve this search');
  await page.reload(); await expect(registerQuery).toHaveValue('Preserve this search');
  await page.locator('.register-toolbar').getByRole('button', { name: /Filters/ }).click(); await expect(filter).toHaveValue(filterValue);
  checks.push('Independent module search/filter context survives exact focus, return and reload');
  dialog = await openSearch(); await input(page).fill(marker); await expect(dialog.getByRole('option')).toHaveCount(25);
  await dialog.getByRole('button', { name: 'Load more results' }).click(); await expect(dialog.getByRole('option')).toHaveCount(29);
  await input(page).fill('UnmatchedRecord123456789'); await expect(dialog).toContainText('No matching accessible records');
  await page.route('**/api/search?**', async route => { await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA unavailable"}' }); }, { times: 1 });
  await input(page).fill(risk.code); await expect(dialog.getByRole('alert')).toContainText('Search could not complete');
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.route('**/api/search?**', async route => {
    if (new URL(route.request().url()).searchParams.get('q') === 'slow-search') {
      await new Promise(resolve => setTimeout(resolve, 900));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ id: 'stale', title: 'STALE RESPONSE', module: 'BIA', code: 'STALE', owner: '', status: '' }], nextCursor: null }) }).catch(() => {});
    } else await route.continue();
  });
  const slow = page.waitForRequest(request => request.url().includes('q=slow-search'));
  await input(page).fill('slow-search'); await slow; await input(page).fill(bia.code);
  await expect(dialog.getByRole('option')).toHaveCount(1); await expect(dialog.getByRole('option')).toContainText(bia.title);
  await page.waitForTimeout(1100); await expect(dialog).not.toContainText('STALE RESPONSE'); await page.unroute('**/api/search?**');
  await input(page).press('Escape'); await expect(page.locator('.command-trigger')).toBeFocused();
  checks.push('Pagination, empty state, retry, stale response cancellation, Escape and focus return');
  for (const lang of ['EN', 'TR']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [1536, 390]) {
        await page.setViewportSize({ width, height: 960 }); dialog = await openSearch(); await input(page).fill(stamp.toString());
        await expect(dialog.getByRole('option').first()).toBeVisible();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
        assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 2));
        assert.equal((await new AxeBuilder({ page }).include('.command-palette').analyze()).violations.filter(v => ['serious','critical'].includes(v.impact)).length, 0);
        await page.screenshot({ path: `${out}/search-${lang}-${theme}-${width}.png` }); await input(page).press('Escape');
      }
    }
  }
  checks.push('TR/EN × light/dark × desktop/mobile screenshots and critical/serious accessibility gate');
  // Deleted search results must not open an arbitrary remaining record.
  await api(context, `/api/grc?id=${encodeURIComponent(bia.id)}`, 'DELETE');
  assert.equal((await api(context, `/api/search?q=${encodeURIComponent(bia.code)}`)).results.length, 0);
  checks.push('Deleted records disappear from the next server search');
  assert.deepEqual(errors, []); await writeFile(`${out}/summary.json`, JSON.stringify({ checks, runtimeErrors: errors }, null, 2));
  console.log('RECORD_SEARCH_QA_PASS: ' + checks.join('; '));
} catch (error) { await writeFile(`${out}/failure.json`, JSON.stringify({ message: error.message, stack: error.stack, checks }, null, 2)); await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error; }
finally {
  for (const record of created) await context.request.delete(`${base}/api/grc?id=${encodeURIComponent(record.id)}`, { headers: { origin: base } }).catch(() => {});
  await browser.close();
}
