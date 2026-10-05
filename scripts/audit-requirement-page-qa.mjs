import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined}),context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();
const ids=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status);return r.json();}
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const name=`QA Paged Audit ${Date.now()}`;
 const catalogImport={name:'QA page fixture',version:'1',source:'https://example.com/qa',rightsConfirmed:true,requirements:Array.from({length:121},(_,i)=>({ref:`QA-PAGE-${String(i+1).padStart(3,'0')}`,title:`${i<61?'Alpha':'Beta'} requirement ${i+1}`,category:'QA',statement:'Synthetic QA requirement.'}))};
 ids.push((await api('/api/audits','POST',{name,catalogImport},201)).id);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());
 await page.locator('.audit-card-open').filter({hasText:name}).click();
 const table=page.locator('.audit-requirements-register'),pager=table.locator('.audit-requirement-pager'),rows=table.locator('tbody tr'),search=table.getByRole('textbox',{name:'Search records',exact:true});
 await expect(rows).toHaveCount(50);await expect(pager.getByRole('status')).toHaveText('1–50 / 121 requirements');
 await pager.getByRole('button',{name:'Last',exact:true}).click();await expect(rows).toHaveCount(21);
 await expect(pager.getByRole('status')).toHaveText('101–121 / 121 requirements');
 await search.fill('QA-PAGE-121');await expect(rows).toHaveCount(1);await expect(rows).toContainText('QA-PAGE-121');
 await search.fill('Alpha');await expect(rows).toHaveCount(50);await expect(pager.getByRole('status')).toHaveText('1–50 / 61 requirements');
 const [download]=await Promise.all([page.waitForEvent('download'),pager.getByRole('button',{name:'Export results (61)',exact:true}).click()]);
 const csv=await fs.readFile(await download.path(),'utf8');assert.equal(new Set(csv.match(/QA-PAGE-\d+/g)||[]).size,61,'Export must include every filtered requirement');assert.equal(csv.trim().split('\n').length,62,'Header plus 61 fixture rows, with no duplicate rows');
 await table.getByRole('button',{name:'Filters',exact:true}).click();
 const status=table.getByLabel('Status',{exact:true});const statusOptions=await status.locator('option').allTextContents();
 await status.selectOption('Başlanmadı');
 await search.fill('unmatched-qa-term');await expect(table.getByText('No requirements match your search or filters.',{exact:true})).toBeVisible();await expect(pager.getByRole('button',{name:'Export results (0)',exact:true})).toBeDisabled();assert.deepEqual(await status.locator('option').allTextContents(),statusOptions,'Filter choices must survive an empty search');
 await table.getByRole('button',{name:'Clear search and filters',exact:true}).click();await expect(rows).toHaveCount(50);await expect(status).toHaveValue('');
 await pager.getByLabel('Per page',{exact:true}).selectOption('100');await expect(rows).toHaveCount(100);
 for(const theme of ['light','dark'])for(const width of [1536,390]){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:960});assert.ok(await pager.evaluate(el=>el.scrollWidth-el.clientWidth)<=1);}
 await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();await expect(pager.getByRole('status')).toHaveText('1–100 / 121 madde');
 assert.deepEqual(errors,[]);console.log('AUDIT_REQUIREMENT_PAGE_PASS: 121 real requirements, last page, off-page search, filter reset, 61-row cross-page CSV export, empty recovery, size selection and bilingual responsive pager.');
}finally{await page.close();for(const id of ids)await api(`/api/audits?id=${id}`,'DELETE');await browser.close();}
