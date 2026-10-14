import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import JSZip from 'jszip';

// Disposable loopback runtime, authenticated real uploads and byte-for-byte downloads.
const base = process.env.FORNOST_QA_BASE_URL || 'http://127.0.0.1:4173';
assert.equal(new URL(base).hostname, '127.0.0.1');
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const ids = [], errors = [], tag = Date.now();
let page;
async function api(path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, await response.text()); return response.json();
}
async function record(id) { return (await api('/api/grc')).rows.find(r => r.id === id); }
async function upload(file, evidenceId, status = 201, extra = {}) {
  const multipart = evidenceId ? { evidenceId, changeNote: 'QA updated document version' } : { evidenceTitle: `QA document ${tag} ${file.name}`, controlRef: 'QA-DOC-1', owner: 'qa-admin@fornost.test', period: '2026-Q4', status: 'Onaylandı', reviewStatus: 'approved' };
  const response = await context.request.post(base + (evidenceId ? '/api/evidence/history' : '/api/evidence'), { headers: { origin: base }, multipart: { ...multipart, ...extra, file } });
  assert.equal(response.status(), status, await response.text());
  const body = await response.json(); if (!evidenceId && status === 201) ids.push(body.id); return body;
}
async function office(ext) {
  const zip = new JSZip(), main = ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${ext === 'docx' ? 'wordprocessingml.document' : 'spreadsheetml.sheet'}.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`);
  zip.file(main, ext === 'docx' ? '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>' : '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
async function verifyDownload(data, file, expectedType) {
  const download = await context.request.get(base + `/api/evidence?key=${encodeURIComponent(data.fileKey)}&inline=1`);
  assert.equal(download.status(), 200); assert.equal(download.headers()['content-type'], expectedType);
  assert.match(download.headers()['content-disposition'], /^attachment;/); assert.equal(download.headers()['x-content-type-options'], 'nosniff');
  assert.deepEqual(await download.body(), file.buffer); assert.equal(data.contentSha256, createHash('sha256').update(file.buffer).digest('hex'));
}
try {
  await api('/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() });
  const types = { csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', log: 'text/plain', json: 'application/json', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  for (const [ext, type] of Object.entries(types)) {
    const file = { name: `evidence.${ext}`, mimeType: 'application/octet-stream', buffer: ['docx', 'xlsx'].includes(ext) ? await office(ext) : Buffer.from(ext === 'json' ? '{"kontrol":"erişim","value":0}' : 'kontrol\tdeğer\nA.5.18,İncelemede') };
    const created = await upload(file, undefined, 201, { fileKey: 'evidence/forged', fileType: 'text/html', fileSize: '0', contentSha256: 'forged', demoImage: '/forged.svg' });
    let data = JSON.parse((await record(created.id)).data_json);
    assert.equal(data.fileType, type); assert.equal(data.fileSize, String(file.buffer.length)); assert.equal(data.demoImage, undefined); assert.notEqual(data.fileKey, 'evidence/forged');
    await verifyDownload(data, file, type);
    const initialKey = data.fileKey;
    await upload(file, created.id);
    data = JSON.parse((await record(created.id)).data_json);
    assert.equal(data.status, 'İncelemede'); assert.equal(data.reviewStatus, 'pending-review'); assert.equal(data.versionNo, '2');
    await verifyDownload(data, file, type);
    const chain = await api(`/api/evidence/history?id=${created.id}`);
    assert.equal(chain.integrity.state, 'verified'); assert.equal(chain.versions.length, 2);
    assert.ok(chain.versions.some(v => v.fileKey === initialKey));
  }
  const baseline = (await api('/api/grc')).rows.length;
  for (const file of [
    { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') },
    { name: 'binary.csv', mimeType: 'text/csv', buffer: Buffer.from([0xff, 0x00]) },
    { name: 'fake.docx', mimeType: types.docx, buffer: Buffer.from('PK\x03\x04garbage') },
    { name: 'script.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
  ]) { await upload(file, undefined, 400); await upload(file, ids[0], 400); }
  assert.equal((await api('/api/grc')).rows.length, baseline);
  assert.equal((await api(`/api/evidence/history?id=${ids[0]}`)).versions.length, 2);
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('nav button[aria-label="Evidence Library"]').evaluate(el => el.click());
  await page.locator('.actions .primary').click(); const dialog = page.locator('.modal[role=dialog]');
  await expect(dialog.locator('input[type=file]')).toHaveAttribute('accept', /\.docx,\.xlsx/);
  await dialog.locator('input[type=file]').setInputFiles({ name: 'ui-access.csv', mimeType: 'text/csv', buffer: Buffer.from('account,reviewed\nqa,true') });
  for (const [field, value] of Object.entries({ evidenceTitle: `QA UI CSV ${tag}`, controlRef: 'QA-DOC-1', owner: 'qa-admin@fornost.test', period: '2026-Q4' })) await dialog.locator(`[name=${field}]`).fill(value);
  const savedResponse = page.waitForResponse(r => r.url().endsWith('/api/evidence') && r.request().method() === 'POST');
  await dialog.locator('.form-actions .primary').click(); const saved = await savedResponse; assert.equal(saved.status(), 201, await saved.text());
  const uiId = (await saved.json()).id; ids.push(uiId); await expect(dialog).toBeHidden();
  const savedRow = await record(uiId);
  const row = page.locator('tr').filter({ has: page.getByRole('button', { name: savedRow.record_code, exact: true }) });
  await row.getByRole('button', { name: savedRow.record_code, exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Evidence preview', exact: true });
  await expect(preview).toContainText('This file is available to download'); assert.equal(await preview.locator('img,iframe').count(), 0);
  await expect(preview.getByRole('link', { name: 'Download original', exact: true })).toHaveAttribute('href', /\/api\/evidence\?key=/);
  await page.keyboard.press('Escape'); await expect(preview).toBeHidden();
  await page.locator('nav button[aria-label="Evidence Automation"]').evaluate(el => el.click());
  await page.locator('.ea-tabs').getByRole('button', { name: 'Evidence History', exact: true }).click();
  const form = page.locator('.eh-version-form'); await form.locator('select').selectOption(uiId);
  await form.locator('input[type=file]').setInputFiles({ name: 'ui-version.xlsx', mimeType: types.xlsx, buffer: await office('xlsx') });
  await form.locator('[name=changeNote]').fill('Updated spreadsheet evidence for review');
  let release, submissions = 0; const barrier = new Promise(resolve => { release = resolve; });
  await page.route('**/api/evidence/history', async route => {
    if (route.request().method() === 'POST') { submissions++; const response = await route.fetch(); await barrier; await route.fulfill({ response }); } else await route.continue();
  });
  const submit = form.getByRole('button', { name: 'Save New Version', exact: true });
  await submit.click(); await expect(submit).toBeDisabled(); await expect(form.locator('select')).toBeDisabled();
  await form.dispatchEvent('submit'); await expect.poll(() => submissions).toBe(1); release();
  await expect(submit).toBeEnabled(); await page.unroute('**/api/evidence/history');
  assert.equal((await api(`/api/evidence/history?id=${uiId}`)).versions.length, 2);
  await mkdir('qa-artifacts/evidence-formats', { recursive: true });
  for (const language of ['TR', 'EN']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: language, exact: true }).click();
    for (const theme of ['light', 'dark']) for (const width of [390, 1536]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme); await page.setViewportSize({ width, height: 960 });
      assert.ok(await form.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await form.screenshot({ path: `qa-artifacts/evidence-formats/${language}-${theme}-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log('EVIDENCE_DOCUMENT_FORMATS_QA_PASS: seven formats on both upload routes, canonical MIME/hash, byte-preserving downloads, rejected-file atomicity, approval reset, UI upload/preview/version, duplicate guard and responsive themes');
} catch (error) {
  await mkdir('qa-artifacts/evidence-formats', { recursive: true });
  if (page) await page.screenshot({ path: 'qa-artifacts/evidence-formats/failure.png', fullPage: true });
  throw error;
} finally {
  for (const id of ids) { const r = await context.request.delete(base + `/api/grc?id=${id}`, { headers: { origin: base } }); assert.ok([200, 409].includes(r.status())); }
  await browser.close();
}
