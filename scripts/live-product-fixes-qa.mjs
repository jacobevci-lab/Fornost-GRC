import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
import { revealAiWorkspace } from './qa-ai-workspaces.mjs';

// Deliberately fixed to the isolated CI database; no production credentials or writes.
const base='http://127.0.0.1:4173', out='live-product-fixes-qa-artifacts';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1363,height:936}}),page=await context.newPage();
const checks=[],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
async function api(path,method='GET',data){const r=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),200,await r.text());return r.json();}
async function open(name){
  const nav=page.locator('#fornost-navigation'),button=nav.getByRole('button',{name,exact:true,includeHidden:true});
  if(!await button.isVisible())for(const group of await nav.locator('.nav-group').all()){
    if(await group.getByRole('button',{name,exact:true,includeHidden:true}).count()){await group.locator('.nav-group-trigger').click();break;}
  }
  await button.click();
}
async function screenshot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});}
try{
  await mkdir(out,{recursive:true});await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
  await api('/api/grc'); // Initialize only the isolated installation's existing demo fixture.
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('.evidence-assurance-status')).not.toHaveAttribute('data-state','loading');
  const assurance=await api('/api/executive-assurance');assert.equal(assurance.evidenceVerified,true);
  for(const label of ['Control Assurance','Evidence Freshness'])await expect(page.locator('.executive-dashboard-kpis button').filter({hasText:label})).not.toContainText('—');
  if(assurance.auditPortfolio.orphanRequirements){await expect(page.locator('.evidence-assurance-status')).toContainText('Evidence and control assessment is available');assert.equal(assurance.verified,false);}
  checks.push('F01: independent evidence/control assessment survives orphan audit scope');await screenshot('01-assurance');

  await open('Evidence Library');await expect(page.locator('.eql-health strong')).toHaveText(/%$/);
  const evidence=await api('/api/evidence/assurance');
  const stale=evidence.rows.find(row=>['Süresi Doldu','Expired'].includes(row.data.status));assert.ok(stale,'Demo expired evidence fixture');
  await expect(page.locator('.smart-table tbody tr').filter({hasText:stale.data.evidenceTitle}).locator('.evidence-column-freshness')).toHaveText('Expired');
  checks.push('F02: evidence row and quality source use computed expiry');await screenshot('02-evidence');

  const raw=(await api('/api/grc')).rows, control=raw.find(row=>row.module==='Kontroller');assert.ok(control);
  const code=control.recordCode||control.record_code,controlTitle=JSON.parse(control.data_json).controlTitle;
  await open('Connected GRC Map');await page.getByRole('textbox',{name:'Find a record',exact:true}).fill(code);
  const graph=page.locator('.connected-explorer');await expect(graph.locator('.cg-source-state')).toHaveAttribute('data-loading','false');
  const target=graph.locator('.cg-records button').filter({hasText:code}).filter({hasText:'Control Library'});await target.click();
  await expect(graph.locator('.cg-detail h3')).toHaveText(controlTitle);
  await graph.getByRole('button',{name:'Open record ↗',exact:true}).click();
  const focus=page.locator('.core-record-focus:not(.record-link-entry)');await expect(focus).toContainText(code);
  await page.reload();await expect(focus).toContainText(code);await expect(page.locator('.smart-table tbody tr')).toHaveCount(1);
  await focus.getByRole('button',{name:'Return to previous view',exact:true}).click();
  await expect(page.locator('.connected-explorer')).toBeVisible();await expect(page.getByRole('textbox',{name:'Find a record',exact:true})).toHaveValue(code);
  await expect(page.locator('.cg-detail h3')).toHaveText(controlTitle);
  checks.push('F03/F04/F07: exact title, target reload and return restore graph query and selection');await screenshot('03-map-return');

  await open('Risk Assessment');await expect(page.locator('.core-record-focus:not(.record-link-entry)')).toHaveCount(0);
  for(const label of ['Inherent Risk','Status']){
    const box=await page.locator('.risk-table').getByRole('columnheader',{name:new RegExp(`^${label}`, 'i')}).boundingBox();
    assert.ok(box&&box.x>=0&&box.x+box.width<=1363,`${label} is visible before horizontal scrolling`);
  }
  await expect(page.locator('.risk-table').getByRole('separator',{name:'Status column width',exact:true})).toBeVisible();
  await expect(page.locator('body')).toContainText(/Admin\s*·\s*Local/);
  await screenshot('04-risk-desktop');checks.push('F05/F06: decision columns and translated accessible resize labels at 1363px');

  await open('Reporting');await page.getByLabel('Report module',{exact:true}).selectOption('Risk Assessment');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:/CSV/}).click();
  const text=await readFile(await (await download).path(),'utf8');
  assert.match(text,/Owner: All/);assert.match(text,/Status: All/);assert.doesNotMatch(text,/Owner: All Modules/);
  if(!assurance.verified)await expect(page.getByRole('button',{name:/Global Assurance Pack/i})).toBeDisabled();
  checks.push('F01/F06: combined export stays gated and CSV describes unfiltered criteria correctly');

  await open('AI Governance');const ai=page.locator('#fornost-ai-panel');
  await expect(ai).toContainText('Inventory and governance available');
  await expect(ai.getByRole('button',{name:'Add your first AI system',exact:true})).toBeVisible();
  await ai.getByRole('button',{name:'Add your first AI system',exact:true}).click();await expect(page.locator('#ai-model-create')).toBeVisible();
  await expect(page.locator('#ai-model-create input').first()).toBeFocused();
  await revealAiWorkspace(ai,'AI Executive Overview');await ai.getByRole('button',{name:'AI Executive Overview',exact:true}).click();
  await ai.locator('.ai-section-picker>summary').click();assert.equal(await ai.locator('.ai-workspace-group').count(),6);assert.equal(await ai.locator('.fornost-ai-tabs button').count(),34);
  await screenshot('05-ai-groups');checks.push('F08: provider-independent first-system action and six task groups preserve all 34 workspaces');
  assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({checks,errors},null,2));
  console.log(checks.join('\n'));
}catch(error){await screenshot('failure');await writeFile(`${out}/failure.txt`,String(error));throw error;}
finally{await context.close();await browser.close();}
