import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';
const base = 'http://127.0.0.1:4173', out = 'connected-workbench-qa-artifacts';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await createQaContext(browser, base, {}, { viewport: { width: 1640, height: 1050 } }), page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = []; page.on('pageerror', e => errors.push(e.message)); let phase = 'bootstrap';
const account = { action: 'bootstrap', email: 'qa-admin@fornost.test', name: 'Connected QA', password: qaPassword() };
async function api(method, path, data, status = 200) { const r = await context.request.fetch(base + path, { method, headers: { origin: base }, data }); assert.equal(r.status(), status, await r.text()); return r.json(); }
const create = async (module, data) => (await api('POST', '/api/grc', { module, data }, 201)).id;
const nav = label => page.locator('.cg-tabs').getByRole('button', { name: label, exact: true });
const workspace = page.locator('.connected-grc'), work = page.locator('#connected-grc-workbench');
const choose = async title => {
  await work.getByRole('button',{name:'Kayıt seç',exact:true}).click();
  await work.locator('.cgw-records').getByRole('button').filter({hasText:title}).click();
};
const dismissDetails=()=>page.getByRole('button',{name:'Ayrıntıları kapat',exact:true}).click();
const screens = [];
async function capture(name) { await workspace.screenshot({ path: `${out}/${name}.png` }); screens.push(name); }
try {
  const auth = await api('GET', '/api/auth');
  await api('POST', '/api/auth', {...account,action:auth.bootstrapRequired?'bootstrap':'login'});
  phase = 'empty workspace'; await page.goto(base); await page.locator('.shell').waitFor({state:'visible'}); await page.locator('nav button[aria-label="Bağlantılı GRC Haritası"]').evaluate(b => b.click()); await waitForQaIdle(page); await expect(work).toContainText('Eşleşen kayıt yok'); await capture('empty');
  phase = 'seed owned examples';
  const asset = await create('Varlık Envanteri', { title: 'Cortex XDR', assetType: 'Yazılım', businessUnit: 'Bilgi Teknolojileri', owner: account.email, criticality: 'Yüksek', status: 'Aktif' });
  const bia = await create('BIA', { process: 'Kimlik ve erişim yönetimi', processCategory: 'Operasyonel Süreç', businessUnit: 'Bilgi Teknolojileri', owner: account.email, criticality: 'Yüksek', asset, rto: '4 saat', rpo: '1 saat', status: 'Aktif' });
  const control = await create('Kontroller', { controlRef: 'MFA-QA', controlTitle: 'Ayrıcalıklı erişim MFA', owner: account.email, frequency: 'Aylık', implementation: 'Uygulanıyor', status: 'Aktif', processLink: bia });
  const risk = await create('Risk Assessment', { title: 'Ayrıcalıklı hesaplarda MFA eksikliği', owner: account.email, asset, existingControls: control, status: 'Değerlendiriliyor' });
  await create('Kanıtlar', { evidenceTitle: 'MFA yapılandırma kanıtı', owner: account.email, controlRef: control, period: '2026', status: 'Süresi Doldu', expiresAt: '2026-11-10' });
  await workspace.getByRole('button', { name: 'Yenile', exact: true }).click(); await waitForQaIdle(page); await expect(workspace.locator('.cm-health button')).toHaveCount(4);
  await workspace.locator('[data-metric="links"]').click(); await expect(work.locator('tbody tr')).toHaveCount(5);
  await workspace.locator('[data-metric="hubs"]').click(); await expect(work.locator('.cgw-records>button')).toHaveCount(1);
  await workspace.locator('[data-metric="all"]').click(); await expect(work.locator('.cm-lane')).toHaveCount(5);
  await work.getByRole('button',{name:'Odak Kayıt',exact:true}).click();
  await expect(work.locator('.cm-drawer')).toHaveCount(0);
  const center=work.locator('.cm-node[data-root=true]');
  await expect(center).toContainText('Ayrıcalıklı erişim MFA');
  await expect(work.locator('.cm-lane')).toHaveCount(3);
  const canvas=await work.locator('.cm-scroll').boundingBox(), hub=await center.boundingBox();
  assert.ok(Math.abs(hub.x+hub.width/2-canvas.x-canvas.width/2)<12 && Math.abs(hub.y+hub.height/2-canvas.y-canvas.height/2)<12,'The hub is centered in the viewport');
  assert.ok(canvas.height>=1050*.75-1 && hub.width>=210);
  await expect(work.locator('.cm-wire-pill')).toHaveCount(0);
  await work.locator('.cm-node').filter({hasText:'MFA yapılandırma kanıtı'}).hover();
  await expect(work.locator('.cm-wire-pill')).toContainText('Kanıtlar');
  await expect(work.locator('.cm-node').filter({hasText:'Ayrıcalıklı hesaplarda MFA eksikliği'})).toHaveCSS('opacity','0.25');
  await center.click(); await expect(work.locator('.cm-drawer')).toBeVisible();await page.keyboard.press('Escape');
  await expect(work.locator('.cm-drawer')).toHaveCount(0);
  await choose('Ayrıcalıklı hesaplarda MFA eksikliği');await dismissDetails();
  const incoming=work.locator('.cm-node[data-lane="0"]');
  await expect(incoming).toHaveCount(2);
  await expect(incoming.filter({hasText:'Ayrıcalıklı erişim MFA'})).toBeVisible();
  await expect(incoming.filter({hasText:'MFA yapılandırma kanıtı'})).toBeVisible();
  await expect(work.locator('.cm-node[data-lane="2"]')).toContainText('Cortex XDR');
  await capture('diagram-TR-light-1640');
  phase='diagram list impact';
  await work.getByRole('button',{name:'Liste',exact:true}).click();await expect(work.locator('tbody tr')).toHaveCount(2);
  await work.locator('tbody').getByRole('button').filter({hasText:'Cortex XDR'}).click();
  await expect(work.locator('.cm-drawer')).toContainText('Cortex XDR');await dismissDetails();
  await nav('Etki analizi').click();await expect(work.locator('tbody tr')).toHaveCount(4);
  await work.locator('tbody').getByRole('button').filter({hasText:'Kimlik ve erişim yönetimi'}).click();
  await expect(work.locator('.cgw-inspector')).toContainText('4 saat');await capture('bia-impact-TR-light-1640');
  phase = 'UI link and unlink'; await nav('Bağlantılar').click(); await choose('Ayrıcalıklı hesaplarda MFA eksikliği'); await work.locator('.cm-inspector').getByRole('button', { name: 'Bağlantı ekle', exact: true }).click(); const editor = page.locator('.cgw-editor'); await editor.getByLabel('Hedef modül').selectOption('BIA'); await editor.getByLabel('İlişki türü').selectOption('processLink:BIA'); await editor.getByRole('combobox',{name:'Hedef kayıt',exact:true}).fill('Kimlik'); await editor.getByRole('option').filter({hasText:'Kimlik ve erişim yönetimi'}).click(); await editor.getByLabel('İşlem notu').fill('QA: doğrulanmış BIA bağlantısı'); await editor.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true }).click(); await expect(editor).toContainText('Bağlantı kaydedildi'); let records = (await api('GET', '/api/grc')).rows; assert.equal(JSON.parse(records.find(r => r.id === risk).data_json).processLink, bia);
  await editor.getByRole('button', { name: 'Listeyi yenile ve kapat' }).click(); await expect(editor).toHaveCount(0); await waitForQaIdle(page); await work.locator('.cm-inspector').getByRole('button',{name:'Bağlantıyı kaldır · Kimlik ve erişim yönetimi',exact:true}).click(); await expect(work.locator('.cm-inspector')).toContainText('Bağlantı kaldırıldı'); records = (await api('GET', '/api/grc')).rows; assert.equal(JSON.parse(records.find(r => r.id === risk).data_json).processLink, ''); assert.ok(records.some(r => r.id === bia)); assert.equal((await api('GET', '/api/connected-grc/links?sourceId=' + risk)).events.length, 2);
  phase = 'failed write requires inspection, not automatic retry'; await work.locator('.cm-inspector').getByRole('button', { name: 'Bağlantı ekle', exact: true }).click(); await editor.getByLabel('Hedef modül').selectOption('BIA'); await editor.getByLabel('İlişki türü').selectOption('processLink:BIA'); await editor.getByRole('combobox',{name:'Hedef kayıt',exact:true}).fill('Kimlik'); await editor.getByRole('option').filter({hasText:'Kimlik ve erişim yönetimi'}).click(); await editor.getByLabel('İşlem notu').fill('QA: bağlantı hata denemesi'); await page.route('**/api/connected-grc/links', route => route.request().method() === 'POST' ? route.abort() : route.continue()); await editor.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true }).click(); await expect(editor).toContainText('İşlemin sonucu doğrulanamadı'); await expect(editor.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true })).toBeDisabled(); await page.unroute('**/api/connected-grc/links'); await editor.getByRole('button', { name: 'Kapat', exact: true }).click();
  phase = 'gap work and filters'; await dismissDetails(); await page.locator('.cg-tabs').getByRole('button', { name: /^Eksikler/ }).click(); await expect(work).toContainText('Kanıtın süresi geçti'); await work.getByLabel('Eksik ara').fill('nonexistent-qa-value'); await expect(work).toContainText('Filtreyle eşleşen takip konusu yok'); await work.getByRole('button', { name: 'Filtreleri temizle' }).click(); await work.locator('tbody tr').filter({hasText:'Süreklilik planı bağlantısı yok'}).getByRole('button',{name:'+ Bağla',exact:true}).click(); await expect(editor).toContainText('Bağlamak planı onaylamaz'); await capture('plan-editor-TR-light-1640'); await editor.getByRole('button', { name: 'Kapat', exact: true }).click();
  phase = 'inline gap resolution and audit trail';
  await create('Uyum',{framework:'QA framework',controlTitle:'QA framework clause',controlRef:'QA-CLAUSE',status:'Kısmi Uyumlu',owner:account.email});
  await workspace.getByRole('button',{name:'Yenile',exact:true}).click();
  await waitForQaIdle(page);
  const controlGap=work.locator('tbody tr').filter({hasText:'Ayrıcalıklı erişim MFA'}).filter({hasText:'Eksik bağlantı'});
  await controlGap.getByRole('button',{name:'+ Bağla',exact:true}).click();
  await expect(editor.getByLabel('Hedef modül')).toHaveValue('Uyum');
  await editor.getByRole('combobox',{name:'Hedef kayıt',exact:true}).fill('QA framework clause');
  await editor.getByRole('option').filter({hasText:'QA framework clause'}).click();
  await editor.getByLabel('İşlem notu').fill('QA mapped requirement reference');
  await editor.getByRole('button',{name:'Bağlantıyı kaydet',exact:true}).click();
  await expect(editor).toContainText('Bağlantı kaydedildi');
  await editor.getByRole('button',{name:'Kapat',exact:true}).click();
  await expect(controlGap).toHaveCount(0);
  const history=(await api('GET','/api/connected-grc/links?sourceId='+control)).events;
  assert.equal(history[0].field,'mapContext:requirement-map');
  phase = 'assurance coverage';
  await nav('Güvence').click();
  await expect(page.locator('.cm-assurance tbody tr')).toHaveCount(2);
  await expect(page.locator('.assurance-work-queue')).toHaveCount(0);
  await page.getByRole('button',{name:'Güvence işlerini aç',exact:true}).click();
  await expect(page.locator('.assurance-work-queue').getByRole('searchbox')).toBeVisible();
  await page.getByRole('button',{name:'← Güvence ve Kanıt Kapsamı',exact:true}).click();
  await page.locator('.cm-assurance select').selectOption('approved');
  await expect(page.locator('.cm-assurance tbody tr')).toHaveCount(0);
  await page.locator('.cm-assurance select').selectOption('missing');
  await expect(page.locator('.cm-assurance tbody tr')).toHaveCount(2);
  await page.locator('.cg-tabs').getByRole('button',{name:/^Eksikler/}).click();
  phase = 'partial source state'; await page.route('**/api/continuity', route => route.fulfill({ status: 503, json: { error: 'Synthetic source failure' } })); await workspace.getByRole('button', { name: 'Yenile', exact: true }).click(); await expect(work).toContainText('Kaynaklar eksik'); await page.unroute('**/api/continuity'); await workspace.getByRole('button', { name: 'Tekrar dene', exact: true }).click(); await waitForQaIdle(page); await expect(work.locator('.cgw-warning')).toHaveCount(0);
  phase = 'bilingual responsive and theme layouts';
  for (const lang of ['TR', 'EN']) for (const theme of ['light', 'dark']) for (const width of [1640, 390]) {
    await page.setViewportSize({ width, height: 1050 }); await page.locator('.language-switch:visible').getByRole('button', { name: lang, exact: true }).click();
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
    for (const [key, title] of [['connections', lang === 'TR' ? 'Bağlantılar' : 'Connections'], ['impact', lang === 'TR' ? 'Etki analizi' : 'Impact analysis'], ['gaps', lang === 'TR' ? /^Eksikler/ : /^Gaps/],['assurance', lang === 'TR' ? 'Güvence' : 'Assurance']]) {
      await page.locator('.cg-tabs').getByRole('button', { name: title, exact: typeof title === 'string' }).click(); await waitForQaIdle(page);
      if(key==='connections'){
        if(await work.locator('.cm-tools-toggle').isVisible())await work.locator('.cm-tools-toggle').click();
        await work.getByRole('button',{name:lang==='TR'?'Genel Ağ (Tümü)':'Full network (All)',exact:true}).click();
        await expect(work.locator('.cm-lane')).toHaveCount(5);
        const toolbar=await work.locator('.cg-tabs button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().y));
        assert.equal(new Set(toolbar).size,1,'Tabs stay on one row');
        await expect(work.locator('.cm-drawer')).toHaveCount(0);
        await page.locator('.cg-heading').hover();
        await expect(work.locator('.cm-wire-pill')).toHaveCount(0);
        const allCanvas=await work.locator('.cm-scroll').boundingBox();
        assert.ok(allCanvas.height>=1050*.75-1 && allCanvas.width>=(await work.boundingBox()).width-4);
        await capture('all-'+lang+'-'+theme+'-'+width);
        if(await work.locator('.cm-tools-toggle').isVisible())await work.locator('.cm-tools-toggle').click();
        await work.getByRole('button',{name:lang==='TR'?'Odak Kayıt':'Focus record',exact:true}).click();
        const card=work.locator('.cm-node[data-root=true]');await expect(card).toBeVisible();
        await expect.poll(async()=>{const r=await card.boundingBox(),v=await work.locator('.cm-scroll').boundingBox();
          return Math.max(Math.abs(r.x+r.width/2-v.x-v.width/2),Math.abs(r.y+r.height/2-v.y-v.height/2));}).toBeLessThan(12);
        await card.click();await expect(work.locator('dialog.cm-drawer')).toBeVisible();await page.keyboard.press('Escape');
        await page.locator('.cg-heading').hover();await card.blur();
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `overflow ${key}/${lang}/${theme}/${width}`);
      if (width === 1640 && ['gaps','impact'].includes(key)) { const aside = work.locator('.cgw-inspector'); assert.ok(await aside.evaluate(e => e.getBoundingClientRect().height < 1400), 'Inspector must fit content, not inherit the shell sidebar height'); }
      await capture(`${key}-${lang}-${theme}-${width}`);
    }
  }
  assert.deepEqual(errors, []); await writeFile(out + '/report.json', JSON.stringify({ result: 'passed', layouts: 32, checks: ['empty state', 'diagram/list and impact paths', 'RTO display', 'UI link/unlink and persisted history', 'uncertain write blocks replay', 'gap search and reset', 'partial source retry', 'TR/EN light/dark desktop/mobile'], screens, errors }, null, 2)); console.log('CONNECTED_WORKBENCH_QA_PASS');
} catch (error) { await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {}); await writeFile(out + '/failure.json', JSON.stringify({ phase, error: error.message, errors }, null, 2)); throw error; }
finally { await browser.close(); }
