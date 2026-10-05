import {qaPassword} from './qa-credentials.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173',browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined}),ctx=await browser.newContext({viewport:{width:1536,height:960}}),page=await ctx.newPage();
const ids=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,(await r.text()).slice(0,400));return r.json();}
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 for(const [template,count] of [['NIST SP 800-53 Rev. 5 (5.2.0)',1014],['ISO/IEC 27001:2022',123],['SOC 2 Type I',61]]){
  const name=`QA Packs ${template} ${Date.now()}`;const result=await api('/api/audits','POST',{name,template},201);ids.push(result.id);assert.equal(result.insertedRequirements,count);
  const all=(await api('/api/grc')).rows.map(r=>({...r,data:JSON.parse(r.data_json)}));const rows=all.filter(r=>r.data.auditName===name);assert.equal(rows.length,count);assert.equal(new Set(rows.map(r=>r.data.requirementRef)).size,count);
  if(template.startsWith('NIST')){const row=rows.find(r=>r.data.requirementRef==='AC-1');assert.ok(row.data.requirementStatement.length>1000);const statement=row.data.requirementStatement;await api('/api/grc','PUT',{id:row.id,data:{...row.data,auditOwner:'QA owner'}});const saved=(await api('/api/grc')).rows.find(r=>r.id===row.id);assert.equal(JSON.parse(saved.data_json).requirementStatement,statement);
   await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());await page.locator('.audit-card-open').filter({hasText:name}).click();await expect(page.getByText('Requirement and assessment details',{exact:true}).first()).toBeVisible();await page.getByText('Requirement and assessment details',{exact:true}).first().click();await expect(page.getByText('Catalog source',{exact:true}).first()).toBeVisible();
  }
  if(template==='SOC 2 Type I'){assert.ok(rows.some(r=>r.data.requirementRef==='P8.1'));assert.ok(rows.every(r=>r.data.typeIITestApproach.includes('tarih itibarıyla')));}
  await api('/api/audits');assert.equal((await api('/api/grc')).rows.filter(r=>JSON.parse(r.data_json).auditName===name).length,count);
 }
 const catalogImport={name:'Private licensed pack',version:'2026',source:'https://example.com/standard',rightsConfirmed:true,requirements:[{ref:'A.1',title:'Approved access',category:'Access',statement:'Check the approval and current grants.'}]};
 await api('/api/audits','POST',{name:'QA invalid rights',catalogImport:{...catalogImport,rightsConfirmed:false}},400);
 const custom=await api('/api/audits','POST',{name:`QA import ${Date.now()}`,catalogImport},201);ids.push(custom.id);assert.equal(custom.insertedRequirements,1);
 assert.deepEqual(errors,[]);console.log('Framework packs: full NIST 1014, ISO 123, SOC 61, text edit preservation, read stability, import validation and browser details passed.');
}finally{for(const id of ids.reverse())await api(`/api/audits?id=${id}`,'DELETE');await browser.close();}
