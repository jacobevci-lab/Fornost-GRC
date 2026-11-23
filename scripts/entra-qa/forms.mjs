import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { openQaModule, switchQaLocale, waitForQaIdle } from '../qa-browser-harness.mjs';
import { title as t, note } from './records.mjs';

export async function pick(dialog, label, query) {
  const input = dialog.getByRole('combobox', { name: label, exact: true });
  await input.fill(query);
  await dialog
    .getByRole('listbox', { name: label, exact: true })
    .getByRole('option')
    .filter({ hasText: query })
    .first()
    .click();
}
async function editor(page, module) {
  await switchQaLocale(page, 'en');
  await openQaModule(page, module);
  // Server-created relations are loaded on shell startup. Refresh the destination
  // after navigating, so the evidence table does not start a redundant assessment.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('main > header h1').filter({ hasText: module }).waitFor();
  await waitForQaIdle(page);
  await page.locator('.module-head .primary').click();
  return page.locator('.record-dialog');
}
async function save(page, dialog) {
  const result = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/grc' && r.request().method() === 'POST',
  );
  await dialog.locator('.form-actions .primary').click();
  const response = await result;
  assert.equal(response.status(), 201, 'Register write failed');
  await expect(dialog).toBeHidden();
  return response.json();
}
export async function assetForm(page, owner, vendorCode) {
  const d = await editor(page, 'Asset Inventory');
  await d.locator('[name=title]').fill(t.asset);
  for (const [k, v] of Object.entries({
    assetType: 'Bulut Servisi',
    businessUnit: 'Bilgi Teknolojileri',
    criticality: 'Kritik',
    status: 'Aktif',
  }))
    await d.locator('[name=' + k + ']').selectOption(v);
  await pick(d, 'Owner · search name or email', owner);
  await d.getByRole('button', { name: 'Show advanced fields' }).click();
  await d.locator('[name=dataClassification]').selectOption('Çok Gizli');
  await d.locator('[name=personalData]').selectOption('Evet');
  await d.getByRole('button', { name: 'Infrastructure & lifecycle' }).click();
  await d.locator('[name=internetFacing]').selectOption('Evet');
  await d.locator('[name=description]').fill(note);
  await d.getByRole('button', { name: 'Security control posture' }).click();
  for (const k of ['backupStatus', 'edrStatus', 'siemStatus', 'vulnScan'])
    await d.locator('[name=' + k + ']').selectOption('Kapsamda');
  await d.getByRole('button', { name: 'Connections & review' }).click();
  await pick(d, 'Search manufacturer / vendor', vendorCode);
  return save(page, d);
}
export async function biaForm(page, owner, reviewer, assetCode, vendorCode) {
  const d = await editor(page, 'Business Impact Analysis (BIA)');
  await d.locator('[name=process]').fill(t.bia);
  for (const [k, v] of Object.entries({
    processCategory: 'Teknoloji Hizmeti',
    businessUnit: 'Bilgi Teknolojileri',
    criticality: 'Kritik',
    asset: assetCode,
  }))
    await d.locator('[name=' + k + ']').selectOption(v);
  await pick(d, 'Owner · search name or email', owner);
  for (const [k, v] of Object.entries({ rto: '2', rpo: '1', mtpd: '1' }))
    await d.locator('[name=' + k + ']').fill(v);
  await expect(d.locator('[role=alert]').filter({ hasText: /RTO/ })).toBeVisible();
  await d.locator('[name=mtpd]').fill('4');
  await d.getByRole('button', { name: 'Show advanced fields' }).click();
  await d.getByRole('tab', { name: 'Dependencies', exact: true }).click();
  await pick(d, 'Technology / system dependencies', assetCode);
  await pick(d, 'Supplier dependencies', vendorCode);
  await d.getByRole('tab', { name: 'Recovery strategy & resilience' }).click();
  await d
    .locator('[name=recoveryStrategy]')
    .fill('Süreli acil erişim ile ayrıcalıklı kimlik işlevini geri yükle.');
  await d.getByRole('tab', { name: 'Exercises, testing & BIA approval' }).click();
  await pick(d, 'BIA approver · search name or email', reviewer);
  return save(page, d);
}

