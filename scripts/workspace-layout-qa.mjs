import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Runs against an isolated local app, never production accounts or records.
const base = 'http://127.0.0.1:4173';
const output = 'layout-qa-artifacts';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const results = [];
try {
  const response = await context.request.post(`${base}/api/auth`, {
    headers: { origin: base },
    data: { action: 'login', email: 'qa-admin@fornost.test', password: 'Fornost-QA!2026-Branch' },
  });
  assert.equal(response.status(), 200, 'Isolated QA login');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.shell').waitFor();
  async function open(label) {
    await page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).evaluate(el => el.click());
    await page.waitForTimeout(550);
  }
  for (const locale of ['tr', 'en']) {
    await page.locator('.language-switch:visible').getByRole('button', {name: locale.toUpperCase(), exact:true}).click();
    await page.waitForTimeout(200);
    const labels = await page.locator('nav button[aria-label]').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')));
    for (const label of labels) {
      await open(label);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 4, `${locale}:${label} page overflow ${overflow}px`);
      results.push({ locale, label, overflow });
    }
    // Close any copilot left open by the navigation sweep by reloading the shell.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.shell').waitFor();
    await open(locale === 'tr' ? 'Denetim Yönetimi' : 'Audit Management');
    await page.locator('.audit-readiness-gate').waitFor();
    await page.waitForTimeout(800);
    const stable = await page.evaluate(async () => {
      const node = document.querySelector('.audit-readiness-gate');
      const samples = [];
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const current = document.querySelector('.audit-readiness-gate');
        const box = current?.getBoundingClientRect();
        samples.push({ same: node === current, y: box?.y, height: box?.height });
      }
      return samples;
    });
    assert.ok(stable.every(sample => sample.same), 'Audit panel must not remount while idle');
    assert.equal(new Set(stable.map(sample => `${sample.y}:${sample.height}`)).size, 1, 'Audit panel must not shift while idle');
    await page.screenshot({path:`${output}/${locale}-audit-desktop.png`});
    await open(locale === 'tr' ? 'Kanıt Otomasyonu' : 'Evidence Automation');
    const tabs = page.locator('.ea-tabs');
    assert.ok((await tabs.boundingBox()).y < 560, 'Evidence navigation remains in the first viewport');
    assert.equal(await page.locator('.ea-page>.ca-dashboard,.ea-page>.eh-panel').count(), 0);
    await page.screenshot({path:`${output}/${locale}-evidence-desktop.png`});
    await page.locator('.theme-toggle:visible').click();
    await page.screenshot({path:`${output}/${locale}-evidence-alternate-theme.png`});
    for (const name of locale === 'tr' ? ['Güvence','Kanıt Geçmişi'] : ['Assurance','Evidence History']) {
      await tabs.getByRole('button', {name,exact:true}).click();
      await page.waitForTimeout(600);
      const themed = await page.locator('.ea-page>.ca-dashboard,.ea-page>.eh-panel').evaluate(el => {
        const style = getComputedStyle(el);
        return {background:style.backgroundColor,border:style.borderTopColor};
      });
      assert.notEqual(themed.background,'rgba(0, 0, 0, 0)','Operational panel has a theme surface');
      await page.screenshot({path:`${output}/${locale}-${name === 'Güvence' || name === 'Assurance' ? 'assurance' : 'history'}-desktop.png`});
    }
    for (const width of [768,390]) {
      await page.setViewportSize({width,height:900});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 4, `Evidence history fits ${width}px`);
      await page.screenshot({path:`${output}/${locale}-history-${width}.png`});
    }
    await page.setViewportSize({width:1536,height:960});
  }
  assert.deepEqual(errors, [], 'No unhandled UI errors');
  await fs.writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));
} finally {
  await browser.close();
}
