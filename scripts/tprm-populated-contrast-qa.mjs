import {chromium, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext, openQaModule, switchQaLocale, waitForQaIdle} from './qa-browser-harness.mjs';

// Run after report-composer QA has bootstrapped its disposable local runtime.
// Only the vendor GET response is synthetic; render the actual application and
// complete stylesheet cascade. This is populated visual coverage, not CRUD QA.
const base='http://127.0.0.1:4173',out='tprm-contrast-qa-artifacts';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}});
const page=await context.newPage(),checks=[];
try {
  await mkdir(out,{recursive:true});
  const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});
  assert.equal(login.status(),200);
  await page.route(url=>url.pathname==='/api/third-party-risk'&&!url.searchParams.has('view'),async route=>{
    assert.equal(route.request().method(),'GET','Populated contrast QA must not change vendor records');
    const response=await route.fetch();assert.equal(response.status(),200);
    const data=await response.json();
    const vendors=['needs-assessment','unassessed'].map((attention,i)=>({vendorId:`QA-CONTRAST-${i}`,name:`QA contrast supplier ${i}`,service:'Synthetic visual regression',category:'QA',criticality:'low',status:'onboarding',attention,updatedAt:new Date().toISOString()}));
    await route.fulfill({response,json:{...data,vendors,profiles:vendors,assessments:[],findings:[],evidencePins:[],summary:{total:2,unmanaged:0,critical:0,reviewDue:0,openFindings:0,overdueFindings:0,highRisk:0,contractsDue:0}}});
  });
  await page.goto(base);await openQaModule(page,'Tedarikçi Yönetimi');
  for(const locale of ['tr','en']) {
    await switchQaLocale(page,locale);
    for(const theme of ['light','dark']) {
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
      await waitForQaIdle(page);
      await expect(page.locator('.tprm-card .tprm-state')).toHaveCount(2);
      const audit=await new AxeBuilder({page}).include('.tprm-grid').withRules(['color-contrast']).analyze();
      assert.deepEqual(audit.violations,[],`${locale}/${theme}: populated vendor card contrast`);
      assert.deepEqual(audit.incomplete,[],`${locale}/${theme}: contrast coverage must be complete`);
      const badge=await page.locator('.tprm-card .tprm-state').first().evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,minWidth:getComputedStyle(el).minWidth}));
      assert.notEqual(badge.minWidth,'33px','A nested state must not inherit the section counter geometry');
      await page.locator('.tprm-grid').screenshot({path:`${out}/${locale}-${theme}.png`});
      checks.push({locale,theme,badge,violations:audit.violations.length});
    }
  }
  await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',coverage:'Actual UI with synthetic read-only vendor responses',checks},null,2));
  console.log('TPRM_POPULATED_CONTRAST_PASS',checks.length);
} finally {await browser.close();}
