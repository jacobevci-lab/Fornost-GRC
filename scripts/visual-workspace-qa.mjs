import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Isolated product regression: never changes production records or settings.
const base = 'http://127.0.0.1:4173', out = 'visual-workspace-qa-artifacts';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1365, height: 935 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
async function open(label) {
  const moduleButton = page.locator(`nav button[aria-label=${JSON.stringify(label)}]`);
  // Expand the actual navigation group before clicking a visible module.
  const groupTrigger = moduleButton.locator('xpath=../preceding-sibling::button');
  await expect(groupTrigger).toBeVisible();
  if (await groupTrigger.getAttribute('aria-expanded') !== 'true') await groupTrigger.click();
  await expect(moduleButton).toBeVisible();
  await moduleButton.click();
}
const metricSize = locator => expect.poll(async () => locator.first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(22);
try {
  const auth = await context.request.post(base + '/api/auth', { headers: { origin: base }, data: { action: 'login', email: 'qa-admin@fornost.test', password: qaPassword() } });
  assert.equal(auth.status(), 200);
  let notificationReads=0, notificationMode='hold'; const delayed=[];
  await page.route('**/api/continuous-assurance/notifications',async route=>{
    notificationReads++;
    if(notificationMode==='hold') await new Promise(resolve=>delayed.push(resolve));
    if(notificationMode==='invalid') return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    await route.continue().catch(()=>{});
  });
  await page.goto(base); await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('.evidence-assurance-status')).not.toHaveAttribute('data-state','loading');
  const detail=page.locator('.executive-operational-detail');
  assert.equal(notificationReads,0,'Collapsed operational details do not request notification history');
  await detail.locator(':scope>summary').click();
  await expect(detail.locator('.executive-operational-detail-body')).toHaveAttribute('aria-busy','true');
  await expect(detail).toContainText('Some operational data could not be loaded.',{timeout:20000});
  await expect(detail.locator('.executive-operational-detail-body')).toHaveAttribute('aria-busy','false');
  await expect(detail.locator('.executive-owner-accountability')).toBeVisible();
  await expect(detail.locator('.executive-delivery-posture')).toHaveCount(0);
  for(const locale of ['EN','TR']){await page.locator('.language-switch:visible').getByRole('button',{name:locale,exact:true}).click();await page.setViewportSize({width:390,height:935});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4));await detail.screenshot({path:`${out}/operational-timeout-${locale}.png`});}
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.setViewportSize({width:1365,height:935});
  notificationMode='live';for(const release of delayed)release();
  await detail.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(detail.locator('.executive-delivery-posture')).toBeVisible();
  await expect(detail).not.toContainText('Some operational data could not be loaded.');
  assert.equal(notificationReads,2);
  await detail.locator(':scope>summary').click();await expect(detail.locator('.executive-operational-detail-body')).toHaveCount(0);
  notificationMode='invalid';await detail.locator(':scope>summary').click();await expect(detail).toContainText('Some operational data could not be loaded.');await expect(detail.locator('.executive-delivery-posture')).toHaveCount(0);
  notificationMode='live';await detail.getByRole('button',{name:'Retry',exact:true}).click();await expect(detail.locator('.executive-delivery-posture')).toBeVisible();
  await detail.locator(':scope>summary').click();
  notificationMode='hold';await detail.locator(':scope>summary').click();await expect.poll(()=>notificationReads).toBe(5);
  await detail.locator(':scope>summary').click();await expect(detail.locator('.executive-operational-detail-body')).toHaveCount(0);await expect(detail).not.toContainText('Loading operational data');
  notificationMode='live';for(const release of delayed)release();await detail.locator(':scope>summary').click();await expect(detail.locator('.executive-delivery-posture')).toBeVisible();assert.equal(notificationReads,6);
  await detail.locator(':scope>summary').click();await page.unroute('**/api/continuous-assurance/notifications');
  checks.push('Collapsed operational detail avoids notification reads; real timeout, partial-source honesty, bilingual mobile error, retry and malformed-response recovery');

  for (const locale of ['tr', 'en']) {
    await page.locator('.language-switch:visible').getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
    const tr = locale === 'tr';
    await open(tr ? 'Gösterge Paneli' : 'Dashboard');
    await expect(page.locator('.executive-dashboard-reference')).toBeVisible();
    await expect(page.locator('.evidence-assurance-status')).not.toHaveAttribute('data-state', 'loading');
    assert.ok(await page.locator('.evidence-assurance-copy strong').innerText());
    assert.equal(await page.locator('.executive-dashboard-reference').getByText(tr ? 'Geciken denetim' : 'Overdue audits', { exact: true }).count(), 0);
    await expect(page.locator('.audit-remediation-panel')).toContainText(tr ? 'Geciken denetim maddesi' : 'Overdue audit requirements');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle:visible').click();
      for (const width of [1365, 768, 390]) {
        await page.setViewportSize({ width, height: 935 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4, 'Dashboard fits viewport');
        const grid = page.locator('.executive-dashboard-grid');
        if (width === 1365) assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateAreas), '"compliance risk" "assurance audit"');
        await page.screenshot({ path: `${out}/${locale}-${theme}-${width}-dashboard.png` });
        checks.push(`${locale}/${theme}/${width}: dashboard`);
      }
    }
    await page.setViewportSize({ width: 1365, height: 935 });
    await open(tr ? 'Benim İşlerim' : 'My Work');
    await expect(page.locator('.mw2-search')).toBeVisible();
    await metricSize(page.locator('.mw2-metrics strong'));
    await page.getByRole('button', { name: tr ? 'Organizasyon' : 'Organization', exact: true }).click();
    await expect(page.locator('.mw2-queue>header small')).toHaveText(tr ? 'KURUMSAL İŞ KUYRUĞU' : 'ORGANIZATION WORK QUEUE');
    for (const width of [1365, 768, 390]) {
      await page.setViewportSize({ width, height: 935 });
      const search = await page.locator('.mw2-search').boundingBox();
      assert.ok(search.height >= 36 && search.height <= 44, 'Search retains a single-line height');
      if(width===390)assert.ok((await page.locator('.mw2-filters').boundingBox()).height<250,'Mobile filters wrap naturally without inheriting a desktop column height');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 4, 'Work queue fits viewport');
      await page.screenshot({ path: `${out}/${locale}-${width}-my-work.png` });
    }
    await page.setViewportSize({ width: 1365, height: 935 });
    await open(tr ? 'Varlık Envanteri' : 'Asset Inventory');
    await metricSize(page.locator('.module-overview>div>article>strong'));
    checks.push(`${locale}: metrics, work scope and responsive filters`);
  }
  await page.locator('.language-switch:visible').getByRole('button', { name: 'EN', exact: true }).click();
  await open('Risk Appetite & KRI');
  await expect(page.locator('.rap-grid>section').nth(1).locator('h3')).toHaveText('Inherent risk overview');
  const riskContext=await (await context.request.get(base+'/api/risk-appetite')).json();
  await expect(page.locator('.rap-grid>section').nth(1).locator('header>span')).toHaveText(String(riskContext.linkedRisks.length));
  const coreRisks=(await (await context.request.get(base+'/api/grc')).json()).rows.filter(r=>r.module==='Risk Assessment');
  for(const risk of riskContext.linkedRisks){
    const data=JSON.parse(coreRisks.find(r=>r.id===risk.id).data_json);
    const present=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
    const dimensions=['inherentImpact','impact','confidentialityImpact','integrityImpact','availabilityImpact'];
    const expected=(present(data.inherentLikelihood)||present(data.likelihood))&&dimensions.some(k=>present(data[k]))
      ?Number(data.inherentLikelihood||data.likelihood||0)*Math.max(0,...dimensions.map(k=>Number(data[k]||0))):null;
    assert.equal(risk.score,expected,'KRI uses the same assessed risk methodology as the register and dashboard');
  }
  await page.locator('.rap-hero').getByRole('button',{name:'+ Risk Appetite',exact:true}).click();
  const kriDialog=page.getByRole('dialog',{name:'Risk appetite and KRI definition'});
  await expect(kriDialog).toBeVisible();
  for(const width of [1365,768,390]){
    await page.setViewportSize({width,height:935});
    await expect.poll(async()=>kriDialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})).toBe(true);
    const box=await kriDialog.boundingBox();
    if(width===1365){const rail=await page.locator('.shell>aside').boundingBox();assert.ok(box.x>=rail.x+rail.width,'Nested module form is fully outside the desktop rail')}
    assert.equal(await kriDialog.evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.left+8,r.top+40);return !!target&&el.contains(target)}),true,'Dialog content stays above navigation');
    await page.screenshot({path:`${out}/kri-dialog-${width}.png`});
  }
  await kriDialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.setViewportSize({width:1365,height:935});
  checks.push('KRI overview count and nested modal visibility at three widths');
  await open('System Settings');
  const settingsTabs = page.locator('.settings-subnav>button');
  await expect(settingsTabs).toHaveCount(3);
  assert.equal(new Set(await settingsTabs.evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y))).size,1,'Settings sections share a compact horizontal rail');
  await page.route('**/api/ai/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({configured:false,enabled:false,operatingState:'ready',operatingMessage:'',capabilities:{chat:true}})}));
  await open('AI Settings');
  await expect(page.locator('.ai-control-summary article').first()).toContainText('Access policy');
  await expect(page.locator('.ai-control-summary article').first().locator('b')).toHaveText('Allowed');
  await expect(page.locator('.ai-control-summary article').first()).toContainText('does not verify provider connectivity');
  checks.push('Settings navigation geometry and accurate AI policy status');
  let vendorMode = 'failure';
  await page.route('**/api/third-party-risk', route => vendorMode === 'failure'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic source failure"}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vendors: [], profiles: [], assessments: [], findings: [], summary: { total: 0, unmanaged: 0, critical: 0, reviewDue: 0, openFindings: 0, overdueFindings: 0, highRisk: 0, contractsDue: 0 } }) }));
  await open('Vendor Management');
  await expect(page.locator('.tprm-load-state[role="alert"]')).toBeVisible();
  assert.equal(await page.locator('.tprm-metrics').count(), 0, 'Failed source never renders reassuring zero counts');
  vendorMode = 'empty';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.tprm-empty').first()).toContainText('No third parties assessed yet');
  await metricSize(page.locator('.tprm-metrics b'));
  await page.getByRole('button', { name: 'Open third-party inventory', exact: true }).click();
  await expect(page.locator('.tprm-table')).toContainText('No third party.');
  checks.push('Vendor load failure, retry, honest empty state and inventory navigation');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/summary.json`, JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  await fs.writeFile(`${out}/failure.json`, JSON.stringify({ message: error.message, checks, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
