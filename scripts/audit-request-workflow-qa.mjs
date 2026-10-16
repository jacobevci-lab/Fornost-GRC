import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Isolated local runtime only: no external mail or customer data.
const base = process.env.FORNOST_QA_BASE_URL || 'http://127.0.0.1:4173';
assert.equal(new URL(base).hostname, '127.0.0.1', 'This QA only runs on an isolated loopback runtime');
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const admin = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const owner = await browser.newContext(), reviewer = await browser.newContext();
const tag = Date.now(), ownerEmail = `audit-owner-${tag}@fornost.test`, reviewerEmail = `audit-reviewer-${tag}@fornost.test`;
const errors = [], accountIds = [];
let auditId, evidenceId;
async function api(context, path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, await response.text()); return response.json();
}
async function openAudit(context, name) {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="Audit Management"]').evaluate(el => el.click());
  await page.locator('.audit-card-open').filter({ hasText: name }).click();
  await expect(page.locator('.audit-request-panel').getByRole('button', { name: 'Reload', exact: true })).toBeEnabled();
  return page;
}
try {
  await api(admin, '/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() });
  for (const [email, name] of [[ownerEmail, 'QA Request Owner'], [reviewerEmail, 'QA Request Reviewer']]) await api(admin, '/api/users', 'POST', { email, name, role: 'Editor', password: qaPassword() }, 201);
  accountIds.push(...(await api(admin, '/api/users')).users.filter(u => [ownerEmail, reviewerEmail].includes(u.email)).map(u => u.id));
  await api(owner, '/api/auth', 'POST', { action: 'login', email: ownerEmail, password: qaPassword() });
  await api(reviewer, '/api/auth', 'POST', { action: 'login', email: reviewerEmail, password: qaPassword() });
  const name = `QA Request Workflow ${tag}`;
  auditId = (await api(admin, '/api/audits', 'POST', { name, template: 'Özel Denetim', auditOwner: ownerEmail, auditor: reviewerEmail }, 201)).id;
  const upload = await owner.request.post(base + '/api/evidence', { headers: { origin: base }, multipart: {
    evidenceTitle: `QA Access Evidence ${tag}`, owner: ownerEmail, period: 'Q3 2026', controlRef: 'QA-AC-1', status: 'İncelemede',
    file: { name: 'access.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX8AAAAASUVORK5CYII=', 'base64') },
  } }); assert.equal(upload.status(), 201, await upload.text()); evidenceId = (await upload.json()).id;
  const version = (await api(owner, `/api/evidence/history?id=${evidenceId}`)).versions[0];
  const page = await openAudit(admin, name), panel = page.locator('.audit-request-panel');
  await panel.getByRole('button', { name: '+ Add request', exact: true }).click();
  await panel.getByLabel('Title', { exact: true }).fill('Q3 privileged access review');
  await panel.getByLabel('Requested content and acceptance criteria', { exact: true }).fill('All privileged accounts, scope and reviewer sign-off.');
  await panel.getByLabel('Owner', { exact: true }).selectOption(ownerEmail); await panel.getByLabel('Reviewer', { exact: true }).selectOption(reviewerEmail);
  await panel.getByRole('button', { name: 'Save request', exact: true }).click(); await expect(panel.locator('.ar-state')).toHaveText('Draft');
  let state = await api(admin, `/api/audits/requests?auditId=${auditId}`), request = state.requests[0];
  assert.ok(!(await api(admin, '/api/audits/requests')).requests.some(r => r.id === request.id));
  await panel.getByRole('button', { name: 'Preview launch', exact: true }).click();
  await panel.getByLabel('Time zone (IANA)', { exact: true }).fill('Europe/Istanbul');
  await panel.getByRole('button', { name: 'Start work plan', exact: true }).click(); await expect(panel.locator('.ar-state')).toHaveText('Awaiting submission');
  await api(admin, '/api/audits/requests', 'POST', { auditId, action: 'start', expectedRevision: '', expectedPlanRevision: '', timeZone: 'Europe/Istanbul' }, 409);
  const ownerPage = await openAudit(owner, name), ownerPanel = ownerPage.locator('.audit-request-panel');
  await ownerPanel.getByRole('button', { name: request.title, exact: true }).click();
  await ownerPanel.locator('.ar-evidence-choices label').filter({ hasText: `QA Access Evidence ${tag}` }).getByRole('checkbox').check();
  let release, submits = 0; const barrier = new Promise(resolve => { release = resolve; });
  await ownerPage.route('**/api/audits/requests', async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'submit') { submits++; const response = await route.fetch(); await barrier; await route.fulfill({ response }); } else await route.continue();
  });
  const submit = ownerPanel.getByRole('button', { name: 'Submit for review', exact: true });
  await submit.click(); await expect(submit).toBeDisabled(); await expect.poll(() => submits).toBe(1); release();
  await expect(ownerPanel.locator('.ar-state')).toHaveText('Awaiting review'); await ownerPage.unroute('**/api/audits/requests');
  state = await api(owner, `/api/audits/requests?auditId=${auditId}`); request = state.requests[0];
  await api(owner, '/api/audits/requests', 'POST', { auditId, action: 'accept', requestId: request.id, expectedRevision: request.revision, note: 'Self approval denied' }, 403);
  const reviewerPage = await openAudit(reviewer, name), reviewPanel = reviewerPage.locator('.audit-request-panel');
  await reviewPanel.getByRole('button', { name: request.title, exact: true }).click();
  await reviewPanel.getByLabel('Decision / cancellation reason', { exact: true }).fill('Please include the missing approval reference.');
  // Focus navigation must initialize the return dates too.
  await reviewPanel.getByLabel('New delivery due', { exact: true }).fill(request.dueDate); await reviewPanel.getByLabel('New review due', { exact: true }).fill(request.reviewDueDate);
  await reviewPanel.getByRole('button', { name: 'Request changes', exact: true }).click(); await expect(reviewPanel.locator('.ar-state')).toHaveText('Changes requested');
  request = (await api(owner, `/api/audits/requests?auditId=${auditId}`)).requests[0];
  await api(owner, '/api/audits/requests', 'POST', { auditId, action: 'submit', requestId: request.id, expectedRevision: request.revision, versionIds: [version.id] });
  await reviewPanel.getByRole('button', { name: 'Reload', exact: true }).click(); await expect(reviewPanel.locator('.ar-state')).toHaveText('Awaiting review');
  await reviewPanel.getByLabel('Decision / cancellation reason', { exact: true }).fill('Reviewed evidence meets the stated acceptance criteria.');
  await reviewPanel.getByRole('button', { name: 'Accept', exact: true }).click(); await expect(reviewPanel.locator('.ar-state')).toHaveText('Accepted');
  await expect(reviewPanel.locator('.ar-progress h4')).toHaveText('No outstanding requests');
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`); assert.equal(state.requests[0].evidence[0].id, version.id); assert.equal(state.events.filter(e => e.action === 'accept').length, 1);
  // Updating the library file must not alter the version accepted by the independent reviewer.
  const replacement = await owner.request.post(base + '/api/evidence/history', { headers: { origin: base }, multipart: {
    evidenceId, changeNote: 'Updated CSV account inventory for the next review', file: { name: 'access-v2.csv', mimeType: 'text/csv', buffer: Buffer.from('account,reviewed\nservice-account,true') },
  } }); assert.equal(replacement.status(), 201, await replacement.text());
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`);
  assert.equal(state.requests[0].status, 'accepted'); assert.equal(state.requests[0].evidence[0].id, version.id);
  assert.equal(state.requests[0].evidence[0].contentSha256, version.contentSha256);
  const library = JSON.parse((await api(admin, '/api/grc')).rows.find(row => row.id === evidenceId).data_json);
  assert.equal(library.status, 'İncelemede'); assert.equal(library.reviewStatus, 'pending-review'); assert.equal(library.versionNo, '2');
  const pinnedDownload = await owner.request.get(base + `/api/evidence?key=${encodeURIComponent(version.fileKey)}`);
  assert.equal(pinnedDownload.status(), 200); assert.equal(pinnedDownload.headers()['content-type'], 'image/png');
  // Additional scope is a silent draft until a reasoned, version-bound preview is activated.
  await panel.getByRole('button', { name: 'Reload', exact: true }).click();
  await panel.getByRole('button', { name: '+ Add request', exact: true }).click();
  await panel.getByLabel('Title', { exact: true }).fill('Additional privileged service accounts');
  await panel.getByLabel('Requested content and acceptance criteria', { exact: true }).fill('Include service account ownership and approval records.');
  await panel.getByLabel('Owner', { exact: true }).selectOption(ownerEmail); await panel.getByLabel('Reviewer', { exact: true }).selectOption(reviewerEmail);
  await panel.getByRole('button', { name: 'Save request', exact: true }).click();
  await expect(panel.locator('.ar-state.draft')).toHaveText('Draft');
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`);
  let addition = state.requests.find(r => r.status === 'draft');
  await expect(panel.locator('.ar-progress h4')).toHaveText('Outstanding requests');
  await panel.getByRole('button', { name: /^Show outstanding requests/ }).click();
  await expect(panel.locator('.ar-table tbody tr')).toHaveCount(1);
  await expect(panel.locator('.ar-table')).toContainText(addition.title);
  await expect(panel.locator('.ar-table')).not.toContainText(request.title);
  await panel.locator('.ar-filters select').selectOption('all');

  assert.ok(!(await api(admin, '/api/audits/requests')).requests.some(r => r.id === addition.id));
  await panel.getByRole('button', { name: 'Review additions', exact: true }).click();
  const activate = panel.getByRole('button', { name: 'Activate additional requests', exact: true });
  await expect(activate).toBeDisabled(); await expect(panel.locator('.ar-preview-list')).toContainText(addition.title);
  await panel.getByLabel('Reason for additional requests', { exact: true }).fill('Service accounts were added to the agreed audit scope.');
  await api(admin, '/api/audits/requests', 'POST', { auditId, action: 'edit', requestId: addition.id, expectedRevision: addition.revision, fields: { ...addition, instructions: 'Include service account ownership, approvals and expiry dates.' } });
  await activate.click(); await expect(panel.getByRole('alert')).toContainText('Draft requests changed'); await expect(activate).toBeDisabled();
  await panel.getByRole('button', { name: 'Reload', exact: true }).click();
  await panel.getByRole('button', { name: 'Review additions', exact: true }).click();
  await panel.locator('.ar-preview-list summary').click(); await expect(panel.locator('.ar-preview-list')).toContainText('expiry dates');
  const reason = 'Service accounts were added to the agreed audit scope.';
  await panel.getByLabel('Reason for additional requests', { exact: true }).fill(reason);
  await mkdir('audit-request-qa-artifacts', { recursive: true });
  for (const width of [390, 1536]) {
    await page.setViewportSize({ width, height: 960 }); assert.ok(await panel.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
    await panel.screenshot({ path: `audit-request-qa-artifacts/additions-preview-${width}.png` });
  }
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`);
  const oldActivation = { auditId, action: 'activate', expectedRevision: state.workflow.revision, expectedPlanRevision: state.planRevision, expectedDrafts: state.requests.filter(r => r.status === 'draft').map(({ id, revision }) => ({ id, revision })), note: reason };
  await activate.click(); await expect(panel.locator('.ar-state.assigned')).toHaveText('Awaiting submission');
  await expect(panel.locator('.ar-state.accepted')).toHaveText('Accepted');
  await api(admin, '/api/audits/requests', 'POST', oldActivation, 409);
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`); addition = state.requests.find(r => r.id === addition.id);
  assert.equal(state.events.filter(e => e.request_id === addition.id && e.action === 'activate').length, 1);
  assert.equal(state.events.find(e => e.request_id === addition.id && e.action === 'activate').activationReason, reason);
  assert.ok((await api(owner, '/api/audits/requests')).requests.some(r => r.id === addition.id && r.status === 'assigned'));
  await api(admin, '/api/audits/requests', 'POST', { auditId, action: 'edit', requestId: addition.id, expectedRevision: addition.revision, fields: { ...addition, dueDate: '2020-01-01', reviewDueDate: '2020-01-02' } });
  await panel.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(panel.locator('.ar-summary').getByRole('button', { name: 'Overdue: 1', exact: true })).toBeVisible();
  await panel.locator('.ar-summary').getByRole('button', { name: 'Overdue: 1', exact: true }).click();
  await expect(panel.locator('.ar-table tbody tr')).toHaveCount(1);
  await panel.locator('.ar-filters select').selectOption('all');
  await panel.getByRole('button', { name: addition.title, exact: true }).click();
  await panel.locator('.ar-detail summary').click(); await expect(panel.locator('.ar-detail')).toContainText(reason);
  // Completed work belongs to the owner; organization scope is Admin-only.
  await page.locator('nav button[aria-label="My Work"]').evaluate(el => el.click());
  await page.locator('.mw2-scope button').filter({ hasText: /Organization|Kurum/ }).click();
  await page.locator('.mw2-filters button').filter({ hasText: /Completed|Tamamlanan/ }).click();
  await page.locator('.mw2-item').filter({ hasText: request.title }).click(); await expect(page.locator('.ar-detail')).toContainText(request.id);
  await mkdir('audit-request-qa-artifacts', { recursive: true });
  for (const language of ['EN', 'TR']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: language, exact: true }).click();
    for (const theme of ['light', 'dark']) for (const width of [390, 1536]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme); await page.setViewportSize({ width, height: 960 });
      assert.ok(await panel.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      await panel.screenshot({ path: `audit-request-qa-artifacts/${language}-${theme}-${width}.png` });
    }
  }
  // Work-plan closure: preview blockers, stale plan recovery, immutable decision snapshots and reopening.
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.setViewportSize({ width: 1536, height: 960 });
  const workplan = panel.locator('.ar-workplan');
  await workplan.getByRole('button', { name: 'Preview closure', exact: true }).click();
  await expect(workplan.getByRole('button', { name: 'Close work plan', exact: true })).toBeDisabled();
  await expect(workplan.locator('.ar-closure-preview')).toContainText('Resolve all requests before closing');
  await workplan.locator('.ar-closure-preview').getByRole('button', { name: 'Cancel', exact: true }).click();
  await panel.getByRole('button', { name: addition.title, exact: true }).click();
  await expect(panel.locator('.ar-detail>header small')).toHaveText(addition.id);
  const cancelReason = 'Additional scope was withdrawn by the audit owner.';
  const cancelInput = panel.getByLabel('Decision / cancellation reason', { exact: true });
  const cancelRequest = panel.getByRole('button', { name: 'Cancel request', exact: true });
  await expect(cancelRequest).toBeDisabled();
  await expect(cancelInput).toHaveValue('');
  // Exercise keyboard input and confirm React has retained the complete decision
  // before attempting a mutation; never force a disabled action or retry a write.
  await cancelInput.fill(cancelReason);
  await expect(cancelInput).toHaveValue(cancelReason);
  await expect(cancelRequest).toBeEnabled();
  // Several authenticated pages participate in this flow. Explicitly focus the
  // acting page before keyboard deletion, and verify the input itself changed.
  await page.bringToFront();
  await cancelInput.click();await cancelInput.press('Control+A');await cancelInput.press('Backspace');
  await expect(cancelInput).toHaveValue('');await expect(cancelRequest).toBeDisabled();
  await cancelInput.pressSequentially(cancelReason);
  await expect(cancelInput).toHaveValue(cancelReason);
  await expect(cancelRequest).toBeEnabled();
  const cancellation = page.waitForResponse(response => response.url().endsWith('/api/audits/requests') && response.request().method() === 'POST');
  await cancelRequest.click();
  assert.equal((await cancellation).status(), 200);
  await expect(panel.locator('.ar-state.cancelled')).toHaveText('Cancelled');
  const cancelled = await api(admin, `/api/audits/requests?auditId=${auditId}`);
  assert.equal(cancelled.events.find(event => event.request_id === addition.id && event.action === 'cancel').note, cancelReason);
  let savedPlan = await api(admin, `/api/audits/plan?id=${auditId}`);
  savedPlan = await api(admin, '/api/audits/plan', 'PUT', { id: auditId, expectedRevision: savedPlan.revision, plan: { ...savedPlan.plan, scope: 'QA scope reviewed before closure' } });
  await workplan.getByRole('button', { name: 'Preview closure', exact: true }).click();
  await expect(workplan.locator('.ar-closure-preview')).toContainText('1 accepted');
  savedPlan = await api(admin, '/api/audits/plan', 'PUT', { id: auditId, expectedRevision: savedPlan.revision, plan: { ...savedPlan.plan, scope: 'QA final scope after concurrent plan update' } });
  const closeReason = 'Every requested item has a recorded acceptance or cancellation decision.';
  await workplan.getByLabel('Closure / reopening reason', { exact: true }).fill(closeReason);
  await workplan.getByRole('button', { name: 'Close work plan', exact: true }).click();
  await expect(workplan.getByRole('alert')).toContainText('saved plan changed');
  await expect(workplan.getByRole('button', { name: 'Close work plan', exact: true })).toBeDisabled();
  await workplan.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(workplan.getByLabel('Closure / reopening reason', { exact: true })).toHaveValue(closeReason);
  await workplan.locator('.ar-closure-preview .ar-plan-snapshot summary').click();
  await expect(workplan.locator('.ar-closure-preview')).toContainText(savedPlan.plan.scope);
  let releaseClose, closePosts = 0; const closeBarrier = new Promise(resolve => { releaseClose = resolve; });
  await page.route('**/api/audits/requests/closure', async route => {
    if (route.request().method() === 'POST') { closePosts++; const response = await route.fetch(); await closeBarrier; await route.fulfill({ response }); } else await route.continue();
  });
  const closeButton = workplan.getByRole('button', { name: 'Close work plan', exact: true });
  await closeButton.click(); await expect(closeButton).toBeDisabled(); await closeButton.dispatchEvent('click');
  await expect.poll(() => closePosts).toBe(1); releaseClose();
  await expect(panel.locator('.ar-progress h4')).toHaveText('Work plan closed'); await page.unroute('**/api/audits/requests/closure');
  await expect(panel.getByRole('button', { name: '+ Add request', exact: true })).toHaveCount(0);
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`);
  const closureId = state.workflow.revision;
  await api(admin, '/api/audits/requests', 'POST', { auditId, action: 'create', requestId: `ARQ-closed-${tag}`, expectedRevision: '', expectedWorkflowRevision: closureId, fields: { ...addition } }, 409);
  await api(admin, '/api/audits/requests/closure', 'POST', { auditId, action: 'close', expectedRevision: closureId, note: closeReason }, 409);
  assert.ok((await api(owner, '/api/audits/requests')).requests.some(r => r.id === request.id && r.status === 'accepted'));
  await workplan.locator('.ar-closure-history > summary').click();
  await workplan.getByRole('button', { name: 'View closure record', exact: true }).click();
  await expect(workplan.locator('.ar-closure-record')).toContainText('Closure record SHA-256 verified');
  const downloadLink = workplan.getByRole('link', { name: 'Download closure record (JSON)', exact: true });
  const href = await downloadLink.getAttribute('href'), downloaded = await admin.request.get(base + href);
  assert.equal(downloaded.status(), 200); assert.equal(downloaded.headers()['x-content-type-options'], 'nosniff');
  assert.match(downloaded.headers()['content-disposition'], /^attachment;/);
  const exported = await downloaded.json(), canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value) ?? 'null';
  assert.equal(exported.sha256, createHash('sha256').update(canonical(exported.snapshot)).digest('hex'));
  assert.equal(exported.snapshot.plan.plan.scope, savedPlan.plan.scope);
  assert.equal(exported.snapshot.requests.find(r => r.id === request.id).evidence[0].id, version.id);
  assert.equal(exported.snapshot.requests.find(r => r.id === request.id).evidence[0].contentSha256, version.contentSha256);
  // Evidence restrictions also cover snapshots, previews and exports.
  const scopedEmail = `audit-closure-scoped-${tag}@fornost.test`, scoped = await browser.newContext();
  await api(admin, '/api/users', 'POST', { email: scopedEmail, name: 'QA Audit Only', role: 'Editor', password: qaPassword(), moduleAccess: { mode: 'scoped', modules: { 'Denetim Yönetimi': 'write' } } }, 201);
  accountIds.push((await api(admin, '/api/users')).users.find(u => u.email === scopedEmail).id);
  await api(scoped, '/api/auth', 'POST', { action: 'login', email: scopedEmail, password: qaPassword() });
  const redacted = await api(scoped, `/api/audits/requests/closure?auditId=${auditId}&closureId=${closureId}`);
  assert.equal(redacted.evidenceAccess, false); assert.ok(redacted.snapshot.requests.every(r => r.evidence.length === 0));
  await api(scoped, `/api/audits/requests/closure?auditId=${auditId}&preview=1`, 'GET', undefined, 403);
  await api(scoped, `/api/audits/requests/closure?auditId=${auditId}&closureId=${closureId}&download=1`, 'GET', undefined, 403);
  await api(scoped, '/api/audits/requests/closure', 'POST', { auditId, action: 'reopen', expectedRevision: closureId, note: 'Cannot reopen without evidence access.' }, 403);
  // Later plan edits preserve the archived copy, including its hash.
  await api(admin, '/api/audits/plan', 'PUT', { id: auditId, expectedRevision: savedPlan.revision, plan: { ...savedPlan.plan, scope: 'QA scope changed after closure' } });
  assert.deepEqual(await api(admin, `/api/audits/requests/closure?auditId=${auditId}&closureId=${closureId}`), exported);
  for (const language of ['EN', 'TR']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: language, exact: true }).click();
    for (const theme of ['light', 'dark']) for (const width of [390, 1536]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme); await page.setViewportSize({ width, height: 960 });
      assert.ok(await workplan.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      await workplan.screenshot({ path: `audit-request-qa-artifacts/closure-${language}-${theme}-${width}.png` });
    }
  }
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await workplan.getByRole('button', { name: 'Review reopening', exact: true }).click();
  await workplan.getByLabel('Closure / reopening reason', { exact: true }).fill('A new audit evidence request is needed for the amended scope.');
  await workplan.getByRole('button', { name: 'Reopen work plan', exact: true }).click();
  await expect(panel.locator('.ar-progress h4')).toHaveText('No outstanding requests');
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`);
  assert.equal(state.requests.find(r => r.id === request.id).status, 'accepted');
  assert.equal(state.requests.find(r => r.id === request.id).evidence[0].id, version.id);
  const newId = `ARQ-reopened-${tag}`;
  await api(admin, '/api/audits/requests', 'POST', { auditId, action: 'create', requestId: newId, expectedRevision: '', expectedWorkflowRevision: state.workflow.revision, fields: { ...addition, title: 'Post-closure additional scope' } });
  assert.ok(!(await api(owner, '/api/audits/requests')).requests.some(r => r.id === newId));
  assert.deepEqual(await api(admin, `/api/audits/requests/closure?auditId=${auditId}&closureId=${closureId}`), exported);
  const lifecycle = await api(admin, `/api/audits/requests/closure?auditId=${auditId}`);
  assert.deepEqual(lifecycle.events.map(e => e.action), ['reopen', 'close']);
  assert.deepEqual(errors, []); console.log('AUDIT_REQUEST_WORKFLOW_QA_PASS: real API lifecycle, roles, duplicate start/submission, pinned versions, reasoned additions, stale preview recovery, unchanged acceptance, outstanding/draft/overdue filters, atomic closure, saved-plan race recovery, immutable snapshots/exports, scope redaction, reopening, My Work focus, TR/EN and responsive themes');
} catch (error) {
  console.error('AUDIT_REQUEST_WORKFLOW_QA_FAILED', error.message);
  await mkdir('audit-request-qa-artifacts', { recursive: true });
  for (const context of browser.contexts()) for (const p of context.pages()) if (await p.locator('.audit-request-panel').count()) {
    const stamp=Date.now();await p.screenshot({ path: `audit-request-qa-artifacts/failure-${stamp}.png`, fullPage: true });
    await writeFile(`audit-request-qa-artifacts/failure-${stamp}.json`,JSON.stringify(await p.locator('.audit-request-panel').evaluate(panel=>({busy:panel.getAttribute('aria-busy'),selected:panel.querySelector('.ar-detail>header small')?.textContent,inputs:[...panel.querySelectorAll('textarea')].map(el=>({value:el.value,disabled:el.disabled})),buttons:[...panel.querySelectorAll('button')].map(el=>({text:el.textContent,disabled:el.disabled}))})),null,2));
  }
  throw error;
} finally {
  if (auditId) await api(admin, `/api/audits?id=${auditId}`, 'DELETE');
  // Versioned evidence can be retained by the existing reference guard; never bypass it for QA cleanup.
  if (evidenceId) { const cleanup = await admin.request.delete(base + `/api/grc?id=${evidenceId}`, { headers: { origin: base } }); assert.ok([200, 409].includes(cleanup.status())); }
  for (const id of accountIds) await api(admin, '/api/users', 'PATCH', { id, role: 'Editor', status: 'Disabled' });
  await browser.close();
}
