import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

// Reuse the preceding owned evidence/directory fixture in this disposable loopback application.
const base = 'http://127.0.0.1:4173', out = 'continuity-my-work-qa-artifacts';
const f = JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const contexts = await Promise.all(Array.from({ length: 5 }, () => createQaContext(browser, base, {}, { viewport: { width: 1440, height: 1000 } })));
const [admin, reviewer, viewer, scoped, anonymous] = contexts, page = await admin.newPage(), reviewPage = await reviewer.newPage();
const errors = [], checks = [], owner = 'qa-admin@fornost.test', today = new Date().toISOString().slice(0, 10);
for (const p of [page, reviewPage]) { p.setDefaultTimeout(20000); p.on('pageerror', error => errors.push(error.message)); }
let phase = 'setup', planId, failedMode = '';
async function api(ctx, path, method = 'GET', data, status = 200) {
  const response = await ctx.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); return response.json();
}
async function openWork(p = page, query = '') {
  if (!(await p.locator('.shell').count())) await p.goto(base);
  await expect(p.locator('.shell')).toBeVisible();
  await p.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await p.locator('nav button[aria-label="My Work"]').evaluate(el => el.click());
  await expect(p.locator('.my-work-v2')).toBeVisible(); await waitForQaIdle(p);
  // A second actor may have acted while this inbox stayed mounted. Use its explicit refresh.
  await p.locator('.my-work-v2').getByRole('button', { name: 'Refresh', exact: true }).click(); await waitForQaIdle(p);
  await p.getByLabel('Work queue module', { exact: true }).selectOption('İş Sürekliliği');
  await p.locator('.mw2-filters').getByRole('button', { name: /^All/ }).click();
  await p.getByRole('textbox', { name: 'Search work', exact: true }).fill(query);
}
async function focusRecord(id) {
  const row = page.locator('.mw2-item'); await expect(row).toHaveCount(1);
  await row.focus(); await page.keyboard.press('Enter'); await waitForQaIdle(page);
  await expect(page.locator('.continuity-page .enterprise-work-focus')).toContainText(id);
  await expect(page.locator('.continuity-table tbody tr')).toHaveCount(1);
}
async function schedule() {
  await api(admin, '/api/continuity', 'POST', { action: 'schedule-exercise', assignmentMode: 'directory', planId, type: 'technical', scheduledDate: today, scenario: 'Validate recovery of the synthetic payment service and its dependencies.', facilitator: owner }, 201);
  return (await api(admin, '/api/continuity')).exercises.find(row => row.planId === planId && row.status === 'planned');
}
try {
  await mkdir(out, { recursive: true });
  for (const [ctx, email] of [[admin, owner], [reviewer, f.reviewerEmail], [viewer, f.viewerEmail], [scoped, f.scopedEmail]]) await api(ctx, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  await api(anonymous, '/api/continuity?view=work', 'GET', undefined, 401);
  await api(scoped, '/api/continuity?view=work', 'GET', undefined, 403);
  const read = await api(viewer, '/api/continuity?view=work'); assert.equal(read.complete, true);
  assert.doesNotMatch(JSON.stringify(read), /"(?:evidencePins|events|scenario|recoveryStrategy|fileKey)"/);
  await api(viewer, '/api/continuity', 'POST', { action: 'activate-plan', planId: f.planId }, 403);
  checks.push('Real anonymous/scoped denial and full-access Viewer read-only access');

  const template = (await api(admin, '/api/continuity')).plans.find(row => row.id === f.planId);
  const name = `QA inbox recovery ${Date.now()}`;
  planId = (await api(admin, '/api/continuity', 'POST', { ...template, action: 'create-plan', assignmentMode: 'directory', name, rtoHours: 2, rpoHours: 1, mtpdHours: 8, reviewDate: today }, 201)).id;
  phase = 'plan approval and activation'; await openWork(page, name);
  await expect(page.locator('.mw2-item')).toHaveCount(1); await expect(page.locator('.mw2-item')).toContainText('Awaiting approval');
  await page.locator('.mw2-filters').getByRole('button', { name: /^Waiting for others/ }).click(); await expect(page.locator('.mw2-item')).toHaveCount(1);
  await openWork(reviewPage, name); await expect(reviewPage.locator('.mw2-item')).toHaveCount(1);
  await api(reviewer, '/api/continuity', 'POST', { action: 'approve-plan', planId, note: 'Independent inbox recovery review completed.', confirmation: 'PLANI ONAYLA' });
  await openWork(page, name); await expect(page.locator('.mw2-item')).toContainText('Awaiting activation');
  await expect(page.locator('.mw2-item time')).toContainText('No due date');
  await focusRecord(planId);
  await api(admin, '/api/continuity', 'POST', { action: 'activate-plan', planId, note: 'Recovery team is ready to exercise.', confirmation: 'PLANI ETKİNLEŞTİR' });
  await openWork(page, name); await expect(page.locator('.mw2-item time')).not.toContainText('No due date');
  checks.push('Draft independent reviewer handoff, approved activation and active review date');

  phase = 'cancel from exact exercise'; const cancelled = await schedule();
  await openWork(page, cancelled.code); await focusRecord(cancelled.id);
  await page.locator('.continuity-table').getByRole('button', { name: 'Cancel exercise', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel exercise', exact: true });
  await dialog.getByLabel('Decision note', { exact: true }).fill('Cancel this synthetic exercise after validating inbox navigation.');
  await dialog.getByLabel('Confirmation phrase', { exact: true }).fill('TATBİKATI İPTAL ET');
  const decision = page.waitForResponse(r => new URL(r.url()).pathname === '/api/continuity' && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Cancel exercise', exact: true }).click(); assert.equal((await decision).status(), 200); await expect(dialog).toBeHidden();
  await openWork(page, cancelled.code); await expect(page.locator('.mw2-item')).toHaveCount(0);
  await page.locator('.mw2-filters').getByRole('button', { name: /^Completed/ }).click();
  await expect(page.locator('.mw2-item')).toHaveCount(1); await expect(page.locator('.mw2-item')).toContainText('Cancelled');
  checks.push('Keyboard exact exercise navigation, real UI cancellation and decision-time completion');

  phase = 'gap owner and independent closure'; const failed = await schedule();
  const version = (await api(admin, `/api/evidence/history?id=${f.evidenceId}`)).versions.sort((a, b) => b.versionNo - a.versionNo)[0];
  const evidence = { evidenceMode: 'library', evidenceSelection: { evidenceId: f.evidenceId, versionId: version.id } };
  await api(admin, '/api/continuity', 'POST', { action: 'complete-exercise', exerciseId: failed.id, outcome: 'failed', actualRecoveryHours: 4, actualDataLossHours: 2, observations: 'Recovery exceeded both synthetic objectives.', rootCause: 'Recovery automation needs a controlled correction.', ...evidence });
  const gap = (await api(admin, '/api/continuity')).gaps.find(row => row.planId === planId && row.status === 'open'); assert.ok(gap);
  await openWork(page, gap.id); await expect(page.locator('.mw2-item')).toHaveCount(1); await focusRecord(gap.id);
  await openWork(reviewPage, gap.id); await expect(reviewPage.locator('.mw2-item')).toHaveCount(1);
  const retest = await schedule();
  await api(admin, '/api/continuity', 'POST', { action: 'complete-exercise', exerciseId: retest.id, outcome: 'passed', actualRecoveryHours: 1, actualDataLossHours: 0, observations: 'Recovery now meets both objectives in the synthetic retest.', ...evidence });
  const close = { action: 'close-gap', gapId: gap.id, retestExerciseId: retest.id, note: 'Independent retest confirms the recovery correction.', confirmation: 'AÇIĞI KAPAT', ...evidence };
  await api(admin, '/api/continuity', 'POST', close, 403); await api(reviewer, '/api/continuity', 'POST', close);
  await openWork(page, gap.id); await expect(page.locator('.mw2-item')).toHaveCount(0);
  await page.locator('.mw2-filters').getByRole('button', { name: /^Completed/ }).click(); await expect(page.locator('.mw2-item')).toHaveCount(1); await focusRecord(gap.id);
  checks.push('Actual failed exercise → assigned gap → independent retest closure → recent completion');

  phase = 'source failure, recovery and export'; await openWork(page, name);
  await page.route(url => url.pathname === '/api/continuity' && url.searchParams.get('view') === 'work', async route => {
    if (failedMode === '503' || failedMode === '403') return route.fulfill({ status: Number(failedMode), contentType: 'application/json', body: '{}' });
    if (failedMode === 'malformed') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const response = await route.fetch(), body = await response.json();
    return route.fulfill({ response, json: failedMode === 'bounded' ? { ...body, complete: false } : body });
  });
  const refresh = page.locator('.my-work-v2').getByRole('button', { name: 'Refresh', exact: true });
  const download = page.getByRole('button', { name: 'Download list (CSV)', exact: true });
  for (const mode of ['503', '403', 'malformed', 'bounded']) {
    failedMode = mode; await refresh.click(); await expect(page.locator('.mw2-load-error')).toBeVisible(); await expect(download).toBeDisabled();
    if (mode !== 'bounded') await expect(page.locator('.mw2-item')).toHaveCount(0);
    failedMode = ''; await refresh.click(); await expect(page.locator('.mw2-load-error')).toHaveCount(0); await expect(download).toBeEnabled();
  }
  const pending = page.waitForEvent('download'); await download.click();
  const csv = await readFile(await (await pending).path(), 'utf8'); assert.ok(csv.includes(name)); assert.ok(csv.includes('İş Sürekliliği')); assert.ok(!csv.includes(f.planId));
  checks.push('Failed/denied/malformed/bounded sources disable CSV, discard stale rows and recover; CSV matches scope');

  phase = 'bilingual visual and keyboard checks';
  for (const lang of ['EN', 'TR']) for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').evaluate(el => el.click());
    await page.setViewportSize({ width, height: 1000 }); await waitForQaIdle(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    const issues = (await new AxeBuilder({ page }).include('.my-work-v2').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
    assert.deepEqual(issues, []); await page.locator('.my-work-v2').screenshot({ path: `${out}/${lang}-${theme}-${width}.png` });
  }
  await api(admin, '/api/continuity', 'POST', { action: 'retire-plan', planId, note: 'Synthetic inbox journey completed and all exercises and gaps resolved.', confirmation: 'PLANI YÜRÜRLÜKTEN KALDIR' });
  await page.setViewportSize({ width: 1440, height: 1000 }); await openWork(page, name); await expect(page.locator('.mw2-item')).toHaveCount(0);
  await page.locator('.mw2-filters').getByRole('button', { name: /^Completed/ }).click();
  const retired = page.locator('.mw2-item').filter({ has: page.getByText(`Continuity plan · ${name}`, { exact: true }) });
  await expect(retired).toHaveCount(1); await expect(retired).toContainText('Retired');
  await expect(page.locator('.mw2-item')).toHaveCount(4); // The plan and its three terminal exercises share the searched plan name.
  checks.push('Eight TR/EN light/dark desktop/mobile views, accessibility and actual plan retirement');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'PASS', checks, errors, planId, cleanup: 'Owned plan retired; exercises completed/cancelled and gap closed. Immutable synthetic history remains only in the disposable loopback database.' }, null, 2));
  console.log('CONTINUITY_MY_WORK_QA_PASS');
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ phase, message: error.message, stack: error.stack, planId }, null, 2));
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); throw error;
} finally { await browser.close(); }
