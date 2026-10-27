import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

const base = 'http://127.0.0.1:4173', out = 'policy-campaign-completion-qa-artifacts';
const f = JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const [admin, reviewer, viewer, scoped, anonymous] = await Promise.all(Array.from({ length: 5 }, () => createQaContext(browser, base, {}, { viewport: { width: 1440, height: 1000 } })));
const page = await admin.newPage(), peer = await reviewer.newPage(), reader = await viewer.newPage(), owner = 'qa-admin@fornost.test';
const today = new Date().toISOString().slice(0, 10), future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), name = `QA campaign completion ${Date.now()}`;
const checks = [], errors = []; let phase = 'setup', policyId, versionId, campaignId, readFailure = false, dropResponse = false;
for (const p of [page, peer, reader]) { p.setDefaultTimeout(20000); p.on('pageerror', e => errors.push(e.message)); }
async function api(ctx, path, method = 'GET', data, status = 200) {
  const response = await ctx.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); return response.json();
}
const state = () => api(admin, `/api/policy-lifecycle?view=campaign&campaignId=${campaignId}`);
async function open(p, lang = 'EN') {
  await p.goto(base); await expect(p.locator('.shell')).toBeVisible();
  await p.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
  await p.locator(`nav button[aria-label="${lang === 'EN' ? 'Policy Center' : 'Politika Merkezi'}"]`).evaluate(el => el.click()); await waitForQaIdle(p);
  await p.locator('.plm-tabs').getByRole('button', { name: /^Attestation/ }).click();
}
async function details(tr = false) {
  await page.getByLabel(tr ? 'Kampanya ara' : 'Search campaigns', { exact: true }).fill(name);
  await page.getByRole('button', { name: `${tr ? 'Kampanyayı incele' : 'Review campaign'}: ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: tr ? 'Kampanya sonuçları ve kapanış' : 'Campaign outcomes and closure', exact: true });
  await expect(dialog.locator('.pcw-facts')).toBeVisible(); return dialog;
}
async function respond(p, email, accepted) {
  const row = p.locator('.plm-table tbody tr').filter({ hasText: name }).filter({ hasText: email });
  await row.getByRole('button', { name: accepted ? 'Accept' : 'Decline', exact: true }).click();
  const dialog = p.getByRole('dialog', { name: accepted ? 'OKUDUM VE KABUL EDİYORUM' : 'KABUL ETMİYORUM', exact: true });
  await dialog.getByLabel('Decision / action note', { exact: true }).fill(accepted ? 'Read the issued policy and accept the obligations.' : 'Cannot accept this policy until the scope question is resolved.');
  await dialog.getByLabel(/^Exact confirmation:/).fill(accepted ? 'OKUDUM VE KABUL EDİYORUM' : 'KABUL ETMİYORUM');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(dialog).toBeHidden(); await waitForQaIdle(p);
}
async function draft(dialog, tr = false) {
  await dialog.getByRole('button', { name: tr ? 'Kapanışı hazırla' : 'Prepare closure', exact: true }).click();
  await dialog.getByLabel(tr ? 'Kapanış gerekçesi' : 'Closure reason', { exact: true }).fill('Collection is complete; declined and unanswered responses remain explicit for separate follow-up.');
  for (const input of await dialog.getByRole('checkbox').all()) await input.check();
}
async function submit(dialog, status) {
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/policy-lifecycle' && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'close-campaign');
  await dialog.getByRole('button', { name: 'Close campaign', exact: true }).click(); const response = await pending; assert.equal(response.status(), status, await response.text()); return response.json();
}
try {
  await mkdir(out, { recursive: true });
  for (const [ctx, email] of [[admin, owner], [reviewer, f.reviewerEmail], [viewer, f.viewerEmail], [scoped, f.scopedEmail]]) await api(ctx, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  policyId = (await api(admin, '/api/policy-lifecycle', 'POST', { action: 'save-policy', code: `QA-PCC-${Date.now()}`, title: name, category: 'security', classification: 'internal', owner, reviewer: f.reviewerEmail, audience: 'Synthetic policy participants', reviewFrequencyDays: 365 })).id;
  versionId = (await api(admin, '/api/policy-lifecycle', 'POST', { action: 'create-version', policyId, summary: 'Policy used to verify campaign collection and closure.', content: 'This policy defines mandatory governance obligations, participant acknowledgement and an accountable process for exceptions and unresolved questions.', effectiveDate: today, regulationRefs: ['QA-POLICY-CAMPAIGN'], controlRefs: [], riskRefs: [] })).id;
  const evidence = { note: 'Independent policy content and publication reviewed.', evidenceReference: 'QA-POLICY-CONTENT', evidenceSha256: 'a'.repeat(64) };
  for (const [ctx, operation, confirmation] of [[admin, 'submit', 'İNCELEMEYE GÖNDER'], [reviewer, 'approve', 'POLİTİKAYI ONAYLA'], [reviewer, 'publish', 'POLİTİKAYI YAYINLA']]) await api(ctx, '/api/policy-lifecycle', 'POST', { action: 'version-action', versionId, operation, confirmation, ...evidence });

  phase = 'actual campaign creation and response'; await open(page);
  await page.locator('.plm-float').getByRole('button', { name: '+ Campaign', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Attestation campaign', exact: true });
  await dialog.locator('select').selectOption(policyId); await dialog.getByLabel('Campaign name', { exact: true }).fill(name); await dialog.getByLabel('Due date', { exact: true }).fill(future); await dialog.getByLabel('Subject emails (line or comma)', { exact: true }).fill([owner, f.reviewerEmail, f.viewerEmail].join('\n'));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toBeHidden(); await waitForQaIdle(page);
  const payload = await api(admin, '/api/policy-lifecycle'); campaignId = payload.campaigns.find(c => c.name === name)?.id; assert.ok(campaignId);
  await respond(page, owner, true); dialog = await details();
  await dialog.locator('summary').click(); await expect(dialog).toContainText('participant acknowledgement');
  assert.equal((await state()).campaign.attestedCount, 1); assert.equal((await state()).campaign.pendingCount, 2);
  await api(anonymous, `/api/policy-lifecycle?view=campaign&campaignId=${campaignId}`, 'GET', undefined, 401);
  for (const ctx of [viewer, scoped]) { await api(ctx, `/api/policy-lifecycle?view=campaign&campaignId=${campaignId}`, 'GET', undefined, 403); await api(ctx, '/api/policy-lifecycle', 'POST', { action: 'close-campaign', campaignId }, 403); }
  checks.push('Actual UI campaign creation and assigned acceptance; pinned content and exact counts; anonymous, Viewer and scoped access denials');

  phase = 'real concurrent response and recovery'; await draft(dialog); await open(peer); await respond(peer, f.reviewerEmail, false);
  await submit(dialog, 409); await expect(dialog.getByLabel('Closure reason', { exact: true })).toHaveValue(/Collection is complete/);
  await dialog.getByRole('button', { name: 'Refresh results', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Use current results', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close campaign', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Use current results', exact: true }).click(); for (const input of await dialog.getByRole('checkbox').all()) await expect(input).not.toBeChecked();
  await page.route(url => url.pathname === '/api/policy-lifecycle', async route => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).searchParams.get('view') === 'campaign' && readFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'close-campaign' && dropResponse) { dropResponse = false; const response = await route.fetch(); assert.equal(response.status(), 200); return route.abort('failed'); }
    return route.continue();
  });
  readFailure = true; await dialog.getByRole('button', { name: 'Refresh results', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('could not be loaded'); await expect(dialog.getByLabel('Closure reason', { exact: true })).toHaveValue(/Collection is complete/);
  readFailure = false; await dialog.getByRole('button', { name: 'Refresh results', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveCount(0);
  checks.push('Concurrent actual decline rejects old outcomes; explicit result adoption resets acknowledgements; source failures retain the closure reason');

  phase = 'bilingual responsive and keyboard'; await dialog.getByRole('button', { name: 'Cancel draft', exact: true }).click(); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  for (const lang of ['EN', 'TR']) for (const theme of ['light', 'dark']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').evaluate(el => el.click());
    dialog = await details(lang === 'TR'); await draft(dialog, lang === 'TR');
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await dialog.evaluate(el => { el.scrollTop = 0; });
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      const axe = await new AxeBuilder({ page }).include('.pcw-dialog').withTags(['wcag2a', 'wcag2aa']).analyze(); assert.deepEqual(axe.violations, []);
      await dialog.screenshot({ path: `${out}/${lang}-${theme}-${width}.png` });
    }
    const first = dialog.getByRole('button', { name: lang === 'TR' ? 'Kapat' : 'Close', exact: true }), last = dialog.getByRole('button', { name: lang === 'TR' ? 'Kampanyayı kapat' : 'Close campaign', exact: true });
    await last.focus(); await page.keyboard.press('Tab'); await expect(first).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(page.getByRole('button', { name: `${lang === 'TR' ? 'Kampanyayı incele' : 'Review campaign'}: ${name}`, exact: true })).toBeFocused(); await page.setViewportSize({ width: 1440, height: 1000 });
  }
  checks.push('12 TR/EN light/dark desktop/tablet/mobile views, zero Axe violations or overflow; Tab/Shift+Tab, Escape and opener focus verified');

  phase = 'uncertain write, replay and retained outcome'; await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click(); dialog = await details(); await draft(dialog); dropResponse = true;
  await dialog.getByRole('button', { name: 'Close campaign', exact: true }).click(); await expect(dialog).toContainText('The outcome could not be confirmed');
  const committed = await state(); assert.equal(committed.campaign.status, 'closed'); assert.deepEqual(committed.closure.counts, { attested: 1, declined: 1, pending: 1, total: 3 });
  assert.equal((await submit(dialog, 200)).replay, true); await expect(dialog.locator('.pcw-history')).toContainText('1 unanswered');
  assert.deepEqual((await state()).closure, committed.closure); await dialog.screenshot({ path: `${out}/closed-history.png` }); await page.keyboard.press('Escape'); await waitForQaIdle(page);
  await page.getByLabel('Campaign status', { exact: true }).selectOption('closed'); await expect(page.locator('.pcw-cards')).toContainText(name);
  await open(reader); await expect(reader.locator('.pcw-list')).toHaveCount(0);
  const ownRow = reader.locator('.plm-table tbody tr').filter({ hasText: name }); await expect(ownRow).toContainText('Campaign closed'); await expect(ownRow.getByRole('button')).toHaveCount(0);
  const viewerState = await api(viewer, '/api/policy-lifecycle'), pending = viewerState.attestations.find(a => a.campaignId === campaignId); assert.equal(pending.status, 'pending');
  await api(viewer, '/api/policy-lifecycle', 'POST', { action: 'attest', attestationId: pending.id, decision: 'attested', note: 'This late answer must be rejected.', confirmation: 'OKUDUM VE KABUL EDİYORUM' }, 409);
  await reader.locator('nav button[aria-label="My Work"]').evaluate(el => el.click()); await waitForQaIdle(reader);
  await reader.getByRole('textbox', { name: 'Search work', exact: true }).fill(name); await expect(reader.locator('.mw2-item')).toHaveCount(0);
  await api(reviewer, '/api/policy-lifecycle', 'POST', { action: 'retire-policy', policyId, confirmation: 'POLİTİKAYI YÜRÜRLÜKTEN KALDIR', ...evidence });
  assert.equal((await state()).closure.contentSha256, committed.closure.contentSha256);
  checks.push('Committed closure survives a dropped response and identical retry; exact outcomes and version remain historical; pending Viewer has no active action/work; policy retirement succeeds after closure');
  assert.deepEqual(errors, []); await writeFile(`${out}/result.json`, JSON.stringify({ status: 'PASS', checks, errors, policyId, versionId, campaignId, cleanup: 'Owned campaign closed and policy retired; synthetic decision history retained only in disposable loopback QA.' }, null, 2)); console.log('POLICY_CAMPAIGN_COMPLETION_QA_PASS');
} catch (error) { await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); await writeFile(`${out}/failure.json`, JSON.stringify({ phase, error: String(error), checks, errors }, null, 2)); throw error; }
finally { await Promise.all([admin, reviewer, viewer, scoped, anonymous].map(c => c.close())); await browser.close(); }
