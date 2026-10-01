import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Runs against an isolated local app, never production accounts or records.
const base = 'http://127.0.0.1:4173';
const output = 'layout-qa-artifacts';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
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
    for (const theme of ['dark','light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const label of labels) {
        await open(label);
        // A module can restore its saved appearance; verify the actual theme before capture.
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
        await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
        for (const width of [1536,768,390]) {
          await page.setViewportSize({width,height:960});
          await page.waitForTimeout(100);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          results.push({ locale, theme, label, width, overflow });
          await page.screenshot({path:`${output}/${locale}-${theme}-${width}-module-${results.length}.jpg`,type:"jpeg",quality:70});
        }
        await page.setViewportSize({width:1536,height:960});
        const copilotClose=page.locator('.fornost-ai-panel button[aria-label="Kapat"]');
        if (await copilotClose.isVisible()) await copilotClose.click();
      }
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.shell').waitFor();
    }
    // Close any copilot left open by the navigation sweep by reloading the shell.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.shell').waitFor();
    await open(locale === 'tr' ? 'Kanıt Kütüphanesi' : 'Evidence Library');
    await page.locator('.evidence-link').first().waitFor();
    if (await page.locator('html').getAttribute('data-theme') !== 'dark') {
      await page.locator('.theme-toggle:visible').click();
    }
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.evidence-link>span>b').first().evaluate(el => getComputedStyle(el).color), 'rgb(237, 244, 243)', 'Evidence titles stay white in dark mode');
    assert.equal(await page.locator('.table-wrap .code').first().evaluate(el => getComputedStyle(el).color), 'rgb(232, 120, 47)', 'Record codes stay orange in dark mode');
    await page.screenshot({path:`${output}/${locale}-evidence-library-dark.png`});
    await page.locator('.theme-toggle:visible').click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.table-wrap').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(244, 241, 235)', 'Light surfaces match the supplied warm neutral reference');
    await page.screenshot({path:`${output}/${locale}-evidence-library-light.png`});
    await open(locale === 'tr' ? 'Bağlantılı GRC Haritası' : 'Connected GRC Map');
    await page.locator('.cg-records>button').first().waitFor();
    assert.equal(await page.locator('.cg-heading h2').evaluate(el=>getComputedStyle(el).fontSize),'18px','Compact desktop page heading');
    assert.equal(await page.locator('.cg-records>button b').first().evaluate(el=>getComputedStyle(el).fontSize),'10px','Compact desktop record text');
    assert.equal(await page.locator('.cg-filters input').evaluate(el=>getComputedStyle(el).fontSize),'11px','Compact desktop form text');
    assert.equal(await page.locator('.cg-operations').count(), 0, 'Assurance operations do not crowd the initial map');
    assert.equal(await page.locator('.cg-gaps').count(), 0, 'Missing connections have their own view');
    assert.ok((await page.locator('.cg-workspace').boundingBox()).y < 600, 'Record explorer is above the fold');
    await page.locator('.cg-filters select').selectOption('Kanıtlar');
    const recordButtons = page.locator('.cg-records>button');
    assert.ok(await recordButtons.count() > 1, 'Seed evidence provides multiple selectable records');
    await recordButtons.nth(1).click();
    assert.equal(await page.locator('.cg-detail h3').innerText(), await recordButtons.nth(1).locator('b').innerText(), 'Selection controls the relationship detail');
    assert.ok(await page.locator('.cg-connections article').count() > 0, 'Selected evidence shows actual control connections');
    const relatedTitle = await page.locator('.cg-follow').first().innerText();
    await page.locator('.cg-follow').first().click();
    assert.equal(await page.locator('.cg-detail h3').innerText(), relatedTitle, 'Follow a connection within the map');
    await page.locator('.cg-filters input').fill('no-such-record-qa');
    assert.equal(await recordButtons.count(), 0, 'Search has a useful empty state');
    await page.locator('.cg-filters').getByRole('button', {name:locale==='tr'?'Temizle':'Clear',exact:true}).click();
    assert.equal(await recordButtons.count(), 10, 'Record list is paginated');
    await page.locator('.cg-records footer').getByRole('button', {name:locale==='tr'?'Sonraki':'Next',exact:true}).click();
    assert.match(await page.locator('.cg-records footer span').innerText(), /^2 \/ /);
    const tabBoxes = await page.locator('.cg-tabs button').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().y));
    assert.equal(new Set(tabBoxes).size,1,'Map views share one compact tab row on desktop');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${output}/${locale}-connected-explorer.png`});
    await page.locator('.cg-tabs button').nth(1).click();
    await page.locator('.cg-gaps').waitFor();
    assert.equal(await page.locator('.cg-tabs button[aria-pressed="true"]').count(),1,'Exactly one view is selected');
    assert.equal(await page.locator('.cg-workspace').count(), 0, 'Only the selected map view is mounted');
    await page.screenshot({path:`${output}/${locale}-connected-gaps.png`});
    await page.locator('.cg-tabs button').nth(2).click();
    await page.locator('.cg-operations').waitFor();
    await page.locator('.cg-tabs button').first().click();
    await page.locator('.theme-toggle:visible').click();
    await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/${locale}-connected-alternate-theme.png`});
    await page.setViewportSize({width:390,height:900});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth) <= 4, 'Connected explorer fits mobile');
    assert.equal(await page.locator('.cg-records>button b').first().evaluate(el=>getComputedStyle(el).fontSize),'12px','Mobile record text remains readable');
    await page.screenshot({path:`${output}/${locale}-connected-mobile.png`});
    await page.setViewportSize({width:1536,height:960});
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
    await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/${locale}-evidence-alternate-theme.png`});
    for (const name of locale === 'tr' ? ['Güvence','Kanıt Geçmişi'] : ['Assurance','Evidence History']) {
      await tabs.getByRole('button', {name,exact:true}).click();
      await page.waitForTimeout(600);
      const themed = await page.locator('.ea-page>.ca-dashboard,.ea-page>.eh-panel').evaluate(el => {
        const style = getComputedStyle(el);
        return {background:style.backgroundColor,image:style.backgroundImage,border:style.borderTopColor};
      });
      assert.ok(themed.background !== 'rgba(0, 0, 0, 0)' || themed.image !== 'none','Operational panel has a theme surface');
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
  assert.deepEqual(results.filter(r=>r.overflow>4), [], 'Every module fits desktop, tablet and mobile in both themes and languages');
  await fs.writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));
} catch (error) {
  const pages = context.pages();
  if (pages.length) await pages[pages.length-1].screenshot({path:`${output}/failure.png`}).catch(()=>{});
  await fs.writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,results},null,2));
  throw error;
} finally {
  await browser.close();
}
