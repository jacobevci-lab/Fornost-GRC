import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Invoked in the authenticated loopback register QA after synthetic catalog seeding.
export async function verifyConnectedRiskEditor(page, api) {
  const rows = (await api('/api/grc')).rows;
  const asset = rows.find(row => row.module === 'Varlık Envanteri' && /^AST-\d+$/.test(row.record_code));
  const controls = rows.filter(row => row.module === 'Kontroller' && /^CTL-\d+$/.test(row.record_code)).slice(0,2);
  assert.ok(asset); assert.equal(controls.length,2);
  const title = 'QA connected risk ' + crypto.randomUUID(), email = 'qa-admin@fornost.test';
  const people = (await api('/api/grc/risk-owners?q=' + encodeURIComponent(email))).people;
  const person = people.find(p => p.email === email);
  assert.ok(person);
  const dialog = page.locator('.record-dialog'), search = page.locator('.register-search input');
  const advanced = () => dialog.getByRole('button',{name:/show advanced/i}).click();
  const save = method => Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/grc' && r.request().method() === method),
    dialog.locator('.form-actions button.primary').click()
  ]).then(async ([r])=>{assert.ok(r.ok(),await r.text());return r.json();});
  let id;
  try {
    await page.locator('.module-head button.primary').click();
    await dialog.locator('input[name=title]').fill(title);
    const owner = dialog.getByRole('combobox',{name:/^Owner · search name or email$/});
    await owner.fill(email);await dialog.getByRole('option',{name:new RegExp(email)}).click();
    const assets=dialog.locator('.risk-asset-options'), assetSearch=assets.getByRole('searchbox');
    await assetSearch.fill(asset.record_code);await assets.getByRole('button',{name:new RegExp(asset.record_code)}).click();
    await dialog.getByRole('button',{name:/^Organization-level risk/}).click();await expect(assetSearch).toBeDisabled();
    await dialog.getByRole('button',{name:'Asset-linked risk',exact:true}).click();
    await expect(assets.getByRole('button',{pressed:true})).toHaveCount(0);
    await assetSearch.fill(asset.record_code);await assets.getByRole('button',{name:new RegExp(asset.record_code)}).click();
    await dialog.locator('[name=inherentImpact]').selectOption('5');
    await dialog.locator('[name=inherentLikelihood]').selectOption('5');
    await expect(dialog.locator('.risk-rating[data-form-group=core] output')).toContainText('25 / 25');
    await advanced();
    const control = dialog.getByRole('combobox',{name:'Search control code or title'});
    for (const row of controls) {
      await control.fill(row.record_code);await expect(dialog.getByRole('option',{name:new RegExp(row.record_code)})).toBeVisible();
      await control.press('ArrowDown');await control.press('Enter');
    }
    await dialog.getByRole('button',{name:new RegExp('Remove · .*'+controls[0].record_code)}).click();
    await dialog.getByRole('combobox',{name:/^Action owner · /}).fill(email);
    await dialog.getByRole('option',{name:new RegExp(email)}).click();
    await dialog.locator('[name=controlImplementationNote]').fill('Reviewed for the isolated risk exercise');
    await dialog.locator('[name=residualImpact]').selectOption('2');
    await expect(dialog.locator('.risk-rating[data-form-group=advanced] output')).toContainText('—');
    await dialog.locator('[name=residualLikelihood]').selectOption('3');
    id=(await save('POST')).id; assert.ok(id);
    await expect(dialog).toHaveCount(0);await search.fill(title);
    const row=page.locator('.risk-table tbody tr').filter({hasText:title});
    await expect(row.locator('.title-stack small')).toHaveText(JSON.parse(asset.data_json).title+' · '+asset.record_code);
    await expect(row).toContainText('6 ·');
    const created=JSON.parse((await api('/api/grc')).rows.find(r=>r.id===id).data_json);
    assert.equal(created.owner,person.name||email);assert.equal(created.ownerEmail,email);
    assert.equal(created.actionOwnerEmail,email);assert.equal(created.existingControls,controls[1].record_code);
    assert.equal(created.residualScore,'6');
    await row.getByRole('button',{name:'Edit',exact:true}).click();await advanced();
    await expect(dialog.locator('[name=controlImplementationNote]')).toHaveValue('Reviewed for the isolated risk exercise');
    await expect(dialog.getByRole('button',{name:new RegExp('Remove · .*'+controls[1].record_code)})).toBeVisible();
    const action=dialog.getByRole('group',{name:'Action owner',exact:true});
    await action.getByRole('button',{name:'Enter an external owner'}).click();
    await action.locator('[name=actionOwner]').fill('External assessor');
    await action.locator('[name=actionOwnerEmail]').fill('external@example.invalid');
    await dialog.getByRole('button',{name:/^Organization-level risk/}).click();
    await dialog.locator('[name=residualLikelihood]').selectOption('');
    await save('PATCH');await expect(dialog).toHaveCount(0);
    const updated=JSON.parse((await api('/api/grc')).rows.find(r=>r.id===id).data_json);
    assert.equal(updated.asset,'');assert.equal(updated.riskScope,'organization');assert.equal(updated.residualScore,undefined);
    assert.equal(updated.actionOwner,'External assessor');assert.equal(updated.actionOwnerEmail,'external@example.invalid');
    await expect(row.locator('.title-stack small')).toHaveText('Organization-level risk');
    const headings=await page.locator('.risk-table th').allTextContents(), residualColumn=headings.findIndex(t=>t.includes('Residual Risk'));
    assert.ok(residualColumn>=0);await expect(row.locator('td').nth(residualColumn)).toHaveText('—');
  } finally {
    if(id) await api('/api/grc?id='+encodeURIComponent(id),'DELETE');
    if(await search.isVisible()) await search.fill('');
  }
}
