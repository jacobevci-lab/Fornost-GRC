import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { qaPassword } from './qa-credentials.mjs';

const base = 'http://127.0.0.1:4173';
const out='layout-qa-artifacts/audit-portfolio';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:950}});
const page=await context.newPage();
const errors=[], audits=[];
page.on('pageerror',e=>errors.push(e.message));
async function api(path, method='GET', data) {
  const response=await context.request.fetch(base+path,{method,headers:{origin:base},data});
  assert.ok(response.ok(),path+' '+response.status()+' '+(await response.text()).slice(0,250));
  return response.json();
}
try{
  await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
  await api('/api/evidence-automation');
  const stamp=Date.now();
  const a='ISO 27001 İç Denetimi '+stamp, b='Tedarikçi Erişim Denetimi '+stamp;
  for(const [name,owner] of [[a,'İç Denetim Ekibi'],[b,'Satın Alma']]){
    const audit=await api('/api/audits','POST',{name,template:'Özel Denetim',auditOwner:owner,auditor:'QA',auditType:'Diğer Denetim'});
    audits.push(audit.id);
  }
  const create=(auditName,requirementTitle,owner,ref,status,dueDate)=>api('/api/grc','POST',{module:'Denetim Yönetimi',data:{
    auditName,auditType:'Diğer Denetim',auditOwner:'QA',startDate:'2026-01-01',endDate:'2026-12-31',dueDate,domain:'Bilgi Güvenliği',
    requirementRef:ref,requirementTitle,owner,status,progress:0,evidenceStatus:'Kanıt Bekleniyor',
  }});
  await create(a,'Erişim kontrolü','IAM Ekibi','PORT-A1','Başlanmadı','2020-06-01');
  await create(a,'Kapanan madde','QA','PORT-A2','Tamamlandı','2020-06-01');
  const br=await create(b,'Tedarikçi yetkileri','Satın Alma','PORT-B1','Başlanmadı','2099-12-01');
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();
  await page.locator('nav button[aria-label="Denetim Yönetimi"]').evaluate(el=>el.click());
  const select=name=>page.locator('.apw-select').filter({hasText:name}).click();
  const panel=page.locator('.apw-inspector');
  await select(a);
  await expect(panel).toContainText('1 / 2 madde kapalı');
  await expect(panel).toContainText('0 / 2 referans güncel');
  await expect(panel.locator('.apw-table')).toContainText('IAM Ekibi');
  await expect(panel.locator('.apw-table')).not.toContainText('Kapanan madde');
  await page.screenshot({path:out+'/selected-audit-tr.png'});
  const path='**/api/audits/readiness?auditName='+encodeURIComponent(b);
  let fail=true;
  await page.route(path,route=> fail?route.fulfill({status:503,json:{error:'isolated failure'}}):route.continue());
  await select(b);await expect(panel).toContainText('Hazırlık doğrulanamadı');
  await expect(panel).not.toContainText('0 / 2 referans');
  fail=false;await panel.getByRole('button',{name:'Yeniden dene',exact:true}).click();
  await expect(panel).toContainText('0 / 1 referans güncel');await expect(panel).toContainText('0 / 1 madde kapalı');
  await page.locator('.apw-index input').fill('no-such-audit');await expect(panel).toContainText('Denetim bulunamadı');
  await page.locator('.apw-index input').fill('');await select(b);
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('.theme-toggle:visible').click();await page.setViewportSize({width:390,height:844});
  await expect(panel).toContainText('0 / 1 references current');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=4);
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/mobile-dark.png'});
  await panel.getByRole('button',{name:'Tedarikçi yetkileri',exact:true}).click();
  await expect(page.getByRole('region',{name:'Record table',exact:true})).toContainText('Tedarikçi yetkileri');
  assert.ok(br.id);assert.deepEqual(errors,[]);
  console.log('AUDIT_PORTFOLIO_PASS: two real audits, independent counts, unavailable scope and retry, search, exact requirement, mobile, dark, TR/EN');
} catch(e) {
  await page.screenshot({path:out+'/failure.png'}).catch(()=>{});
  throw e;
} finally {
  for(const id of audits) await context.request.delete(base+'/api/audits?id='+encodeURIComponent(id),{headers:{origin:base}}).catch(()=>{});
  await browser.close();
}
