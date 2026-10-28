import { qaPassword } from "./qa-credentials.mjs";
import { chromium, expect } from '@playwright/test';
import {createQaContext,waitForQaIdle} from './qa-browser-harness.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Runs against an isolated local app, never production accounts or records.
const base = 'http://127.0.0.1:4173';
const output = 'layout-qa-artifacts';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await createQaContext(browser,base,{}, { viewport: { width: 1536, height: 960 } });
const fixtureTag=`QA layout connection ${Date.now()}`,fixtureEvidence=[],fixtureTitles=[`${fixtureTag} first`,`${fixtureTag} second`];
let fixtureControl;
async function api(path,method='GET',data,status=200){
  const response=await context.request.fetch(base+path,{method,data,headers:{origin:base}});
  assert.equal(response.status(),status,`${path}: ${await response.text()}`);return response.json();
}
const results = [];
const reads = new Map();
let phase = 'login', lastFailure = '';
const watchdog = setTimeout(() => {
  void fs.writeFile(`${output}/failure.json`, JSON.stringify({ message: 'Layout QA exceeded its 8-minute bound', phase, lastFailure, results }, null, 2))
    .finally(() => { console.error(`LAYOUT_QA_TIMEOUT: ${phase}${lastFailure ? `; ${lastFailure}` : ''}`); process.exit(1); });
}, 8 * 60_000);
watchdog.unref();
async function progress(value) {
  phase = value;
  await fs.writeFile(`${output}/progress.json`, JSON.stringify({ phase, views: results.length, at: new Date().toISOString() }, null, 2));
  console.log(`LAYOUT_QA_PROGRESS: ${phase}; ${results.length} views`);
}
try {
  const response = await context.request.post(`${base}/api/auth`, {
    headers: { origin: base },
    data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() },
  });
  assert.equal(response.status(), 200, 'Isolated QA login');
  // Own the link fixture: list position is not a relationship contract. Other QA
  // journeys deliberately retain unlinked decision evidence in this database.
  const seed=(await api('/api/grc')).rows.find(row=>row.module==='Kontroller');assert.ok(seed,'Control fixture schema');
  fixtureControl=await api('/api/grc','POST',{module:'Kontroller',data:{...JSON.parse(seed.data_json),controlTitle:fixtureTag,controlRef:`QA-LAYOUT-${Date.now()}`}},201);
  for(const evidenceTitle of fixtureTitles){
    const upload=await context.request.post(base+'/api/evidence',{headers:{origin:base},multipart:{evidenceTitle,owner:'qa-admin@fornost.test',period:'2026-Q4',controlRef:fixtureControl.id,status:'İncelemede',file:{name:'layout-proof.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic owned layout relationship fixture')}}});
    assert.equal(upload.status(),201,await upload.text());fixtureEvidence.push((await upload.json()).id);
  }

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let documentGeneration=0;
  page.on('framenavigated', frame => {if(frame===page.mainFrame())documentGeneration++;});
  page.on('request', request => {const url=new URL(request.url());if(request.method()==='GET'&&url.origin===base&&url.pathname.startsWith('/api/'))reads.set(request,{path:url.pathname,documentGeneration,startedAt:new Date().toISOString(),state:'pending'});});
  page.on('response', response => {const read=reads.get(response.request());if(read)read.status=response.status();});
  page.on('requestfinished', request => {const read=reads.get(request);if(read)read.state='finished';});
  page.on('requestfailed', request => {const read=reads.get(request);if(read){read.state='failed';read.failure=request.failure()?.errorText;}});
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.shell').waitFor();
  await waitForQaIdle(page);
  // A visible shell can precede its debounced data reads. Drain the current
  // document before replacing it, then await the new document's actual reads.
  // In particular the end-of-theme reload must settle before the next reload.
  async function reloadReady(){
    await waitForQaIdle(page);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.shell').waitFor();
    await waitForQaIdle(page);
  }
  async function open(label) {
    await page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).evaluate(el => el.click());
    await waitForQaIdle(page);
  }
  for (const locale of ['tr', 'en']) {
    await page.locator('.language-switch:visible').getByRole('button', {name: locale.toUpperCase(), exact:true}).click();
    await waitForQaIdle(page);
    const labels = await page.locator('nav button[aria-label]').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')));
    for (const theme of ['dark','light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const label of labels) {
        await progress(`${locale}/${theme}: open ${label}`);
        await open(label);
        // A module can restore its saved appearance; verify the actual theme before capture.
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
        await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
        for (const width of [1536,768,390]) {
          phase = `${locale}/${theme}/${width}: ${label}`;
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
      await progress(`${locale}/${theme}: reload`);
      await reloadReady();
    }
    // Close any copilot left open by the navigation sweep by reloading the shell.
    await progress(`${locale}: evidence library`);
    await reloadReady();
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
    await progress(`${locale}: connected explorer`);
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
    await page.locator('.cg-filters input').fill(fixtureTag);
    await expect(recordButtons).toHaveCount(2);
    for(const title of fixtureTitles){
      await recordButtons.filter({hasText:title}).click();
      await expect(page.locator('.cg-detail h3')).toHaveText(title);
      await expect(recordButtons.filter({hasText:title})).toHaveAttribute('aria-pressed','true');
      await expect(page.locator('.cg-connections article')).toHaveCount(1);
      await expect(page.locator('.cg-follow')).toHaveText(fixtureTag);
    }
    await page.locator('.cg-follow').click();
    await expect(page.locator('.cg-detail h3')).toHaveText(fixtureTag);
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
    await progress(`${locale}: audit stability`);
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
    await progress(`${locale}: evidence automation`);
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
  await fs.writeFile(`${output}/reads.json`,JSON.stringify([...reads.values()],null,2));
} catch (error) {
  lastFailure = error.message;
  console.error(`LAYOUT_QA_FAILURE: ${phase}; ${lastFailure}`);
  const pages = context.pages();
  if (pages.length) await pages[pages.length-1].screenshot({path:`${output}/failure.png`,timeout:5000}).catch(()=>{});
  await fs.writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,phase,results},null,2));
  await fs.writeFile(`${output}/reads.json`,JSON.stringify([...reads.values()],null,2));
  throw error;
} finally {
  phase = `browser cleanup after ${phase}`;
  try {
    for(const id of fixtureEvidence)await api(`/api/grc?id=${id}`,'DELETE');
    if(fixtureControl)await api(`/api/grc?id=${fixtureControl.id}`,'DELETE');
    await fs.writeFile(`${output}/cleanup.json`,JSON.stringify({ownedEvidenceRemoved:fixtureEvidence.length,ownedControlRemoved:!!fixtureControl}));
  } finally {await browser.close();clearTimeout(watchdog)}
}
