import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';
import { qaPassword } from './qa-credentials.mjs';
const base = 'http://127.0.0.1:4173',
  owner = 'qa-admin@fornost.test',
  run = Date.now(),
  reviewer = 'review-' + run + '@fornost.test',
  technical = 'technical-' + run + '@fornost.test';
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM_PATH || undefined
});
const ctx = await createQaContext(browser, base, {}, {
    viewport: {
      width: 1440,
      height: 940
    }
  }),
  page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const api = async (context, path, data, status = 200) => {
  const r = await context.request.fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      origin: base
    },
    data
  });
  assert.equal(r.status(), status, await r.text());
  return r.json();
};
const pick = async (d, label, email) => {
  const box = d.getByRole('combobox', {
    name: label,
    exact: true
  });
  await box.fill(email);
  await d.getByRole('option').filter({
    hasText: email
  }).first().click();
};
const endpoint = '/api/ai/workspace';
try {
  await api(ctx, '/api/auth', {
    action: 'login',
    email: owner,
    password: qaPassword()
  });
  for (const email of [reviewer, technical]) await api(ctx, '/api/users', {
    name: email.split('@')[0],
    email,
    password: qaPassword(),
    role: 'Admin'
  }, 201);
  await page.goto(base);
  await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', {
    name: 'EN',
    exact: true
  }).click();
  await page.locator('nav button[aria-label="AI Governance"]').evaluate(b => b.click());
  await waitForQaIdle(page);
  const home = page.locator('.ag-workspace'),
    nav = home.locator('.ag-nav'),
    kpis = home.locator('.ag-kpis button');
  await expect(kpis).toHaveCount(5);
  await expect(nav.locator('button')).toHaveCount(5);
  await kpis.nth(3).click();
  await home.getByRole('button', {
    name: '+ Record shadow AI',
    exact: true
  }).click();
  let d = page.getByRole('dialog');
  await d.getByLabel('Tool name').fill('Shadow pilot ' + run);
  await d.getByLabel('Where and how').fill('Tool discovered in a procurement review.');
  await d.getByRole('button', {
    name: 'Save',
    exact: true
  }).click();
  await home.getByRole('button', {
    name: 'Admit to inventory for assessment'
  }).click();
  d = page.getByRole('dialog');
  await expect(d.getByLabel('System / agent name')).toHaveValue('Shadow pilot ' + run);
  await d.getByLabel('Model / version').fill('QA 1');
  await d.getByLabel('Business unit').fill('Operations');
  await d.getByLabel('Intended purpose').fill('Forecast service demand for operations.');
  await d.getByLabel('Architecture', {
    exact: true
  }).selectOption('agent');
  await d.getByLabel('Authorized tool / API scope').fill('Read-only internal operations data');
  await d.getByLabel('Human-in-the-loop').fill('A supervisor approves each recommendation.');
  await d.getByLabel('EU AI Act risk level').selectOption('minimal');
  await d.getByLabel('Unregistered provider name').fill('Local QA');
  await d.getByLabel('Public data only', {
    exact: true
  }).check();
  await pick(d, 'AI business owner', owner);
  await pick(d, 'Technical / model owner', technical);
  await pick(d, 'Independent reviewer (Admin)', reviewer);
  await d.getByLabel('Periodic review date').fill(new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10));
  for (const label of ['Impact', 'Likelihood', 'Data sensitivity', 'Autonomy risk', 'Control maturity']) await d.getByLabel(label + ' (1–5)', {
    exact: true
  }).selectOption('3');
  await d.getByLabel('Existing controls and risk rationale').fill('Read-only recommendations are independently reviewed.');
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(endpoint));
  await d.getByRole('button', {
    name: 'Save system profile'
  }).click();
  const res = await saved;
  assert.equal(res.status(), 201, await res.text());
  const {
    id
  } = await res.json();
  const load = async () => (await api(ctx, endpoint)).systems.find(m => m.id === id);
  let m = await load();
  assert.match(m.code, /^AIS-\d{3,}$/);
  assert.equal(m.phase, 'assessment');
  await home.getByRole('button', {
    name: 'Submit for independent review'
  }).click();
  await expect(home.getByRole('button', {
    name: 'Submit for independent review'
  })).toHaveCount(0);
  m = await load();
  assert.equal(m.phase, 'review');
  await api(ctx, endpoint, {
    action: 'approve',
    id,
    revision: m.revision,
    note: 'Own approval must fail'
  }, 403);
  const reviewerCtx = await createQaContext(browser, base, {});
  await api(reviewerCtx, '/api/auth', {
    action: 'login',
    email: reviewer,
    password: qaPassword()
  });
  await api(reviewerCtx, endpoint, {
    action: 'approve',
    id,
    revision: m.revision,
    note: 'Independent assessment reviewed and approved.'
  });
  m = await load();
  await api(ctx, endpoint, {
    action: 'monitor',
    id,
    revision: m.revision,
    accuracy: 95,
    errorRate: 2,
    driftScore: 42,
    biasScore: 0,
    hallucination: 0,
    leakage: 0,
    p95LatencyMs: 120,
    sampleSize: 75,
    note: 'Observed a material shift in the evaluation distribution.'
  });
  m = await load();
  const observation = m.metrics[0].id;
  assert.equal(m.metrics[0].health, 'critical');
  const f = await api(ctx, endpoint, {
    action: 'capa',
    id,
    revision: m.revision,
    observation
  });
  assert.equal((await api(ctx, endpoint, {
    action: 'capa',
    id,
    revision: m.revision,
    observation
  })).id, f.id);
  m = await load();
  assert.match(m.metrics[0].finding_code, /^FND-\d+$/);
  await page.reload();
  await expect(home).toBeVisible();
  await nav.getByRole('button', {
    name: 'Continuous monitoring & drift'
  }).click();
  await home.getByRole('button', {
    name: 'Suspend (kill switch)'
  }).first().click();
  await page.getByRole('dialog').getByRole('button', {
    name: 'Suspend',
    exact: true
  }).click();
  await expect(home.locator('.ag-table')).toContainText('Suspended');
  for (const lang of ['TR', 'EN']) for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    await page.setViewportSize({
      width,
      height: 940
    });
    await page.locator('.language-switch:visible').getByRole('button', {
      name: lang,
      exact: true
    }).click();
    await page.evaluate(x => document.documentElement.dataset.theme = x, theme);
    await kpis.first().click();
    await expect(home.locator('.ag-table')).toContainText('AIS-');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'page overflow ' + [lang, theme, width].join('/'));
    const name = lang === 'TR' ? '+ AI Sistemi Kaydet' : '+ Register AI system';
    await home.getByRole('button', {
      name,
      exact: true
    }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    assert.equal(await page.getByRole('dialog').locator('fieldset > legend').count(), 4);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width === 1440) {
      const {
        violations
      } = await new AxeBuilder({
        page
      }).include('.ag-workspace').withTags(['wcag2a', 'wcag2aa']).analyze();
      assert.deepEqual(violations.map(v => [v.id, v.nodes.map(n => [n.target, n.failureSummary])]), [], [lang, theme, width].join("/"));
    }
  }
  const csv = await ctx.request.get(base + endpoint + '?format=csv&lang=en');
  assert.ok((await csv.text()).includes(m.code));
  await page.setViewportSize({width:1440,height:940});
  await home.getByRole('button',{name:'Technical model dossiers →'}).click();
  await page.locator('.ai-primary-nav').getByRole('button',{name:'Assessments',exact:true}).click();
  const flags=page.locator('.ai-impact-flags');
  await expect(flags.getByRole('checkbox')).toHaveCount(10);
  for(const [lang,theme,width] of [['TR','light',1440],['TR','dark',390],['EN','dark',1440],['EN','light',390]]){
    await page.setViewportSize({width,height:940});
    await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
    await page.evaluate(value=>{document.documentElement.dataset.theme=value},theme);
    const box=flags.getByRole('checkbox',{name:lang==='TR'?'Kişisel veri':'Personal data',exact:true});
    const row=flags.locator('label').first();
    const grid=await flags.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(grid,width===390?1:2);
    const swatches=await row.evaluate(el=>{
      const probe=document.createElement('i');el.append(probe);
      const colors=['--ws-surface','--ws-brand-soft','--ws-ink'].map(token=>{
        probe.style.backgroundColor='var('+token+')';return getComputedStyle(probe).backgroundColor;
      });
      probe.remove();return colors;
    });
    await expect(row).toHaveCSS('background-color',swatches[0]);
    await expect(row.locator('span')).toHaveCSS('color',swatches[2]);
    await row.locator('span').click();await expect(box).toBeChecked();
    await expect(row).toHaveCSS('background-color',swatches[1]);
    const {violations}=await new AxeBuilder({page}).include('.ai-impact-flags').withRules(['color-contrast','label']).analyze();
    assert.deepEqual(violations.map(v=>v.id),[],lang+'/'+theme);
    await box.focus();await page.keyboard.press('Space');await expect(box).not.toBeChecked();
    await expect(row).toHaveCSS('outline-style','solid');
    const bounds=await box.boundingBox();assert.ok(bounds&&bounds.width===24&&bounds.height===24);
  }
  assert.deepEqual(errors, []);
  console.log('AI governance browser QA passed: registration, Shadow admission, SoD, go-live, monitoring, CAPA, suspension, CSV and eight language/theme/viewport combinations.');
} finally {
  await browser.close();
}
