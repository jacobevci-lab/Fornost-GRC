import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { qaPassword } from './qa-credentials.mjs';

// Transport fixtures in the isolated browser. No credentials are saved and no collector is called.
const base = 'http://127.0.0.1:4173';
const out = 'layout-qa-artifacts/evidence-workspace';
await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH || undefined});
const context = await browser.newContext({viewport:{width:1440,height:960}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const login = await context.request.post(base+'/api/auth',{
    headers:{origin:base}, data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()},
  });
  assert.equal(login.status(),200);
  const t='2026-11-08T09:00:00.000Z', later='2026-11-09T09:00:00.000Z';
  const source={id:'qa-source',name:'Microsoft Intune',vendor:'Microsoft',enabled:true,driver:'provider-v1',config:{providerId:'intune',dataset:'managed-devices'},lastTestStatus:'success',lastTestAt:t};
  const rule={id:'qa-rule',name:'QA device encryption',sourceId:source.id,controlRefs:'A.8.24',enabled:true,freshness:'stale',lastStatus:'error',lastErrorCode:'PERMISSION_DENIED',lastRunId:'qa-error',lastRunAt:later,lastEvidenceAt:t,evidenceRunId:'qa-proof'};
  const run={id:'qa-proof',ruleId:rule.id,ruleName:rule.name,sourceName:source.name,status:'fail',score:50,detail:'1 of 2 failed',createdAt:t,triggerType:'manual',durationMs:25,errorCode:null,evidenceId:'qa-evidence',evidenceState:'available',assessment:{templateId:'intune-encryption',templateVersion:1,status:'fail',total:2,passed:1,failed:1,unknown:0,score:50,evaluatedAt:t,scope:'credential-visible',issues:[{id:'d1',name:'QA-DEVICE-01',status:'fail',reason:'not-encrypted'}],issuesTruncated:false}};
  const failedCollection={...run,id:'qa-error',status:'error',score:0,detail:'Permission denied',createdAt:later,errorCode:'PERMISSION_DENIED',assessment:null,evidenceId:null,evidenceState:'none'};
  let populated=false;
  await page.route('**/api/evidence-automation', route=>route.fulfill({json:{sources:populated?[source]:[],rules:populated?[rule]:[],runs:[],findings:[]}}));
  await page.route('**/api/evidence-automation?runId=*',route=>{
    const id=new URL(route.request().url()).searchParams.get('runId');
    return route.fulfill({json:{run:id==='qa-proof'?run:failedCollection}});
  });
  await page.goto(base);
  await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  const open = () => page.locator('nav button[aria-label="Evidence Automation"]').evaluate(button=>button.click());
  await open();
  const picker=page.locator('.ew-picker');
  await expect(picker).toBeVisible();
  await picker.getByRole('button',{name:/Configure connection/}).click();
  await expect(page.getByLabel('Connector template',{exact:true})).toHaveValue('Microsoft Intune');
  await page.getByRole('button',{name:'Close wizard',exact:true}).click();
  await picker.getByRole('searchbox').fill('sonar');
  await expect(picker.locator('.ew-detail h3')).toContainText('SonarQube');
  await picker.getByRole('searchbox').fill('');
  await page.screenshot({path:out+'/first-source.png'});
  await picker.getByRole('button',{name:/Browse full catalog/}).click();
  await expect(page.locator('.ea-catalog')).toBeVisible();
  populated=true;
  await page.reload(); await open();
  await expect(page.locator('.ew-notice')).toContainText('Collection failed');
  await expect(page.locator('.ew-chain')).toContainText(rule.name);
  await page.locator('.ew-chain').getByRole('button',{name:/Inspect run evidence/}).click();
  await expect(page.locator('.ea-modal')).toContainText('QA-DEVICE-01');
  await expect(page.locator('.ea-modal').getByRole('button',{name:'Open Evidence',exact:true})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.ea-modal')).toHaveCount(0);
  await page.screenshot({path:out+'/sources.png'});
  await page.locator('.ew-chain').getByRole('button',{name:/QA device encryption/}).click();
  await expect(page.locator('.ew-selected')).toContainText('Run error');
  await expect(page.locator('.ew-expanded')).toContainText('No evidence was recorded');
  Object.assign(rule,{lastRunId:'qa-proof',lastStatus:'fail',lastRunAt:t,lastErrorCode:null});
  await page.reload(); await open();
  await page.locator('.ea-tabs').getByRole('button',{name:'Continuous Controls',exact:true}).click();
  await page.getByRole('button',{name:/QA device encryption/}).click();
  await expect(page.locator('.ew-selected')).toContainText('Failed');
  await expect(page.locator('.ew-expanded')).toContainText('QA-DEVICE-01');
  await page.screenshot({path:out+'/controls.png'});
  await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();
  await page.locator('.theme-toggle:visible').click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.ew-selected')).toContainText('Başarısız');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);
  await page.screenshot({path:out+'/controls-mobile.png'});
  await page.locator('.ew-expanded').getByRole('button',{name:/Kanıtı aç/}).click();
  await expect(page.locator('nav button.active[aria-label="Kanıt Kütüphanesi"]')).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('EVIDENCE_WORKSPACE_PASS: first source, selected wizard, catalog, prior evidence, error vs failed result, evidence navigation, mobile and TR/EN');
} catch(error) {
  await page.screenshot({path:out+'/failure.png'}).catch(()=>{});
  throw error;
} finally { await browser.close(); }
