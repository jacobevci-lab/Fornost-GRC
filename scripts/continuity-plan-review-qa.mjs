import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

const base = 'http://127.0.0.1:4173', out = 'continuity-plan-review-qa-artifacts';
const f = JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const [admin, reviewer, viewer, scoped, anonymous] = await Promise.all(Array.from({ length: 5 }, () => createQaContext(browser, base, {}, { viewport: { width: 1440, height: 1000 } })));
const page = await reviewer.newPage(), readerPage = await viewer.newPage(), owner = 'qa-admin@fornost.test';
const today = new Date().toISOString().slice(0, 10), future = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const checks = [], errors = []; let phase = 'setup', planId, exerciseId, readFailure = false, dropResponse = false;
for (const p of [page, readerPage]) { p.setDefaultTimeout(20000); p.on('pageerror', error => errors.push(error.message)); }
async function api(ctx, path, method = 'GET', data, status = 200) {
  const response = await ctx.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); return response.json();
}
const workspace = ctx => api(ctx, `/api/continuity?view=review&planId=${planId}`);
async function openWork(name) {
  if (!(await page.locator('.shell').count())) await page.goto(base);
  await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="My Work"]').evaluate(el => el.click()); await waitForQaIdle(page);
  await page.locator('.my-work-v2').getByRole('button', { name: 'Refresh', exact: true }).click(); await waitForQaIdle(page);
  await page.getByLabel('Work queue module', { exact: true }).selectOption('İş Sürekliliği');
  await page.locator('.mw2-filters').getByRole('button', { name: /^All/ }).click();
  await page.getByRole('textbox', { name: 'Search work', exact: true }).fill(name); await expect(page.locator('.mw2-item')).toHaveCount(1);
}
async function openDetails(p = page, tr = false) {
  await p.locator('.continuity-table').getByRole('button', { name: tr ? 'Plan ayrıntıları ve incelemeler' : 'Plan details and reviews', exact: true }).click();
  const dialog = p.getByRole('dialog', { name: tr ? 'Plan ayrıntıları ve incelemeler' : 'Plan details and reviews', exact: true });
  await expect(dialog).toBeVisible(); await waitForQaIdle(p); await expect(dialog.locator('.cpr-facts').first()).toBeVisible(); return dialog;
}
async function draft(dialog, note, date, tr = false) {
  await dialog.getByRole('button', { name: tr ? 'Gözden geçirmeyi kaydet' : 'Record periodic review', exact: true }).click();
  await dialog.getByLabel(tr ? 'İnceleme gerekçesi' : 'Review rationale', { exact: true }).fill(note);
  await dialog.getByLabel(tr ? 'Sonraki gözden geçirme tarihi' : 'Next review date', { exact: true }).fill(date);
  await dialog.getByRole('checkbox').check();
}
async function save(dialog, expected = 200) {
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/continuity' && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'review-plan');
  await dialog.getByRole('button', { name: 'Record review', exact: true }).click();
  const response = await pending; assert.equal(response.status(), expected, await response.text()); return response.json();
}
try {
  await mkdir(out, { recursive: true });
  for (const [ctx, email] of [[admin, owner], [reviewer, f.reviewerEmail], [viewer, f.viewerEmail], [scoped, f.scopedEmail]]) await api(ctx, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  const template = (await api(admin, '/api/continuity')).plans.find(row => row.id === f.planId);
  const name = `QA periodic review ${Date.now()}`;
  planId = (await api(admin, '/api/continuity', 'POST', { ...template, action: 'create-plan', assignmentMode: 'directory', name, reviewDate: today }, 201)).id;
  await api(reviewer, '/api/continuity', 'POST', { action: 'approve-plan', planId, note: 'Initial independent plan review for the periodic-review journey.', confirmation: 'PLANI ONAYLA' });
  await api(admin, '/api/continuity', 'POST', { action: 'activate-plan', planId, note: 'Recovery team is ready for periodic assurance.', confirmation: 'PLANI ETKİNLEŞTİR' });
  const current = await workspace(reviewer); assert.equal(current.canReview, true); assert.equal(current.reviews.length, 0);
  await api(anonymous, `/api/continuity?view=review&planId=${planId}`, 'GET', undefined, 401);
  await api(scoped, `/api/continuity?view=review&planId=${planId}`, 'GET', undefined, 403);
  assert.equal((await workspace(viewer)).canReview, false); assert.equal((await workspace(admin)).canReview, false);
  const forbidden = { action: 'review-plan', planId, requestId: 'BPR-00000000-0000-4000-8000-000000000099', expectedRevision: current.plan.updatedAt, note: 'An owner cannot independently attest their own plan.', nextReviewDate: future(30), confirmation: 'PLAN REVIEWED' };
  for (const ctx of [admin, viewer, scoped]) await api(ctx, '/api/continuity', 'POST', forbidden, 403);
  checks.push('Actual anonymous/scoped read denial; owner and Viewer cannot record; assigned reviewer authorized');

  phase = 'reviewer inbox and periodic decision'; await openWork(name);
  await page.locator('.mw2-item').focus(); await page.keyboard.press('Enter'); await waitForQaIdle(page);
  await expect(page.locator('.enterprise-work-focus')).toContainText(planId);
  let dialog = await openDetails(); await expect(dialog).toContainText(template.recoveryStrategy);
  const note1 = 'Reviewed the current recovery objectives, dependencies and communication responsibilities.';
  await draft(dialog, note1, today);
  assert.equal(await dialog.getByLabel('Next review date', { exact: true }).evaluate(element => element.checkValidity()), false);
  await dialog.getByLabel('Next review date', { exact: true }).fill(future(30)); await save(dialog);
  await expect(dialog.locator('.cpr-history>article')).toHaveCount(1); await expect(dialog).toContainText('Review recorded');
  let state = await workspace(reviewer); assert.equal(state.plan.reviewDate, future(30)); assert.equal(state.plan.status, 'active'); assert.equal(state.reviews[0].snapshot.reviewDate, today); assert.equal(state.reviews[0].actor, f.reviewerEmail);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await openWork(name); await expect(page.locator('.mw2-item time')).toHaveText(new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(future(30))));
  await page.locator('.mw2-item').click(); await waitForQaIdle(page); dialog = await openDetails();
  checks.push('Assigned reviewer opens exact plan from My Work, reads full context, records review and sees the new queue date');

  phase = 'real source conflict and preserved draft';
  const note2 = 'Rechecked the plan after a concurrent exercise scheduling change.';
  await draft(dialog, note2, future(60));
  await api(admin, '/api/continuity', 'POST', { action: 'schedule-exercise', assignmentMode: 'directory', planId, type: 'tabletop', scheduledDate: future(7), scenario: 'A synthetic exercise schedule changes the source revision during review.', facilitator: owner }, 201);
  exerciseId = (await api(admin, '/api/continuity')).exercises.find(e => e.planId === planId && e.status === 'planned').id;
  await save(dialog, 409); await expect(dialog.getByLabel('Review rationale', { exact: true })).toHaveValue(note2);
  await dialog.getByRole('button', { name: 'Refresh plan', exact: true }).click(); await waitForQaIdle(page);
  await expect(dialog.getByRole('button', { name: 'Record review', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Next review date', { exact: true })).toHaveValue(future(60));
  await dialog.getByRole('button', { name: 'Use current plan version', exact: true }).click(); await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.getByRole('checkbox').check(); await save(dialog); await expect(dialog.locator('.cpr-history>article')).toHaveCount(2);
  await api(admin, '/api/continuity', 'POST', { action: 'cancel-exercise', exerciseId, note: 'Synthetic source-conflict exercise is no longer needed.', confirmation: 'TATBİKATI İPTAL ET' });
  await dialog.getByRole('button', { name: 'Refresh plan', exact: true }).click(); await waitForQaIdle(page);
  checks.push('Concurrent real source mutation rejects old revision, preserves draft and requires explicit fresh-source acknowledgement');

  phase = 'lost response and idempotent retry';
  await page.route(url => url.pathname === '/api/continuity', async route => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).searchParams.get('view') === 'review' && readFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'review-plan' && dropResponse) {
      dropResponse = false; const response = await route.fetch(); assert.equal(response.status(), 200); return route.abort('failed');
    }
    return route.continue();
  });
  const note3 = 'Confirmed current plan suitability while testing a lost response and safe retry.';
  await draft(dialog, note3, future(90)); dropResponse = true;
  await dialog.getByRole('button', { name: 'Record review', exact: true }).click(); await expect(dialog).toContainText('The outcome could not be confirmed');
  assert.equal((await workspace(reviewer)).reviews.length, 3); await expect(dialog.getByLabel('Review rationale', { exact: true })).toHaveValue(note3);
  assert.equal((await save(dialog)).replay, true); await expect(dialog.locator('.cpr-history>article')).toHaveCount(3);
  assert.equal((await workspace(reviewer)).reviews.length, 3);
  checks.push('Server commits before a dropped response; identical browser retry returns the original decision without duplication');

  phase = 'read recovery and viewer history';
  const note4 = 'Draft preserved while refreshing an unavailable source, without recording another decision.';
  await draft(dialog, note4, future(120)); readFailure = true;
  await dialog.getByRole('button', { name: 'Refresh plan', exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  readFailure = false; await dialog.getByRole('button', { name: 'Refresh plan', exact: true }).click(); await waitForQaIdle(page);
  await expect(dialog.getByLabel('Review rationale', { exact: true })).toHaveValue(note4); await expect(dialog.getByLabel('Next review date', { exact: true })).toHaveValue(future(120));
  await dialog.getByRole('button', { name: 'Cancel draft', exact: true }).click(); await page.keyboard.press('Escape');
  await readerPage.goto(base); await expect(readerPage.locator('.shell')).toBeVisible();
  await readerPage.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await readerPage.locator('nav button[aria-label="Business Continuity & Resilience"]').evaluate(element => element.click()); await waitForQaIdle(readerPage);
  await readerPage.getByRole('textbox', { name: 'Search records', exact: true }).fill(name);
  const readDialog = await openDetails(readerPage); await expect(readDialog.getByRole('button', { name: 'Record periodic review', exact: true })).toHaveCount(0);
  await expect(readDialog.locator('.cpr-history>article')).toHaveCount(3);
  const original = readDialog.locator('.cpr-history>article').last(); await original.locator('summary').click(); await expect(original).toContainText(today); await expect(original).toContainText(note1);
  await readerPage.keyboard.press('Escape'); checks.push('Failed reads retain drafts; full-access Viewer inspects immutable original snapshots without mutation controls');

  phase = 'bilingual responsive and keyboard QA';
  for (const lang of ['EN', 'TR']) for (const theme of ['light', 'dark']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').evaluate(element => element.click());
    dialog = await openDetails(page, lang === 'TR'); await draft(dialog, note4, future(120), lang === 'TR');
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await waitForQaIdle(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 2));
      const violations = (await new AxeBuilder({ page }).include('.cpr-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations; assert.deepEqual(violations, []);
      await dialog.locator('.cpr-form').scrollIntoViewIfNeeded(); await dialog.screenshot({ path: `${out}/${lang}-${theme}-${width}.png` });
    }
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    await expect(page.locator('.continuity-table').getByRole('button', { name: lang === 'TR' ? 'Plan ayrıntıları ve incelemeler' : 'Plan details and reviews', exact: true })).toBeFocused();
  }
  checks.push('Twelve TR/EN light/dark desktop/tablet/phone views, accessibility, Escape dismissal and restored keyboard focus');
  await api(admin, '/api/continuity', 'POST', { action: 'retire-plan', planId, note: 'Synthetic periodic-review journey completed; no active exercises or gaps remain.', confirmation: 'PLANI YÜRÜRLÜKTEN KALDIR' });
  state = await workspace(reviewer); assert.equal(state.canReview, false); assert.equal(state.reviews.length, 3); assert.deepEqual(errors, []);
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'PASS', checks, errors, planId, cleanup: 'Owned exercise cancelled and plan retired; immutable synthetic reviews retained only in the disposable loopback database.' }, null, 2));
  console.log('CONTINUITY_PLAN_REVIEW_QA_PASS');
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ phase, message: error.message, stack: error.stack, planId, exerciseId }, null, 2));
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); throw error;
} finally { await browser.close(); }
