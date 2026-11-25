import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {qaPassword} from './qa-credentials.mjs';

const base='http://127.0.0.1:4173', owner='qa-admin@fornost.test';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1366,height:768}});
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
let auditId='';
const request=(path,data)=>context.request.fetch(base+path,{method:data?'POST':'GET',data,headers:{origin:base}});
try {
  assert.ok((await request('/api/auth',{action:'login',email:owner,password:qaPassword()})).ok());
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();
  await page.locator('nav button[aria-label="Denetim Yönetimi"]').evaluate(e=>e.click());
  await expect(page.locator('.audit-portfolio-kpis section')).toHaveCount(4);
  const first=page.getByRole('button',{name:'+ İlk Denetimi Başlat'});
  if(await first.isVisible())await first.click();else await page.getByRole('button',{name:'+ Yeni Denetim',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Denetim seç ve ekle'});
  const top=await modal.locator('.modal-head').boundingBox(),label=await modal.locator('label').first().boundingBox();
  assert.ok(top&&label&&label.y>=top.y+top.height-1,'first label clears the dialog header');
  const custom=modal.locator('.audit-catalog-drop');assert.equal(await custom.getAttribute('open'),null);
  await custom.locator('summary').first().click();
  const pack={name:'Audit engagement catalog',version:'1.0',source:'https://example.org/catalog',requirements:[{ref:'AC-1',category:'Access',title:'Review access',statement:'Verify the access review.'}]};
  await custom.evaluate((el,pack)=>{
    const files=new DataTransfer();files.items.add(new File([JSON.stringify(pack)],'catalog.json',{type:'application/json'}));
    el.querySelector('.audit-file-drop').dispatchEvent(new DragEvent('drop',{dataTransfer:files,bubbles:true,cancelable:true}));
  },pack);
  await custom.getByRole('checkbox').check();
  const name='Engagement '+Date.now();
  await modal.getByLabel('Denetim adı',{exact:true}).fill(name);
  await modal.getByLabel('Denetim türü',{exact:true}).selectOption('Gözetim Denetimi');
  await modal.locator('[name=periodStart]').fill('2026-07-01');await modal.locator('[name=periodEnd]').fill('2026-09-30');await modal.locator('[name=targetDate]').fill('2026-10-15');
  await modal.getByRole('combobox',{name:'Denetim sahibi',exact:true}).fill(owner);
  await modal.getByRole('option',{name:new RegExp(owner)}).click();
  const team=modal.getByRole('combobox',{name:'Denetçi / ekip'});await team.fill(owner);
  await expect(modal.getByText('Denetim sahibi ve denetçi farklı kişiler olmalı.')).toBeVisible();
  await team.fill('external@example.org');await modal.getByRole('option',{name:/external@example.org/}).click();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);
  const mutation=page.waitForResponse(r=>r.url().endsWith('/api/audits')&&r.request().method()==='POST');
  await modal.getByRole('button',{name:'Portföye Ekle',exact:true}).click();const result=await mutation;assert.equal(result.status(),201);auditId=(await result.json()).id;
  await expect(page.locator('.audit-detail-head')).toContainText(name);
  const plan=await (await request('/api/audits/plan?id='+auditId)).json();
  assert.deepEqual([plan.plan.periodStart,plan.plan.periodEnd,plan.plan.targetDate],['2026-07-01','2026-09-30','2026-10-15']);
  const invalid=await request('/api/audits',{name:name+' SoD',auditType:'İç Denetim',auditOwner:owner,auditor:owner.toUpperCase(),periodStart:'',periodEnd:'',targetDate:''});
  assert.equal(invalid.status(),400);assert.equal((await invalid.json()).error,'audit-team');
  await page.locator('button[data-requirement-id]').first().click();
  await expect(page.getByRole('button',{name:'Çalışma Kâğıdı / Test Sonucu',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Kanıt Talep Et (PBC)',exact:true}).click();
  await expect(page.locator('.audit-item-desk .audit-request-panel')).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('AUDIT_ENGAGEMENT_PASS: localized catalog drop, dates, owner and external team, server SoD, PBC workspace and mobile dialog');
} finally {
  if(auditId)await context.request.delete(base+'/api/audits?id='+auditId,{headers:{origin:base}});
  await browser.close();
}
