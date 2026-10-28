import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

const base = 'http://127.0.0.1:4173', out = 'policy-campaign-issuance-qa-artifacts';
const f = JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const contexts = await Promise.all(Array.from({ length: 6 }, () => createQaContext(browser, base, {}, { viewport: { width: 1440, height: 1000 } })));
const [admin, reviewer, viewer, scoped, editor, anonymous] = contexts, page = await admin.newPage(), reader = await viewer.newPage();
const owner = 'qa-admin@fornost.test', tag = Date.now(), name = `QA campaign issuance ${tag}`, editorEmail = `qa-campaign-editor-${tag}@fornost.test`;
const future = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10), checks = [], errors = [];
let phase = 'setup', policyId, versionId, campaignId, editorId, library, createRequest, failPeople = false, failPreview = false, dropResponse = false;
for (const p of [page, reader]) { p.setDefaultTimeout(20000); p.on('pageerror', e => errors.push(e.message)); }
async function api(ctx, path, method = 'GET', data, status = 200) { const r = await ctx.request.fetch(base + path, { method, data, headers: { origin: base } }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json(); }
const state = () => api(admin, `/api/policy-lifecycle?view=campaign&campaignId=${campaignId}`);
async function open() { await page.goto(base); await expect(page.locator('.shell')).toBeVisible(); await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click(); await page.locator('nav button[aria-label="Policy Center"]').evaluate(el => el.click()); await waitForQaIdle(page); await page.locator('.plm-tabs').getByRole('button', { name: /^Attestation/ }).click(); }
async function choose(d, email, tr = false) { await d.getByLabel(tr ? 'Katılımcı ara' : 'Search participants', { exact: true }).fill(email); const choice = d.locator('.pci-choices label').filter({ hasText: email }); await expect(choice).toHaveCount(1); await choice.getByRole('checkbox').check(); }
async function draft(tr = false) {
  await page.locator('.plm-float').getByRole('button', { name: tr ? '+ Kampanya' : '+ Campaign', exact: true }).click();
  const d = page.getByRole('dialog', { name: tr ? 'Attestation kampanyası' : 'Attestation campaign', exact: true });
  await d.getByLabel(tr ? 'Yayındaki politika' : 'Published policy', { exact: true }).selectOption(policyId); await d.getByLabel(tr ? 'Kampanya adı' : 'Campaign name', { exact: true }).fill(name); await d.getByLabel(tr ? 'Son tarih' : 'Due date', { exact: true }).fill(future(30));
  for (const email of [f.viewerEmail, f.reviewerEmail, editorEmail]) await choose(d, email, tr);
  return d;
}
async function preview(d, tr = false) { await d.getByRole('button', { name: tr ? 'Kampanyayı önizle' : 'Preview campaign', exact: true }).click(); await expect(d.getByRole('region', { name: tr ? 'Kampanya önizlemesi' : 'Campaign preview', exact: true })).toBeVisible(); await expect(d).toBeFocused(); }
async function submit(d, status) { const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/policy-lifecycle' && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'create-campaign'); await d.getByRole('button', { name: 'Create campaign', exact: true }).click(); const r = await pending; assert.equal(r.status(), status, await r.text()); return r.json(); }
async function inspect(d, label) {
  await d.evaluate(el => { el.scrollTop = 0; });
  assert.equal(await d.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
  const rect = await d.boundingBox(), size = page.viewportSize(); assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= size.width + 1 && rect.y + rect.height <= size.height + 1, `${label}: dialog outside viewport`);
  const axe = await new AxeBuilder({ page }).include('.pci-dialog').withTags(['wcag2a', 'wcag2aa']).analyze(); assert.deepEqual(axe.violations, []);
  await d.screenshot({ path: `${out}/${label}.png` });
}
try {
  await mkdir(out, { recursive: true });
  for (const [ctx, email] of [[admin, owner], [reviewer, f.reviewerEmail], [viewer, f.viewerEmail], [scoped, f.scopedEmail]]) await api(ctx, '/api/auth', 'POST', { action: 'login', email, password: qaPassword() });
  await api(admin, '/api/users', 'POST', { name: 'Campaign QA Editor', email: editorEmail, password: qaPassword(), role: 'Editor', moduleAccess: { mode: 'full' } }, 201);
  const users = (await api(admin, '/api/users')).users; editorId = users.find(u => u.email === editorEmail).id;
  await api(editor, '/api/auth', 'POST', { action: 'login', email: editorEmail, password: qaPassword() });
  const upload = await admin.request.post(base + '/api/evidence', { headers: { origin: base }, multipart: { evidenceTitle: `Campaign publication proof ${tag}`, owner, period: '2026-Q4', controlRef: 'A.5.30', status: 'İncelemede', file: { name: 'campaign-proof.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic independent campaign publication evidence') } } });
  assert.equal(upload.status(), 201, await upload.text()); const evidenceId = (await upload.json()).id;
  library = { evidenceMode: 'library', evidenceSelection: { evidenceId, versionId: (await api(admin, `/api/evidence/history?id=${evidenceId}`)).versions[0].id } };
  policyId = (await api(admin, '/api/policy-lifecycle', 'POST', { action: 'save-policy', assignmentMode: 'directory', code: `QA-PCI-${tag}`, title: name, category: 'security', classification: 'internal', owner, reviewer: f.reviewerEmail, audience: 'Explicit selected participants', reviewFrequencyDays: 365 })).id;
  const content = 'EXACT CAMPAIGN POLICY. Every assigned participant must inspect this published version before responding. Account access, information protection and the evidence retention responsibilities apply to each explicitly selected person.';
  versionId = (await api(admin, '/api/policy-lifecycle', 'POST', { action: 'create-version', policyId, summary: 'Exact published content reviewed before campaign issuance.', content, effectiveDate: future(0), regulationRefs: ['ISO-27001'] })).id;
  for (const [ctx, operation, confirmation] of [[admin, 'submit', 'İNCELEMEYE GÖNDER'], [reviewer, 'approve', 'POLİTİKAYI ONAYLA'], [reviewer, 'publish', 'POLİTİKAYI YAYINLA']]) {
    const source = await api(ctx, `/api/policy-lifecycle?view=decision&kind=version&id=${versionId}`);
    await api(ctx, '/api/policy-lifecycle', 'POST', { action: 'version-action', versionId, operation, confirmation, note: 'Independent publication verification for campaign issuance.', decisionMode: 'reviewed', expectedRevision: source.revision, ...library });
  }
  const request = { policyId, name, audience: 'Explicit selected participants', dueDate: future(30), subjectIds: [editorId] };
  await api(anonymous, '/api/policy-lifecycle?view=campaign-people', 'GET', undefined, 401);
  for (const ctx of [viewer, scoped, editor]) {
    await api(ctx, '/api/policy-lifecycle?view=campaign-people', 'GET', undefined, 403);
    await api(ctx, '/api/policy-lifecycle', 'POST', { action: 'preview-campaign', ...request }, 403);
    await api(ctx, '/api/policy-lifecycle', 'POST', { action: 'create-campaign', issueMode: 'directory-reviewed', ...request }, 403);
  }
  checks.push('Actual sessions deny anonymous, Viewer, full-access Editor and scoped campaign authoring');
  await page.route(url => url.pathname === '/api/policy-lifecycle', async route => {
    const req = route.request();
    if (req.method() === 'GET' && new URL(req.url()).searchParams.get('view') === 'campaign-people' && failPeople) return route.fulfill({ status: 503, json: {} });
    if (req.method() === 'POST' && req.postDataJSON()?.action === 'preview-campaign' && failPreview) return route.fulfill({ status: 503, json: {} });
    if (req.method() === 'POST' && req.postDataJSON()?.action === 'create-campaign') { createRequest = req.postDataJSON(); if (dropResponse) { dropResponse = false; const r = await route.fetch(); assert.equal(r.status(), 200, await r.text()); return route.abort('failed'); } }
    return route.continue();
  });
  phase = 'selection and failed directory'; await open(); let d = await draft();
  await d.getByRole('button', { name: `Remove: ${f.viewerEmail}`, exact: true }).click(); await expect(d.getByRole('region', { name: 'Selected participants', exact: true })).not.toContainText(f.viewerEmail); await choose(d, f.viewerEmail);
  await d.getByLabel('Search participants', { exact: true }).fill(f.scopedEmail); await expect(d).toContainText('No eligible people on this page.');
  failPeople = true; await d.getByLabel('Search participants', { exact: true }).fill('failed-directory'); await expect(d.getByRole('alert')).toContainText('People could not be read'); await expect(d.getByRole('region', { name: 'Selected participants', exact: true })).toContainText(editorEmail); await expect(d.getByRole('button', { name: 'Preview campaign', exact: true })).toBeDisabled();
  failPeople = false; await d.getByRole('button', { name: 'Refresh people', exact: true }).click(); await expect(d.getByRole('alert')).toHaveCount(0); await preview(d); await expect(d).toContainText(content);
  let all = await api(admin, '/api/policy-lifecycle'); assert.equal(all.campaigns.filter(c => c.name === name).length, 0);
  checks.push('Explicit directory selection supports Viewer, add/remove, scoped exclusion, retained choices across search/failure; preview writes no campaign');

  phase = 'source revision and failed preview'; const policy = all.documents.find(p => p.id === policyId);
  await api(admin, '/api/policy-lifecycle', 'POST', { ...policy, action: 'save-policy', assignmentMode: 'directory', policyId, title: `${name} updated` });
  await d.getByRole('checkbox').check(); await submit(d, 409); await expect(d.getByRole('button', { name: 'Create campaign', exact: true })).toBeDisabled(); await expect(d).toContainText(editorEmail);
  failPreview = true; await d.getByRole('button', { name: 'Refresh preview', exact: true }).click(); await expect(d.getByRole('alert')).toContainText('preview could not be read'); await expect(d).toContainText(content);
  failPreview = false; await d.getByRole('button', { name: 'Refresh preview', exact: true }).click(); await expect(d.getByRole('alert')).toHaveCount(0); await expect(d).toContainText(`${name} updated`); await expect(d.getByRole('checkbox')).not.toBeChecked();
  checks.push('Real policy edit invalidates preview; failed refresh retains context but blocks issuance; renewed confirmation required');
  await page.keyboard.press('Escape'); await expect(d).toBeHidden();

  phase = 'bilingual responsive selection and preview';
  for (const lang of ['EN', 'TR']) for (const theme of ['light', 'dark']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click(); if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').evaluate(el => el.click());
    d = await draft(lang === 'TR');
    for (const width of [1440, 1024, 390]) { await page.setViewportSize({ width, height: 1000 }); await inspect(d, `${lang}-${theme}-${width}-selection`); }
    await preview(d, lang === 'TR');
    for (const width of [1440, 1024, 390]) { await page.setViewportSize({ width, height: 1000 }); await inspect(d, `${lang}-${theme}-${width}-preview`); }
    const first = d.getByRole('button', { name: lang === 'TR' ? 'Kapat' : 'Close', exact: true }), last = d.getByRole('button', { name: lang === 'TR' ? 'Seçimi düzenle' : 'Edit selection', exact: true });
    await first.click({ trial: true }); await last.focus(); await page.keyboard.press('Tab'); await expect(first).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused(); await page.keyboard.press('Escape'); await expect(d).toBeHidden(); await expect(page.locator('.plm-float').getByRole('button', { name: lang === 'TR' ? '+ Kampanya' : '+ Campaign', exact: true })).toBeFocused(); await page.setViewportSize({ width: 1440, height: 1000 });
  }
  checks.push('24 selection/preview views across TR/EN, light/dark and desktop/tablet/mobile; zero Axe violations/overflow/clipping; keyboard trap, Escape and opener focus');

  phase = 'recipient disabled after preview'; await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click(); d = await draft(); await preview(d);
  await api(admin, '/api/users', 'PATCH', { id: editorId, role: 'Editor', status: 'Disabled', moduleAccess: { mode: 'full' } }); await d.getByRole('checkbox').check(); await submit(d, 409); await expect(d.getByRole('alert').filter({ hasText: 'Check these selections' })).toContainText(editorEmail);
  await d.getByRole('button', { name: 'Edit selection', exact: true }).click(); await expect(d.getByRole('region', { name: 'Selected participants', exact: true })).toContainText(editorEmail); await d.getByRole('button', { name: `Remove: ${editorEmail}`, exact: true }).click(); await d.getByLabel('Search participants', { exact: true }).fill(''); await d.getByLabel('Search participants', { exact: true }).fill(editorEmail); await expect(d).toContainText('No eligible people on this page.'); await choose(d, owner); await preview(d); await d.getByRole('checkbox').check();
  checks.push('Real account disable rejects the whole issue, identifies the account, retains choices and excludes it from new directory results');

  phase = 'lost create response and exact retry'; dropResponse = true; await d.getByRole('button', { name: 'Create campaign', exact: true }).click(); await expect(d).toContainText('The outcome could not be confirmed'); await expect(d.getByRole('button', { name: 'Edit selection', exact: true })).toBeDisabled(); await expect(d.getByRole('button', { name: 'Refresh preview', exact: true })).toBeDisabled();
  const issued = await submit(d, 200); assert.equal(issued.replay, true); campaignId = issued.id; await expect(d).toContainText('Campaign created.');
  all = await api(admin, '/api/policy-lifecycle'); assert.equal(all.campaigns.filter(c => c.name === name).length, 1); assert.equal(all.attestations.filter(a => a.campaignId === campaignId).length, 3);
  await d.getByRole('button', { name: 'Open campaign', exact: true }).click(); d = page.getByRole('dialog', { name: 'Campaign outcomes and closure', exact: true }); await expect(d.locator('.pcw-facts')).toBeVisible(); await expect(d).toContainText('Campaign opened by'); await expect(d).toContainText(owner);
  let current = await state(); assert.equal(current.campaign.createdBy, owner); assert.equal(current.campaign.pendingCount, 3); assert.equal(current.version.id, versionId); await d.screenshot({ path: `${out}/created-outcomes.png` });
  checks.push('Dropped successful create response retries the same campaign ID; exactly three canonical assignments and direct outcomes navigation with creator provenance');

  phase = 'assigned Viewer My Work response'; await reader.goto(base); await expect(reader.locator('.shell')).toBeVisible(); await reader.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click(); await reader.locator('nav button[aria-label="My Work"]').evaluate(el => el.click()); await waitForQaIdle(reader); await reader.locator('.my-work-v2').getByRole('button', { name: 'Refresh', exact: true }).click(); await waitForQaIdle(reader); await reader.getByLabel('Work queue module', { exact: true }).selectOption('Politika Merkezi'); await reader.locator('.mw2-filters').getByRole('button', { name: /^All/ }).click(); await reader.getByRole('textbox', { name: 'Search work', exact: true }).fill(name);
  const task = reader.locator('.mw2-item').filter({ hasText: 'Policy attestation' }).filter({ hasText: f.viewerEmail }); await expect(task).toHaveCount(1); await task.focus(); await reader.keyboard.press('Enter'); await waitForQaIdle(reader);
  await reader.locator('.plm-table tbody tr').filter({ hasText: name }).filter({ hasText: f.viewerEmail }).getByRole('button', { name: 'Accept', exact: true }).click(); const responseDialog = reader.getByRole('dialog', { name: 'Policy response', exact: true }); await expect(responseDialog).toContainText(content); await responseDialog.getByLabel('Decision / action note', { exact: true }).fill('I reviewed the exact assigned policy and accept the responsibilities.'); await responseDialog.getByRole('checkbox').check(); await responseDialog.getByRole('button', { name: 'Record response', exact: true }).click(); await expect(responseDialog.getByRole('region', { name: 'Recorded response', exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Refresh results', exact: true }).click(); current = await state(); assert.equal(current.campaign.attestedCount, 1); assert.equal(current.campaign.pendingCount, 2);
  checks.push('Issued Viewer task opens from My Work by keyboard, shows exact policy, records acceptance and updates canonical campaign outcomes');

  phase = 'closed and retired replay'; await api(admin, '/api/policy-lifecycle', 'POST', { action: 'close-campaign', campaignId, expectedRevision: current.revision, requestId: `PCC-${crypto.randomUUID()}`, note: 'Synthetic campaign verification complete with remaining responses explicitly outstanding.', confirmation: 'CLOSE CAMPAIGN', acknowledgeOutstanding: true });
  const source = await api(reviewer, `/api/policy-lifecycle?view=decision&kind=retire&id=${policyId}`); await api(reviewer, '/api/policy-lifecycle', 'POST', { action: 'retire-policy', policyId, confirmation: 'POLİTİKAYI YÜRÜRLÜKTEN KALDIR', decisionMode: 'reviewed', expectedRevision: source.revision, note: 'Synthetic policy campaign issuance verification complete.', ...library });
  assert.equal((await api(admin, '/api/policy-lifecycle', 'POST', createRequest)).replay, true); await api(admin, '/api/policy-lifecycle', 'POST', { ...createRequest, name: `${name} changed` }, 409); assert.equal((await state()).campaign.status, 'closed');
  checks.push('Identical issuance replay remains safe after closure/retirement; altered reuse conflicts and cannot reopen campaign');
  assert.deepEqual(errors, []); await writeFile(`${out}/result.json`, JSON.stringify({ status: 'PASS', checks, errors, policyId, versionId, campaignId, cleanup: 'Owned campaign closed, policy retired and dedicated Editor disabled in disposable loopback QA.' }, null, 2)); console.log('POLICY_CAMPAIGN_ISSUANCE_QA_PASS');
} catch (error) { await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); await writeFile(`${out}/failure.json`, JSON.stringify({ phase, error: String(error), checks, errors }, null, 2)); throw error; }
finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
