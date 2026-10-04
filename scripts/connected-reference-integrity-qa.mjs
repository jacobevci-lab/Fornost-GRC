import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { qaPassword } from './qa-credentials.mjs';

const base = 'http://127.0.0.1:4173', out = 'connected-reference-qa-artifacts';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
async function sql(statement) {
  const file = `${out}/fixture.sql`;
  await fs.writeFile(file, statement);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'wrangler.d1.jsonc', '--file', file], { stdio: 'pipe', timeout: 60000 });
}
const ids = ['qa-reference-asset-a', 'qa-reference-asset-b', 'qa-reference-risk'];
const title = 'QA shared service reference';
let seeded = false;
async function openMap() {
  await page.goto(base);
  await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el => el.click());
  await expect(page.locator('.cg-source-state')).toHaveAttribute('data-loading', 'false');
}
try {
  const login = await context.request.post(`${base}/api/auth`, { headers: { origin: base }, data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() } });
  assert.equal(login.status(), 200);
  assert.equal((await context.request.get(`${base}/api/grc`)).status(), 200);
  const stamp = new Date().toISOString();
  const rows = [
    { id: ids[0], module: 'Varlık Envanteri', data: { title } },
    { id: ids[1], module: 'Varlık Envanteri', data: { title } },
    { id: ids[2], module: 'Risk Assessment', data: { title: 'QA reference risk', asset: title } },
  ];
  seeded = true;
  await sql(rows.map(row => `INSERT INTO simple_grc_records VALUES(${quote(row.id)},${quote(row.module)},${quote(JSON.stringify(row.data))},${quote(stamp)},${quote(stamp)});`).join('\n'));
  await openMap();
  await page.locator('.connected-grc').getByRole('button', { name: /^Gaps/ }).click();
  await page.locator('.connected-unresolved summary').click();
  const unresolved = page.locator('.connected-unresolved>div').filter({ has: page.locator('code', { hasText: title }) });
  await expect(unresolved).toHaveCount(1);
  await expect(unresolved).toContainText('2 possible records');
  await expect(unresolved.locator('.connected-reference-candidates')).toContainText(title);
  for (const lang of ['EN', 'TR']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    await expect(unresolved).toContainText(lang === 'TR' ? '2 olası kayıt' : '2 possible records');
    for (const theme of ['light', 'dark']) for (const width of [1536, 390]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.setViewportSize({ width, height: 960 });
      await unresolved.scrollIntoViewIfNeeded();
      assert.ok(await unresolved.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: `${out}/${lang}-${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  await sql(`UPDATE simple_grc_records SET data_json=${quote(JSON.stringify({ title: 'QA reference risk', asset: ids[0] }))} WHERE id=${quote(ids[2])};`);
  await openMap();
  await page.locator('.cg-filters input').fill('QA reference risk');
  await expect(page.locator('.cg-records>button')).toHaveCount(1);
  await expect(page.locator('.cg-connections article')).toHaveCount(1);
  await expect(page.locator('.cg-connections article')).toContainText(title);
  await page.locator('.cg-follow').click();
  await expect(page.locator('.cg-detail')).toContainText(title);
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ status: 'passed', ambiguousTargets: 2, correctedLinks: 1, layouts: 8 }));
} finally {
  try {
    if (seeded) await sql(`DELETE FROM simple_grc_record_codes WHERE record_id IN (${ids.map(quote).join(',')}); DELETE FROM simple_grc_records WHERE id IN (${ids.map(quote).join(',')});`);
  } finally { await browser.close(); }
}
