import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

const base = 'http://127.0.0.1:4173', out = 'policy-periodic-review-qa-artifacts';
const f = JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const [admin, reviewer, viewer, scoped, anonymous] = await Promise.all(Array.from({ length: 5 }, () => createQaContext(browser, base, {}, { viewport: { width: 1440, height: 1000 } })));
const page = await reviewer.newPage(), reader = await viewer.newPage(), owner = 'qa-admin@fornost.test', tag = Date.now(), name = `QA periodic policy ${tag}`;
const future = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10), checks = [], errors = [];
let phase = 'setup', policyId, versionId, readFailure = false, dropResponse = false;
for (const p of [page, reader]) { p.setDefaultTimeout(20000); p.on('pageerror', error => errors.push(error.message)); }
async function api(ctx, path, method = 'GET', data, status = 200) { const r = await ctx.request.fetch(base + path, { method, data, headers: { origin: base } }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json(); }
const workspace = ctx => api(ctx, `/api/policy-lifecycle?view=review&policyId=${policyId}`);
let library;
async function versionAction(ctx, operation, confirmation) { const source = await api(ctx, `/api/policy-lifecycle?view=decision&kind=version&id=${versionId}`); return api(ctx, '/api/policy-lifecycle', 'POST', { action: 'version-action', versionId, operation, confirmation, note: 'Independent controlled publication for the periodic-review journey.', decisionMode: 'reviewed', expectedRevision: source.revision, ...library }); }
async function openWork() {
  if (!(await page.locator('.shell').count())) await page.goto(base);
  await expect(page.locator('.shell')).toBeVisible(); await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="My Work"]').evaluate(el => el.click()); await waitForQaIdle(page);
  await page.locator('.my-work-v2').getByRole('button', { name: 'Refresh', exact: true }).click(); await waitForQaIdle(page);
  await page.getByLabel('Work queue module', { exact: true }).selectOption('Politika Merkezi'); await page.locator('.mw2-filters').getByRole('button', { name: /^All/ }).click();
  await page.getByRole('textbox', { name: 'Search work', exact: true }).fill(name); await expect(page.locator('.mw2-item')).toHaveCount(1);
}
async function openDetails(p = page, tr = false) {
  await p.locator('.plm-table tbody tr').filter({ hasText: name }).getByRole('button', { name: tr ? 'Aç' : 'Open', exact: true }).click();
  await p.getByRole('dialog', { name, exact: true }).getByRole('button', { name: tr ? 'Periyodik inceleme ve geçmiş' : 'Periodic review and history', exact: true }).click();
  const d = p.getByRole('dialog', { name: tr ? 'Periyodik politika incelemesi' : 'Periodic policy review', exact: true }); await expect(d).toBeVisible(); await waitForQaIdle(p); await expect(d.locator('.cpr-facts').first()).toBeVisible(); return d;
}
async function draft(d, note, date, tr = false) { await d.getByRole('button', { name: tr ? 'İncelemeyi hazırla' : 'Prepare review', exact: true }).click(); await d.getByLabel(tr ? 'İnceleme gerekçesi' : 'Review rationale', { exact: true }).fill(note); await d.getByLabel(tr ? 'Sonraki inceleme tarihi' : 'Next review date', { exact: true }).fill(date); await d.getByRole('checkbox').check(); }
async function save(d, status = 200) { const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/policy-lifecycle' && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'review-policy'); await d.getByRole('button', { name: 'Record review', exact: true }).click(); const r = await pending; assert.equal(r.status(), status, await r.text()); return r.json(); }
async function dismiss(p = page) { await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await waitForQaIdle(p); }
try {
  await mkdir(out, { recursive: true });
  for (const [ctx, email] of [[admin, owner], [reviewer, f.reviewerEmail], [viewer, f.viewerEmail], [scoped, f.scopedEmail]]) await api(ctx, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  // Keep publication evidence separate from shared fixture usage-count assertions.
  const upload = await admin.request.post(base + '/api/evidence', { headers: { origin: base }, multipart: { evidenceTitle: `Periodic policy proof ${tag}`, owner, period: '2026-Q4', controlRef: 'A.5.30', status: 'İncelemede', file: { name: 'policy-review-proof.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic independent policy publication evidence') } } });
  assert.equal(upload.status(), 201, await upload.text()); const evidenceId = (await upload.json()).id;
  const evidenceVersion = (await api(admin, `/api/evidence/history?id=${evidenceId}`)).versions[0];
  library = { evidenceMode: 'library', evidenceSelection: { evidenceId, versionId: evidenceVersion.id } };
  policyId = (await api(admin, '/api/policy-lifecycle', 'POST', { action: 'save-policy', assignmentMode: 'directory', code: `QA-PPR-${tag}`, title: name, category: 'security', classification: 'internal', owner, reviewer: f.reviewerEmail, audience: 'Synthetic policy team', reviewFrequencyDays: 365 }, 201)).id;
  const versionInput = { action: 'create-version', policyId, summary: 'Controlled policy for independent periodic suitability review.', content: 'This policy governs access, accountability and independent review of continuing suitability. Owners preserve controlled evidence and follow the version workflow when content changes.', effectiveDate: future(-400), regulationRefs: ['ISO-27001'] };
  versionId = (await api(admin, '/api/policy-lifecycle', 'POST', versionInput, 201)).id;
  await versionAction(admin, 'submit', 'İNCELEMEYE GÖNDER'); await versionAction(reviewer, 'approve', 'POLİTİKAYI ONAYLA'); await versionAction(reviewer, 'publish', 'POLİTİKAYI YAYINLA');
  const current = await workspace(reviewer); assert.equal(current.canReview, true); assert.equal(current.reviews.length, 0);
  await api(anonymous, `/api/policy-lifecycle?view=review&policyId=${policyId}`, 'GET', undefined, 401); await api(scoped, `/api/policy-lifecycle?view=review&policyId=${policyId}`, 'GET', undefined, 403);
  assert.equal((await workspace(viewer)).canReview, false); assert.equal((await workspace(admin)).canReview, false);
  const forbidden = { action: 'review-policy', policyId, requestId: 'PPR-00000000-0000-4000-8000-000000000099', expectedRevision: current.revision, note: 'An owner cannot independently attest their own controlled policy.', nextReviewDate: future(30), confirmation: 'POLICY REVIEWED' };
  for (const ctx of [admin, viewer, scoped]) await api(ctx, '/api/policy-lifecycle', 'POST', forbidden, 403);
  checks.push('Actual anonymous/scoped denial, Viewer history access, owner denial and assigned independent reviewer authorization');

  phase = 'My Work and periodic decision'; await openWork(); await page.locator('.mw2-item').focus(); await page.keyboard.press('Enter'); await waitForQaIdle(page); await expect(page.locator('.enterprise-work-focus')).toContainText(policyId);
  let d = await openDetails(); await expect(d).toContainText(versionInput.content); await expect(d).toContainText(current.version.content_sha256);
  const note1 = 'Reviewed the published content, mappings, audience and responsibilities; this policy remains suitable.';
  await draft(d, note1, future(0)); assert.equal(await d.getByLabel('Next review date', { exact: true }).evaluate(el => el.checkValidity()), false);
  await d.getByLabel('Next review date', { exact: true }).fill(future(366)); assert.equal(await d.getByLabel('Next review date', { exact: true }).evaluate(el => el.checkValidity()), false);
  await d.getByLabel('Next review date', { exact: true }).fill(future(30)); await save(d); await expect(d.locator('.cpr-history>article')).toHaveCount(1);
  let state = await workspace(reviewer); assert.equal(state.policy.next_review, future(30)); assert.equal(state.reviews[0].snapshot.policy.next_review, current.policy.next_review); assert.deepEqual(state.version, current.version);
  await dismiss(); await openWork(); await expect(page.locator('.mw2-item time')).toHaveText(new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(future(30))));
  await page.locator('.mw2-item').click(); await waitForQaIdle(page); d = await openDetails(); checks.push('Keyboard opens exact policy from My Work; date bounds, retained published snapshot and updated queue date verified');

  phase = 'source conflict and explicit adoption'; const note2 = 'Rechecked continued suitability after a concurrent change to the policy audience.'; await draft(d, note2, future(60));
  const policy = (await api(admin, '/api/policy-lifecycle')).documents.find(p => p.id === policyId);
  await api(admin, '/api/policy-lifecycle', 'POST', { ...policy, policyId, action: 'save-policy', assignmentMode: 'directory', audience: 'Updated synthetic policy team' });
  await save(d, 409); await expect(d.getByLabel('Review rationale', { exact: true })).toHaveValue(note2); await expect(d.getByRole('button', { name: 'Record review', exact: true })).toBeDisabled();
  await d.getByRole('button', { name: 'Refresh policy', exact: true }).click(); await waitForQaIdle(page); await expect(d).toContainText('Updated synthetic policy team'); await expect(d.getByRole('button', { name: 'Record review', exact: true })).toBeDisabled();
  await d.getByRole('button', { name: 'Use current context', exact: true }).click(); await expect(d.getByRole('checkbox')).not.toBeChecked(); await d.getByRole('checkbox').check(); await save(d); await expect(d.locator('.cpr-history>article')).toHaveCount(2);
  checks.push('Real metadata mutation rejects old source; retained rationale/date require explicit new-source adoption and renewed confirmation');

  phase = 'lost response and failed reads'; await page.route(url => url.pathname === '/api/policy-lifecycle', async route => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).searchParams.get('view') === 'review' && readFailure) return route.fulfill({ status: 503, json: {} });
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'review-policy' && dropResponse) { dropResponse = false; const response = await route.fetch(); assert.equal(response.status(), 200); return route.abort('failed'); }
    return route.continue();
  });
  const note3 = 'Confirmed the controlled published version while testing safe recovery after a lost response.'; await draft(d, note3, future(90)); dropResponse = true;
  await d.getByRole('button', { name: 'Record review', exact: true }).click(); await expect(d).toContainText('The outcome could not be confirmed'); assert.equal((await workspace(reviewer)).reviews.length, 3); assert.equal((await save(d)).replay, true); await expect(d.locator('.cpr-history>article')).toHaveCount(3);
  const note4 = 'Keep this draft while the current source is unavailable; do not create another review.'; await draft(d, note4, future(120)); readFailure = true;
  await d.getByRole('button', { name: 'Refresh policy', exact: true }).click(); await expect(d.getByRole('alert')).toBeVisible(); await expect(d.getByLabel('Review rationale', { exact: true })).toHaveValue(note4); await expect(d.getByRole('button', { name: 'Record review', exact: true })).toBeDisabled();
  readFailure = false; await d.getByRole('button', { name: 'Refresh policy', exact: true }).click(); await waitForQaIdle(page); await expect(d.getByLabel('Next review date', { exact: true })).toHaveValue(future(120)); await dismiss();
  checks.push('Commit followed by dropped response replays exactly once; failed source reads preserve editable draft and block submission');

  phase = 'Viewer retained history'; await reader.goto(base); await expect(reader.locator('.shell')).toBeVisible(); await reader.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click(); await reader.locator('nav button[aria-label="Policy Center"]').evaluate(el => el.click()); await waitForQaIdle(reader); await reader.locator('.plm-tabs').getByRole('button', { name: 'Policy Register', exact: true }).click();
  const readDialog = await openDetails(reader); await expect(readDialog.getByRole('button', { name: 'Prepare review', exact: true })).toHaveCount(0); await expect(readDialog.locator('.cpr-history>article')).toHaveCount(3);
  const original = readDialog.locator('.cpr-history>article').last(); await original.locator(':scope > details > summary').click(); await expect(original).toContainText('Synthetic policy team'); await expect(original).toContainText(versionInput.content); await dismiss(reader);
  checks.push('Full-access Viewer reads exact original version and metadata history without review mutation controls');

  phase = 'bilingual responsive and keyboard QA';
  for (const lang of ['EN', 'TR']) for (const theme of ['light', 'dark']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click(); if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').evaluate(el => el.click());
    d = await openDetails(page, lang === 'TR'); await draft(d, note4, future(120), lang === 'TR');
    for (const width of [1440, 1024, 390]) { await page.setViewportSize({ width, height: 1000 }); await waitForQaIdle(page); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)); assert.ok(await d.evaluate(el => el.scrollWidth <= el.clientWidth + 2)); assert.deepEqual((await new AxeBuilder({ page }).include('.plm-decision').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations, []); await d.locator('.cpr-form').scrollIntoViewIfNeeded(); await d.screenshot({ path: `${out}/${lang}-${theme}-${width}.png` }); }
    await page.keyboard.press('Escape'); await expect(d).toBeHidden(); await expect(page.getByRole('dialog', { name, exact: true }).getByRole('button', { name: lang === 'TR' ? 'Periyodik inceleme ve geçmiş' : 'Periodic review and history', exact: true })).toBeFocused(); await page.keyboard.press('Escape');
  }
  checks.push('Twelve TR/EN light/dark desktop/tablet/mobile views with no Axe violations or overflow, Escape and restored focus');

  phase = 'revision-in-progress blocker'; await api(admin, '/api/policy-lifecycle', 'POST', { ...versionInput, summary: 'A revised controlled policy requires its own content approval.' }, 201); assert.equal((await workspace(reviewer)).canReview, false); assert.equal((await workspace(reviewer)).pendingRevision, true);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click(); d = await openDetails(); await expect(d).toContainText('Another version is being prepared'); await expect(d.getByRole('button', { name: 'Prepare review', exact: true })).toHaveCount(0); await d.getByRole('button', { name: 'Open versions', exact: true }).click(); await expect(d).toBeHidden(); await expect(page.locator('.plm-tabs button.active')).toHaveText('Versions & Release');
  checks.push('An actual new draft version blocks suitability renewal and directs the reviewer to the controlled version workflow');
  const retire = await api(reviewer, `/api/policy-lifecycle?view=decision&kind=retire&id=${policyId}`); await api(reviewer, '/api/policy-lifecycle', 'POST', { action: 'retire-policy', policyId, confirmation: 'POLİTİKAYI YÜRÜRLÜKTEN KALDIR', note: 'Synthetic periodic-review journey completed; retain the review audit trail.', decisionMode: 'reviewed', expectedRevision: retire.revision, ...library });
  assert.equal((await workspace(reviewer)).reviews.length, 3); assert.deepEqual(errors, []);
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'PASS', checks, errors, policyId, versionId, cleanup: 'Owned policy retired; immutable synthetic history retained only in disposable loopback QA.' }, null, 2)); console.log('POLICY_PERIODIC_REVIEW_QA_PASS');
} catch (error) { await writeFile(`${out}/failure.json`, JSON.stringify({ phase, message: error.message, stack: error.stack, policyId, versionId, checks }, null, 2)); await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); }
