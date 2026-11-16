import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {qaPassword} from './qa-credentials.mjs';
import {openAuditSection} from './audit-workspace-navigation.mjs';
const base='http://127.0.0.1:4173',out='audit-three-views-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1672,height:941}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,path+' '+(await r.text()).slice(0,150));return r.json();}
async function module(){await page.locator('nav button[aria-label="Audit Management"]').evaluate(e=>e.click());}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'page overflow '+name);}
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const reviewer='audit-views-reviewer@fornost.test';
 await api('/api/users','POST',{name:'Audit QA Reviewer',email:reviewer,role:'Editor',password:qaPassword()},201);
 const name='QA Three Views '+Date.now(),a=await api('/api/audits','POST',{name,template:'Özel Denetim',auditOwner:'Infosec',auditor:'Internal Audit'},201);
 const titles=['Erişim kontrolü','Yedekleme','Log yönetimi','Tedarikçi güvenliği','Güvenlik politikaları','Varlık envanteri'];
 const ids=[];
 for(const [i,title]of titles.entries()){
  const row=await api('/api/grc','POST',{module:'Denetim Yönetimi',data:{auditName:name,auditType:'Diğer Denetim',auditOwner:'Infosec',startDate:'2026-11-01',endDate:'2026-11-30',dueDate:i===1?'2020-01-01':'2099-11-30',businessUnit:'Bilgi Güvenliği',requirementRef:'A.5.'+(i+1),requirementTitle:title,owner:i%2?'SOC':'Infosec',status:i===5?'Tamamlandı':'Başlanmadı',progress:i===5?100:0,evidenceStatus:'Kanıt Bekleniyor'}},201);ids.push(row.id);
 }
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await module();
 await page.locator('.apw-select').filter({hasText:name}).click();
 await expect(page.getByRole('button',{name:'Audit actions',exact:true})).toBeVisible();
 await page.locator('.apw-inspector').getByRole('button',{name:'Open audit',exact:false}).click();
 const workspace=page.locator('.audit-workspace-v2');await expect(workspace.getByRole('tab')).toHaveCount(4);
 await workspace.locator('.ad-requirement-link').filter({hasText:'Erişim kontrolü'}).click();
 await expect(workspace.locator('.ad-detail')).toContainText('Erişim kontrolü');
 await page.getByRole('button',{name:'Test and review',exact:true}).click();
 // The visible workpaper component is the canonical editor; no separate test draft is created by a view.
 const newPaper=page.getByRole('button',{name:'New workpaper',exact:true});await expect(newPaper).toBeEnabled();await newPaper.click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Erişim kontrolü');
 for(const label of ['Test objective','Test steps','Population and source','Sampling rationale'])await page.getByLabel(label,{exact:true}).fill('QA verified '+label);
 await page.getByLabel('Independent reviewer',{exact:true}).selectOption(reviewer);
 await page.getByRole('button',{name:'Back to workspace',exact:true}).click();
 for(const view of ['Guide','Board','Desk'])await workspace.getByRole('button',{name:view,exact:true}).click();
 await page.getByRole('button',{name:'Return to draft',exact:true}).click();await expect(page.getByLabel('Test objective',{exact:true})).toHaveValue('QA verified Test objective');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.locator('.aw-detail')).toBeVisible();
 const saved=(await api(`/api/audits/workpapers?auditId=${a.id}`)).papers;assert.equal(saved.length,1);assert.equal(saved[0].requirementId,ids[0]);
 await openAuditSection(page,'desk');
 for(const language of ['EN','TR']){
  await page.locator('.language-switch:visible').getByRole('button',{name:language,exact:true}).click();
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const [index,label]of (language==='TR'?['Masa','Rehber','Pano']:['Desk','Guide','Board']).entries()){
    await workspace.getByRole('button',{name:label,exact:true}).click();
    await shot(`${language}-${theme}-${index}`);
   }
  }
 }
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 for(const width of [390,768]){await page.setViewportSize({width,height:900});for(const mode of ['Desk','Guide','Board']){await workspace.getByRole('button',{name:mode,exact:true}).click();await shot(`responsive-${width}-${mode}`);}}
 await page.setViewportSize({width:1672,height:941});await page.evaluate(()=>document.documentElement.dataset.theme='light');await workspace.getByRole('button',{name:'Desk',exact:true}).click();
 await workspace.getByLabel('Search requirements',{exact:true}).fill('Yedekleme');await expect(workspace.locator('.ad-list tbody tr')).toHaveCount(1);
 await workspace.getByRole('button',{name:'Board',exact:true}).click();await expect(workspace.locator('.ad-lane article')).toHaveCount(1);
 await workspace.getByRole('button',{name:'Clear',exact:true}).click();await workspace.getByRole('button',{name:'Desk',exact:true}).click();
 await workspace.getByRole('tab',{name:'Workspace',exact:true}).press('ArrowRight');await expect(workspace.getByRole('tab',{name:'Evidence requests',exact:true})).toBeFocused();await workspace.getByRole('tab',{name:'Evidence requests',exact:true}).press('Home');
 const a11y=await new AxeBuilder({page}).include('.audit-workspace-v2').analyze();assert.deepEqual(a11y.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id),[]);
 await page.locator('.audit-detail-head').getByRole('button',{name:'Audit actions',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Audit actions',exact:true});await expect(dialog).toContainText('Workpapers (1)');await expect(dialog.getByRole('button',{name:'Delete Audit',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Archive in portfolio',exact:true}).click();await expect(dialog).not.toBeVisible();
 assert.equal((await api('/api/audits')).audits.find(r=>r.id===a.id).archived,true);
 await page.locator('.audit-back').click();await page.getByRole('button',{name:/^Archive \(/}).click();await page.locator('.apw-select').filter({hasText:name}).click();await page.locator('.apw-inspector').getByRole('button',{name:'Audit actions',exact:true}).click();await dialog.getByRole('button',{name:'Restore to portfolio',exact:true}).click();
 assert.equal((await api('/api/audits')).audits.find(r=>r.id===a.id).archived,false);
 // Create and delete only this isolated disposable audit through the visible UI.
 await page.getByRole('button',{name:'Portfolio',exact:true}).click();await page.getByRole('button',{name:'+ New Audit',exact:true}).click();
 const picker=page.locator('.audit-picker');await picker.getByLabel('Template / option',{exact:true}).selectOption('Custom Audit');await picker.getByLabel('Audit name',{exact:true}).fill('Disposable audit QA');await picker.getByRole('button',{name:'Add to Portfolio',exact:true}).click();
 await expect(page.locator('.audit-detail-head')).toContainText('Disposable audit QA');await page.locator('.audit-detail-head').getByRole('button',{name:'Audit actions',exact:true}).click();
 await expect(dialog).toContainText('0 requirements');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Delete Audit',exact:true}).click();await expect(page.locator('.apw')).toBeVisible();
 assert.equal((await api('/api/audits')).audits.some(r=>r.name==='Disposable audit QA'),false);
 await fs.writeFile(`${out}/result.json`,JSON.stringify({passed:true,checks:['three views','shared selection/filters','linked workpaper save','draft retention','archive/restore','UI create/delete','blocked deletion','TR/EN light/dark','390/768 responsive','keyboard','axe serious/critical'],errors},null,2));assert.deepEqual(errors,[]);
 console.log('AUDIT_THREE_VIEWS_QA_PASS');
}catch(e){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