export async function riskForm(page, owner, codes, reviewDate) {
  const d = await editor(page, 'Risk Assessment');
  await d.locator('[name=title]').fill(t.risk);
  await pick(d, 'Owner · search name or email', owner);
  const assets = d.locator('.risk-asset-options');
  await assets.getByRole('searchbox').fill(codes.asset);
  await assets.getByRole('button', { name: new RegExp(codes.asset) }).click();
  await d.getByRole('button', { name: 'Show advanced', exact: true }).click();
  for (const [k, v] of Object.entries({
    category: 'Siber Güvenlik',
    businessUnit: 'Bilgi Teknolojileri',
    inherentLikelihood: '4',
    inherentImpact: '5',
    treatment: 'Azalt',
    status: 'Açık',
  }))
    await d.locator('[name=' + k + ']').selectOption(v);
  await d.locator('[name=nextReview]').fill(reviewDate);
  await expect(d.locator('.risk-rating[data-form-group=core] output')).toContainText('20 / 25');
  await pick(d, 'Search control code or title', codes.control);
  await d.locator('[name=processLink]').selectOption(codes.bia);
  return save(page, d);
}

export async function aiForm(page, profile, codes) {
  await waitForQaIdle(page);
  await switchQaLocale(page, 'en');
  await openQaModule(page, 'AI Governance');
  await page.getByRole('button', { name: '+ Register AI system', exact: true }).click();
  const d = page.getByRole('dialog');
  for (const [label, value] of [
    ['System / agent name', profile.name],
    ['Model / version', profile.model],
    ['Business unit', profile.unit],
    ['Intended purpose', profile.purpose],
    ['Human-in-the-loop (HITL) approval mechanism', profile.hitl],
    ['Periodic review date', profile.reviewDate],
    ['Existing controls and risk rationale', profile.controlNotes],
  ])
    await d.getByLabel(label, { exact: true }).fill(value);
  for (const [label, value] of [
    ['Architecture', profile.architecture],
    ['Deployment model', profile.deployment],
    ['EU AI Act risk level', profile.risk],
    ['Impact (1–5)', profile.impact],
    ['Likelihood (1–5)', profile.likelihood],
    ['Data sensitivity (1–5)', profile.sensitivity],
    ['Autonomy risk (1–5)', profile.autonomy],
    ['Control maturity (1–5)', profile.maturity],
  ])
    await d.getByLabel(label, { exact: true }).selectOption(value);
  for (const label of [
    'Customer personal data',
    'Provider excludes data from model training (opt-out)',
    'Provider has a zero data retention (ZDR) commitment',
  ])
    await d.getByRole('checkbox', { name: label, exact: true }).check();
  for (const [label, value] of [
    ['Model provider · VEN', codes.vendor],
    ['Related asset · AST', codes.asset],
    ['Linked risks · RSK', codes.risk],
    ['Linked controls · CTL / ISO/IEC 42001', codes.control],
    ['AI business owner', profile.owner],
    ['Technical / model owner', profile.technical],
    ['Independent reviewer (Admin)', profile.reviewer],
  ])
    await pick(d, label, value);
  const invalid = await d
    .locator('input:invalid, textarea:invalid, select:invalid')
    .evaluateAll((fields) =>
      fields.map(
        (field) =>
          field.getAttribute('aria-label') ||
          field.labels?.[0]?.textContent?.trim().slice(0, 80) ||
          field.tagName,
      ),
    );
  assert.deepEqual(invalid, [], 'AI profile required fields');
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/ai/workspace' && r.request().method() === 'POST',
  );
  await d.getByRole('button', { name: 'Save system profile' }).click();
  const write = await response;
  assert.equal(write.status(), 201);
  await expect(d).toBeHidden();
  return write.json();
}
