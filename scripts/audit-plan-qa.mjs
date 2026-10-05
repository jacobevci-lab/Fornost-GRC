import {qaPassword} from './qa-credentials.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173',browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined}),ctx=await browser.newContext({viewport:{width:1536,height:960}}),page=await ctx.newPage();
let id;const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,await r.text());return r.json();}
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const name=`QA Audit Plan ${Date.now()}`;id=(await api('/api/audits','POST',{name,template:'Özel Denetim',auditOwner:'QA',auditor:'QA'},201)).id;
 const initial=await api(`/api/audits/plan?id=${id}`);assert.equal(initial.revision,'');
 await api('/api/audits/plan','PUT',{id,expectedRevision:'',plan:{...initial.plan,periodStart:'2026-02-30'}},400);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());await page.locator('.audit-card-open').filter({hasText:name}).click();
 const panel=page.locator('.audit-plan-panel');await panel.getByRole('button',{name:'Audit plan & scope',exact:true}).click();await expect(panel.getByLabel('Audit objective',{exact:true})).toBeEnabled();
 await panel.getByLabel('Audit objective',{exact:true}).fill('Validate control effectiveness across critical assets');await panel.getByLabel('Review period start',{exact:true}).fill('2026-01-01');await panel.getByLabel('Review period end',{exact:true}).fill('2026-12-31');
 await panel.getByRole('button',{name:'Save plan',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Saved:');const saved=await api(`/api/audits/plan?id=${id}`);assert.equal(saved.plan.objective,'Validate control effectiveness across critical assets');
 await api('/api/audits/plan','PUT',{id,expectedRevision:saved.revision,plan:{...saved.plan,lead:'Other reviewer'}});
 await panel.getByLabel('Audit objective',{exact:true}).fill('Retained local draft');await panel.getByRole('button',{name:'Save plan',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Plan changed');await expect(panel.getByLabel('Audit objective',{exact:true})).toHaveValue('Retained local draft');
 page.once('dialog',d=>d.accept());await panel.getByRole('button',{name:'Reload',exact:true}).click();await expect(panel.getByLabel('Lead auditor',{exact:true})).toHaveValue('Other reviewer');
 for(const theme of ['light','dark'])for(const width of [390,1536]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:960});assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await panel.getByLabel('Lead auditor',{exact:true}).fill('Unsaved lead');await panel.getByRole('button',{name:'Audit plan & scope',exact:true}).click();await panel.getByRole('button',{name:'Audit plan & scope',exact:true}).click();await expect(panel.getByLabel('Lead auditor',{exact:true})).toHaveValue('Unsaved lead');
 assert.deepEqual(errors,[]);console.log('AUDIT_PLAN_QA_PASS: real API save, date validation, revision conflict, draft preservation, reload, collapsed draft, both themes and responsive layouts');
}finally{await page.close();if(id)await api(`/api/audits?id=${id}`,'DELETE');await browser.close();}
