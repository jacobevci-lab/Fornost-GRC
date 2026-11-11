import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';
const base = 'http://127.0.0.1:4173', out = 'connected-workbench-qa-artifacts';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await createQaContext(browser, base, {}, { viewport: { width: 1640, height: 1050 } }), page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = []; page.on('pageerror', e => errors.push(e.message)); let phase = 'bootstrap';
const account = { action: 'bootstrap', email: 'qa-connected@fornost.test', name: 'Connected QA', password: randomBytes(24).toString('base64url') + 'aA1!' };
async function api(method, path, data, status = 200) { const r = await context.request.fetch(base + path, { method, headers: { origin: base }, data }); assert.equal(r.status(), status, await r.text()); return r.json(); }
const create = async (module, data) => (await api('POST', '/api/grc', { module, data }, 201)).id;
const nav = label => page.locator('.cg-tabs').getByRole('button', { name: label, exact: true });
const workspace = page.locator('.connected-grc'), work = page.locator('.cgw');
const choose = title => page.locator('.cgw-records').getByRole('button').filter({ hasText: title }).click();
const screens = [];
async function capture(name) { await workspace.screenshot({ path: `${out}/${name}.png` }); screens.push(name); }
try {
  assert.equal((await api('GET', '/api/auth')).bootstrapRequired, true, 'Use a fresh isolated runtime');
  await api('POST', '/api/auth', account);
  phase = 'empty workspace'; await page.goto(base); await expect(page.locator('.shell')).toBeVisible(); await page.locator('nav button[aria-label="Bağlantılı GRC Haritası"]').evaluate(b => b.click()); await waitForQaIdle(page); await expect(work).toContainText('Eşleşen kayıt yok'); await capture('empty');
  phase = 'seed owned examples';
  const asset = await create('Varlık Envanteri', { title: 'Cortex XDR', assetType: 'Yazılım', businessUnit: 'Bilgi Teknolojileri', owner: account.email, criticality: 'Yüksek', status: 'Aktif' });
  const bia = await create('BIA', { process: 'Kimlik ve erişim yönetimi', processCategory: 'Operasyonel Süreç', businessUnit: 'Bilgi Teknolojileri', owner: account.email, criticality: 'Yüksek', asset, rto: '4 saat', rpo: '1 saat', status: 'Aktif' });
  const control = await create('Kontroller', { controlRef: 'MFA-QA', controlTitle: 'Ayrıcalıklı erişim MFA', owner: account.email, frequency: 'Aylık', implementation: 'Uygulanıyor', status: 'Aktif', processLink: bia });
  const risk = await create('Risk Assessment', { title: 'Ayrıcalıklı hesaplarda MFA eksikliği', owner: account.email, asset, existingControls: control, status: 'Değerlendiriliyor' });
  await create('Kanıtlar', { evidenceTitle: 'MFA yapılandırma kanıtı', owner: account.email, controlRef: control, period: '2026', status: 'Süresi Doldu', expiresAt: '2026-11-10' });
  await workspace.getByRole('button', { name: 'Yenile', exact: true }).click(); await waitForQaIdle(page); await choose('Cortex XDR'); await work.getByLabel('Bağlantı derinliği').selectOption('3'); await expect(work.locator('.cgw-node')).toHaveCount(5); await capture('connections-TR-light-1640');
  phase = 'diagram list impact'; await work.getByRole('button', { name: 'Liste', exact: true }).click(); await expect(work.locator('tbody tr')).toHaveCount(4); await work.locator('tbody').getByRole('button').filter({ hasText: 'MFA yapılandırma kanıtı' }).click(); await expect(work.locator('.cgw-inspector')).toContainText('Kanıtın süresi geçti'); await nav('Etki analizi').click(); await expect(work.locator('tbody tr')).toHaveCount(4); await work.locator('tbody').getByRole('button').filter({ hasText: 'Kimlik ve erişim yönetimi' }).click(); await expect(work.locator('.cgw-inspector')).toContainText('4 saat'); await capture('impact-TR-light-1640');
  phase = 'UI link and unlink'; await nav('Bağlantılar').click(); await choose('Ayrıcalıklı hesaplarda MFA eksikliği'); await work.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click(); const editor = page.locator('.cgw-editor'); await editor.getByLabel('İlişki türü').selectOption('processLink'); await editor.getByLabel('Hedef kayıt', { exact: true }).selectOption(bia); await editor.getByLabel('İşlem notu').fill('QA: doğrulanmış BIA bağlantısı'); await editor.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true }).click(); await expect(editor).toContainText('Bağlantı kaydedildi'); let records = (await api('GET', '/api/grc')).rows; assert.equal(JSON.parse(records.find(r => r.id === risk).data_json).processLink, bia);
  await editor.getByRole('button', { name: 'Listeyi yenile ve kapat' }).click(); await waitForQaIdle(page); await work.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click(); await editor.getByLabel('İlişki türü').selectOption('processLink'); await editor.getByLabel('İşlem notu').fill('QA: geçici bağlantıyı kaldır'); await editor.getByRole('button', { name: 'Bağlantıyı kaldır', exact: true }).click(); await expect(editor).toContainText('Bağlantı kaydedildi'); records = (await api('GET', '/api/grc')).rows; assert.equal(JSON.parse(records.find(r => r.id === risk).data_json).processLink, ''); assert.ok(records.some(r => r.id === bia)); assert.equal((await api('GET', '/api/connected-grc/links?sourceId=' + risk)).events.length, 2); await editor.getByRole('button', { name: 'Kapat', exact: true }).click();
  phase = 'failed write requires inspection, not automatic retry'; await work.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click(); await editor.getByLabel('İlişki türü').selectOption('processLink'); await editor.getByLabel('Hedef kayıt', { exact: true }).selectOption(bia); await editor.getByLabel('İşlem notu').fill('QA: bağlantı hata denemesi'); await page.route('**/api/connected-grc/links', route => route.request().method() === 'POST' ? route.abort() : route.continue()); await editor.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true }).click(); await expect(editor).toContainText('İşlemin sonucu doğrulanamadı'); await expect(editor.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true })).toBeDisabled(); await page.unroute('**/api/connected-grc/links'); await editor.getByRole('button', { name: 'Kapat', exact: true }).click();
  phase = 'gap work and filters'; await page.locator('.cg-tabs').getByRole('button', { name: /^Eksikler/ }).click(); await expect(work).toContainText('Kanıtın süresi geçti'); await work.getByLabel('Eksik ara').fill('nonexistent-qa-value'); await expect(work).toContainText('Filtreyle eşleşen takip konusu yok'); await work.getByRole('button', { name: 'Filtreleri temizle' }).click(); await work.locator('tbody').getByRole('button').filter({ hasText: 'Kimlik ve erişim yönetimi' }).click(); await work.getByRole('button', { name: 'Plan bağla', exact: true }).click(); await expect(editor).toContainText('Bağlamak planı onaylamaz'); await capture('gaps-TR-light-1640'); await editor.getByRole('button', { name: 'Kapat', exact: true }).click();
  phase = 'partial source state'; await page.route('**/api/continuity', route => route.fulfill({ status: 503, json: { error: 'Synthetic source failure' } })); await workspace.getByRole('button', { name: 'Yenile', exact: true }).click(); await expect(work).toContainText('Kaynaklar eksik'); await page.unroute('**/api/continuity'); await workspace.getByRole('button', { name: 'Tekrar dene', exact: true }).click(); await waitForQaIdle(page); await expect(work.locator('.cgw-warning')).toHaveCount(0);
  phase = 'bilingual responsive and theme layouts';
  for (const lang of ['TR', 'EN']) for (const theme of ['light', 'dark']) for (const width of [1640, 390]) {
    await page.setViewportSize({ width, height: 1050 }); await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
    for (const [key, title] of [['connections', lang === 'TR' ? 'Bağlantılar' : 'Connections'], ['impact', lang === 'TR' ? 'Etki analizi' : 'Impact analysis'], ['gaps', lang === 'TR' ? /^Eksikler/ : /^Gaps/]]) {
      await page.locator('.cg-tabs').getByRole('button', { name: title, exact: typeof title === 'string' }).click(); await waitForQaIdle(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `overflow ${key}/${lang}/${theme}/${width}`);
      if (width === 1640) { const aside = work.locator('.cgw-inspector'); assert.ok(await aside.evaluate(e => e.getBoundingClientRect().height < 1400), 'Inspector must fit content, not inherit the shell sidebar height'); }
      await capture(`${key}-${lang}-${theme}-${width}`);
    }
  }
  assert.deepEqual(errors, []); await writeFile(out + '/report.json', JSON.stringify({ result: 'passed', layouts: 24, checks: ['empty state', 'diagram/list and impact paths', 'RTO display', 'UI link/unlink and persisted history', 'uncertain write blocks replay', 'gap search and reset', 'partial source retry', 'TR/EN light/dark desktop/mobile'], screens, errors }, null, 2)); console.log('CONNECTED_WORKBENCH_QA_PASS');
} catch (error) { await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {}); await writeFile(out + '/failure.json', JSON.stringify({ phase, error: error.message, errors }, null, 2)); throw error; }
finally { await browser.close(); }
