import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

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
  state = await api(admin, `/api/audits/requests?auditId=${auditId}`); assert.equal(state.requests[0].evidence[0].id, version.id); assert.equal(state.events.filter(e => e.action === 'accept').length, 1);
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
  await mkdir('qa-artifacts/audit-requests', { recursive: true });
  for (const width of [390, 1536]) {
    await page.setViewportSize({ width, height: 960 }); assert.ok(await panel.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
    await panel.screenshot({ path: `qa-artifacts/audit-requests/additions-preview-${width}.png` });
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
  await panel.getByRole('button', { name: addition.title, exact: true }).click();
  await panel.locator('.ar-detail summary').click(); await expect(panel.locator('.ar-detail')).toContainText(reason);
  // Completed work belongs to the owner; organization scope is Admin-only.
  await page.locator('nav button[aria-label="My Work"]').evaluate(el => el.click());
  await page.locator('.mw2-scope button').filter({ hasText: /Organization|Kurum/ }).click();
  await page.locator('.mw2-filters button').filter({ hasText: /Completed|Tamamlanan/ }).click();
  await page.locator('.mw2-item').filter({ hasText: request.title }).click(); await expect(page.locator('.ar-detail')).toContainText(request.id);
  await mkdir('qa-artifacts/audit-requests', { recursive: true });
  for (const language of ['EN', 'TR']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: language, exact: true }).click();
    for (const theme of ['light', 'dark']) for (const width of [390, 1536]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme); await page.setViewportSize({ width, height: 960 });
      assert.ok(await panel.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      await panel.screenshot({ path: `qa-artifacts/audit-requests/${language}-${theme}-${width}.png` });
    }
  }
  assert.deepEqual(errors, []); console.log('AUDIT_REQUEST_WORKFLOW_QA_PASS: real API lifecycle, roles, duplicate start/submission, pinned versions, reasoned additions, stale preview recovery, unchanged acceptance, My Work focus, TR/EN and responsive themes');
} catch (error) {
  console.error('AUDIT_REQUEST_WORKFLOW_QA_FAILED', error.message);
  await mkdir('qa-artifacts/audit-requests', { recursive: true });
  for (const context of browser.contexts()) for (const p of context.pages()) if (await p.locator('.audit-request-panel').count()) await p.screenshot({ path: `qa-artifacts/audit-requests/failure-${Date.now()}.png`, fullPage: true });
  throw error;
} finally {
  if (auditId) await api(admin, `/api/audits?id=${auditId}`, 'DELETE');
  // Versioned evidence can be retained by the existing reference guard; never bypass it for QA cleanup.
  if (evidenceId) { const cleanup = await admin.request.delete(base + `/api/grc?id=${evidenceId}`, { headers: { origin: base } }); assert.ok([200, 409].includes(cleanup.status())); }
  for (const id of accountIds) await api(admin, '/api/users', 'PATCH', { id, role: 'Editor', status: 'Disabled' });
  await browser.close();
}
