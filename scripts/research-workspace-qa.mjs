import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173', out = 'research-workspace-qa-artifacts';
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
const page = await context.newPage(), errors = [], checks = [], records = [];
page.on('pageerror', error => errors.push(error.message));
let auditId;
const stamp = Date.now(), auditName = `Access governance review ${stamp}`, controlRef = `QA-DESIGN-${stamp}`;
async function api(path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`); return response.json();
}
async function module(name) { await page.locator(`nav button[aria-label="${name}"]`).evaluate(button => button.click()); }
async function screenshot(name, locator) {
  await locator.scrollIntoViewIfNeeded();
  assert.ok(await locator.evaluate(node => node.scrollWidth <= node.clientWidth + 2), `${name}: workspace overflow`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${name}: page overflow`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); checks.push(name);
}
try {
  await mkdir(out, { recursive: true });
  await api('/api/auth', 'POST', { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() });
  auditId = (await api('/api/audits', 'POST', { name: auditName, template: 'Özel Denetim', auditOwner: 'Security Operations', auditor: 'Internal Audit' }, 201)).id;
  const initial = await api(`/api/audits/plan?id=${auditId}`);
  await api('/api/audits/plan', 'PUT', { id: auditId, expectedRevision: initial.revision, plan: { ...initial.plan,
    objective: 'Verify privileged access approvals and periodic ownership reviews.', scope: 'Production services, identity platform and administrative accounts.',
    lead: 'Internal Audit', team: 'Security Operations · Identity Engineering', periodStart: '2026-07-01', periodEnd: '2026-09-30',
    fieldworkStart: '2026-10-12', fieldworkEnd: '2026-10-23', methodology: 'Inspect current evidence and trace approval decisions to the review period.',
    deliverables: 'Review findings, action owners and a dated audit status report.' } });
  const requirementTitles = ['Privileged account ownership', 'Quarterly access approval', 'Leaver account revocation', 'Emergency access review'];
  const imported = await api('/api/grc', 'POST', { module: 'Denetim Yönetimi', rows: requirementTitles.map((title, index) => ({
    auditName, auditType: 'Internal', startDate: '2026-10-12', endDate: '2026-10-23', auditOwner: 'Security Operations', auditor: 'Internal Audit', requirementRef: `${controlRef}-${index}`,
    requirementTitle: title, requirementStatement: 'Inspect ownership, approval and period coverage.', owner: index === 3 ? 'Atanmadı' : 'Security Operations',
    status: index === 0 ? 'Tamamlandı' : index === 1 ? 'Devam Ediyor' : 'Başlanmadı', progress: index === 0 ? 100 : index === 1 ? 50 : 0,
    evidenceStatus: index > 1 ? 'Kanıt Bekleniyor' : 'Kanıt Var', businessUnit: 'Security', dueDate: '2026-10-23', controlRef,
  })) }, 201);
  void imported;
  await api('/api/grc', 'POST', { module: 'Kontroller', rows: [{ controlRef, controlTitle: 'Privileged access is reviewed every quarter', owner: 'Security Operations', frequency: 'Üç Aylık', implementation: 'Uygulanıyor', status: 'Aktif', testOwner: 'Internal Audit', nextTestDate: '2026-12-31', testResult: 'İnceleme Bekliyor' }] }, 201);
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let number = 1; number <= 2; number++) {
    const sheet = pdf.addPage([595, 842]);
    sheet.drawRectangle({ x: 0, y: 730, width: 595, height: 112, color: rgb(.04, .34, .32) });
    sheet.drawText('ACCESS GOVERNANCE', { x: 42, y: 794, size: 11, font: bold, color: rgb(1,1,1) });
    sheet.drawText('Quarterly review evidence', { x: 42, y: 758, size: 24, font: bold, color: rgb(1,1,1) });
    sheet.drawText('Q3 2026  /  Production services  /  Review copy', { x: 42, y: 697, size: 11, font });
    ['Control objective', 'Account ownership and approval records', 'Review period: 01 July - 30 September 2026', 'Reviewer: Internal Audit', 'Result: independent review required'].forEach((line, i) => sheet.drawText(line, { x: 42, y: 645 - i * 35, size: i === 0 ? 15 : 12, font: i === 0 ? bold : font, color: rgb(.1,.17,.2) }));
    sheet.drawText(`Evidence page ${number} / 2`, { x: 42, y: 45, size: 10, font });
  }
  const titles = [`Quarterly access evidence ${stamp}`, `Access review log ${stamp}`];
  for (const [index, file] of [{ name: 'quarterly-access-review.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) }, { name: 'access-review.csv', mimeType: 'text/csv', buffer: Buffer.from('account,decision\nservice-operations,reviewed\n<script>alert(1)</script>,literal evidence text') }].entries()) {
    const response = await context.request.post(base + '/api/evidence', { headers: { origin: base }, multipart: { evidenceTitle: titles[index], owner: 'Security Operations', period: 'Q3 2026', controlRef, reviewer: 'Internal Audit', sourceSystem: 'Identity governance export', status: 'İncelemede', file } });
    assert.equal(response.status(), 201, await response.text()); records.push((await response.json()).id);
  }
  const all = (await api('/api/grc')).rows;
  records.push(...all.filter(row => { const d = JSON.parse(row.data_json); return d.auditName === auditName || (row.module === 'Kontroller' && d.controlRef === controlRef); }).map(row => row.id));
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await module('Audit Management'); await page.locator('.audit-card-open').filter({ hasText: auditName }).click();
  const workspace = page.locator('.fw-audit-workspace');
  await expect(workspace.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(workspace.locator('.fw-progress-value>strong')).toHaveText('25%');
  await workspace.getByRole('tab', { name: 'Overview', exact: true }).press('ArrowRight');
  await expect(workspace.getByRole('tab', { name: 'Requests and review', exact: true })).toBeFocused();
  await workspace.getByRole('tab', { name: 'Requests and review', exact: true }).press('Home');
  await expect(workspace.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  checks.push('keyboard tab navigation and actual progress');
  for (const language of ['EN', 'TR']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: language, exact: true }).click();
    for (const theme of ['light', 'dark']) for (const width of [1536, 390]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme); await page.setViewportSize({ width, height: 960 });
      await screenshot(`audit-${language}-${theme}-${width}`, workspace);
    }
  }
  await page.setViewportSize({ width:1536, height:960 }); await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await page.evaluate(() => { document.documentElement.dataset.theme='light'; });
  await workspace.getByRole('tab',{name:'Plan and scope',exact:true}).click();
  await page.getByLabel('Audit objective',{exact:true}).fill('Unsaved workspace draft must be preserved.');
  await workspace.getByRole('tab',{name:'Reports',exact:true}).click(); await expect(page.getByRole('button',{name:'Preview new report',exact:true})).toBeVisible();
  await workspace.getByRole('tab',{name:'Plan and scope',exact:true}).click(); await expect(page.getByLabel('Audit objective',{exact:true})).toHaveValue('Unsaved workspace draft must be preserved.');
  await screenshot('audit-plan-desktop',page.locator('.audit-plan-panel')); checks.push('plan draft retained across tabs');
  await workspace.getByRole('tab',{name:'Overview',exact:true}).click();
  const a11y=await new AxeBuilder({page}).include('.fw-audit-workspace').analyze(); assert.deepEqual(a11y.violations.map(v=>v.id),[]);
  await module('Control Library');
  const controlWorkspace=page.locator('.control-assurance-workspace'), disclosure=page.locator('.module-analysis-disclosure').filter({has:controlWorkspace});
  if(!(await disclosure.evaluate(el=>el.open)))await disclosure.locator(':scope > summary').click();
  await controlWorkspace.getByLabel('View',{exact:true}).selectOption('all');await controlWorkspace.getByLabel('Search controls').fill(controlRef);
  await controlWorkspace.getByRole('button',{name:`Review ${controlRef}`,exact:true}).click();
  const detail=controlWorkspace.locator('.control-assurance-drilldown');await expect(detail.locator('.fw-control-reason')).toBeVisible();
  await screenshot('control-workspace-desktop',controlWorkspace);
  await detail.getByRole('tab',{name:/^Evidence/}).click();await expect(detail.getByRole('tabpanel')).toHaveCount(1);
  await page.setViewportSize({width:390,height:960});await screenshot('control-workspace-mobile',detail);
  await page.setViewportSize({width:1536,height:960});await module('Evidence Library');
  for(const [index,title] of titles.entries()){
    await page.locator('.evidence-link').filter({hasText:title}).click();const dialog=page.getByRole('dialog',{name:'Evidence preview',exact:true});
    if(index===0){await expect(dialog.locator('.ev-document-stage iframe')).toBeVisible();assert.match(await dialog.locator('iframe').getAttribute('src'),/^blob:/);}
    else{await expect(dialog.locator('.ev-text-preview pre')).toContainText('<script>alert(1)</script>');await expect(dialog.locator('.ev-text-preview script')).toHaveCount(0);}
    for(const width of [1536,390]){await page.setViewportSize({width,height:960});await screenshot(`evidence-${index}-${width}`,dialog);}
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.setViewportSize({width:1536,height:960});
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/summary.json`,JSON.stringify({passed:true,checks,pageErrors:errors,accessibilityViolations:a11y.violations.length},null,2));
  console.log('RESEARCH_WORKSPACE_QA_PASS',checks.length);
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{for(const id of records)await api(`/api/grc?id=${encodeURIComponent(id)}`,'DELETE');if(auditId)await api(`/api/audits?id=${auditId}`,'DELETE');await browser.close();}
