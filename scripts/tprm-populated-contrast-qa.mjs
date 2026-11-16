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
const states=['onboarding','review-overdue','review-due','critical-finding','approved','conditional'];
const expected={tr:['Kabul değerlendirmesi','İnceleme gecikti','İnceleme zamanı','Kritik bulgu','Onaylandı','Koşullu onaylandı'],en:['Onboarding','Review overdue','Review due','Critical finding','Approved','Conditionally approved']};
try {
  await mkdir(out,{recursive:true});
  const login=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});
  assert.equal(login.status(),200);
  await page.route(url=>url.pathname==='/api/third-party-risk'&&!url.searchParams.has('view'),async route=>{
    assert.equal(route.request().method(),'GET','Populated contrast QA must not change vendor records');
    const response=await route.fetch();assert.equal(response.status(),200);
    const data=await response.json();
    const stamp=new Date().toISOString();
    const vendors=states.map((attention,i)=>({vendorId:`QA-CONTRAST-${i}`,name:`QA contrast supplier ${i}`,service:'Synthetic visual regression',category:'QA',criticality:['high','critical','medium','low'][i%4],status:i===0?'onboarding':'approved',attention,dataClassification:'confidential',riskOwner:'qa-admin@fornost.test',reviewer:'reviewer@example.test',updatedAt:stamp}));
    const assessments=vendors.map((v,i)=>({id:`QA-ASSESSMENT-${i}`,vendorId:v.vendorId,cycleNumber:1,status:'draft',riskTier:'high',inherentScore:16,residualScore:11,coverage:50,questionnaire:{},criticalGaps:['auditRights'],treatmentPlan:'Synthetic review plan',createdBy:'qa-admin@fornost.test',updatedAt:stamp}));
    const unmanaged={vendorId:'QA-UNMANAGED',name:'QA outside TPRM',service:'Synthetic inventory',criticality:'low',status:'unmanaged',updatedAt:stamp};
    await route.fulfill({response,json:{...data,vendors:[...vendors,unmanaged],profiles:vendors,assessments,findings:[],evidencePins:[],summary:{total:vendors.length+1,unmanaged:1,critical:2,reviewDue:2,openFindings:0,overdueFindings:0,highRisk:vendors.length,contractsDue:0}}});
  });
  await page.goto(base);await openQaModule(page,'Tedarikçi Yönetimi');
  for(const locale of ['tr','en']) {
    await switchQaLocale(page,locale);
    for(const theme of ['light','dark']) for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
      await waitForQaIdle(page);
      await expect(page.locator('.tprm-card .tprm-state')).toHaveText(expected[locale]);
      await expect(page.locator('.tprm-card').first()).toContainText(locale==='tr'?'Yüksek':'High');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Populated cards must fit narrow screens');
      const audit=await new AxeBuilder({page}).include('.tprm-grid').withRules(['color-contrast']).analyze();
      assert.deepEqual(audit.violations,[],`${locale}/${theme}: populated vendor card contrast`);
      assert.deepEqual(audit.incomplete,[],`${locale}/${theme}: contrast coverage must be complete`);
      const badge=await page.locator('.tprm-card .tprm-state').first().evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,minWidth:getComputedStyle(el).minWidth}));
      assert.notEqual(badge.minWidth,'33px','A nested state must not inherit the section counter geometry');
      await page.locator('.tprm-grid').screenshot({path:`${out}/${locale}-${theme}-${width}.png`});
      checks.push({locale,theme,width,badge,violations:audit.violations.length});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('.tprm-hero').getByRole('button',{name:locale==='tr'?'+ Tedarikçi':'+ Third Party',exact:true}).click();
    const form=page.locator('.tprm-form');
    const criticality=form.getByLabel(locale==='tr'?'Kritiklik':'Criticality',{exact:true});
    await criticality.selectOption({label:locale==='tr'?'Kritik':'Critical'});await expect(criticality).toHaveValue('critical');
    const classification=form.getByLabel(locale==='tr'?'Veri sınıfı':'Data class',{exact:true});
    await classification.selectOption({label:locale==='tr'?'Gizli':'Confidential'});await expect(classification).toHaveValue('confidential');
    await form.getByRole('button',{name:locale==='tr'?'Vazgeç':'Cancel',exact:true}).click();
    await page.locator('.tprm-tabs').getByRole('button',{name:'Due Diligence',exact:true}).click();
    const row=page.locator('.tprm-table tbody tr').first();
    await expect(row.locator('.tprm-state')).toHaveText(locale==='tr'?'Taslak':'Draft');
    await row.getByRole('button',{name:locale==='tr'?'Gönder':'Submit',exact:true}).click();
    await expect(page.locator('.tprm-decision-context')).toContainText(locale==='tr'?'Taslak':'Draft');
    await expect(page.locator('.tprm-decision-context')).toContainText(locale==='tr'?'Denetim hakkı':'Audit rights');
    await page.locator('.tprm-modal').getByRole('button',{name:locale==='tr'?'Vazgeç':'Cancel',exact:true}).click();
    await page.locator('.tprm-tabs').getByRole('button',{name:locale==='tr'?'Tedarikçi Envanteri':'Third Parties',exact:true}).click();
    await expect(page.locator('.tprm-table tbody tr').last()).toContainText(locale==='tr'?'Değerlendirilmedi':'Not assessed');
    await expect(page.locator('.tprm-table tbody tr').last()).toContainText(locale==='tr'?'Kapsam dışında':'Outside TPRM');
    for(const theme of ['light','dark']) {
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
      const audit=await new AxeBuilder({page}).include('.tprm-table .tprm-state').withRules(['color-contrast']).analyze();
      assert.deepEqual(audit.violations,[],`${locale}/${theme}: inventory severity contrast`);
      assert.deepEqual(audit.incomplete,[],`${locale}/${theme}: complete inventory severity coverage`);
    }
    await page.locator('.tprm-tabs').getByRole('button',{name:locale==='tr'?'Risk Kuyruğu':'Risk Queue',exact:true}).click();
  }
  await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',coverage:'Actual UI with synthetic read-only vendor responses',checks},null,2));
  console.log('TPRM_POPULATED_CONTRAST_PASS',checks.length);
} finally {await browser.close();}
