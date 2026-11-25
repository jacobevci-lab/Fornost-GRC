import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='control-business-impact-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function sql(statement){const file=`${out}/fixture.sql`;await fs.writeFile(file,statement);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
const workspace=page.locator('.control-assurance-workspace'),lens=workspace.locator('.control-impact-lens');
async function open(){
 await page.locator('nav button[aria-label="Control Library"]').evaluate(el=>el.click());
 const disclosure=page.locator('.module-analysis-disclosure').filter({has:workspace});if(!await disclosure.evaluate(el=>el.open))await disclosure.locator(':scope > summary').click();
 await expect(workspace.getByRole('button',{name:'Refresh assurance',exact:true})).toBeEnabled();
 await workspace.getByLabel('View',{exact:true}).selectOption('all');await workspace.getByLabel('Search controls').fill('QA BI control');
 await expect(workspace.locator('.control-assurance-list>article')).toHaveCount(1);await workspace.getByRole('button',{name:/^Review /}).click();await expect(lens).toBeVisible();
}
let seeded=false;
try{
 assert.equal((await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}})).status(),200);
 for(const path of ['/api/grc','/api/evidence-automation','/api/evidence/history','/api/findings'])assert.equal((await context.request.get(base+path)).status(),200);
 const stamp=new Date().toISOString(),records=[
 ['QA-BI-C','Kontroller',{controlRef:'QA-BI-C',controlTitle:'QA BI control',owner:'QA',testResult:'Failed'}],
 ['QA-BI-AUD','Denetim Yönetimi',{controlRef:'QA-BI-C',riskRef:'QA-BI-R',auditName:'QA BI audit'}],
 ['QA-BI-R','Risk Assessment',{title:'QA BI risk',asset:'QA-BI-A'}],
 ['QA-BI-A','Varlık Envanteri',{title:'QA BI shared name',owner:'Infrastructure'}],
 ['QA-BI-B','Varlık Envanteri',{title:'QA BI shared name',owner:'Other owner'}],
 ['QA-BI-P','BIA',{process:'QA BI payments',asset:'QA-BI-A',criticality:'Kritik',owner:'Payments owner',rto:2,rpo:0,mtpd:8}],
 ];
 seeded=true;await sql(records.map(([id,module,data])=>`INSERT INTO simple_grc_records VALUES(${q(id)},${q(module)},${q(JSON.stringify(data))},${q(stamp)},${q(stamp)});`).join('\n'));
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await open();
 await expect(lens).toContainText('1 assets · 1 processes · 1 critical processes');
 await lens.getByText('Potentially affected processes (1)',{exact:true}).click();await expect(lens).toContainText('Payments owner');await expect(lens).toContainText('RPO: 0 h');await expect(lens).toContainText('Via linked risk:');await expect(lens).toContainText('QA BI risk');
 for(const lang of ['EN','TR'])for(const theme of ['light','dark'])for(const width of [1536,390]){
  await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await page.setViewportSize({width,height:960});await lens.scrollIntoViewIfNeeded();assert.ok(await lens.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/${lang}-${theme}-${width}.png`});
 }
 await page.setViewportSize({width:1536,height:960});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await lens.getByRole('button',{name:/QA BI payments/}).click();await expect(page.locator('.core-record-focus')).toBeVisible();await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);await expect(page.locator('.table-card .table-wrap')).toContainText('QA BI payments');
 await open();await lens.getByText('Connected assets (1)',{exact:true}).click();await lens.getByRole('button',{name:/QA BI shared name/}).click();await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);await expect(page.locator('.table-card .table-wrap')).toContainText('Infrastructure');
 await sql(`UPDATE simple_grc_records SET data_json=${q(JSON.stringify({title:'QA BI risk',asset:'QA BI shared name'}))} WHERE id='QA-BI-R';`);
 await open();await expect(lens).toContainText('0 assets · 0 processes');await expect(lens.locator('.control-impact-warning')).toContainText('1 dependency references');
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',layouts:8,nativeNavigation:2,ambiguityExcluded:true}));
}finally{try{await page.close();if(seeded)await sql("DELETE FROM simple_grc_record_codes WHERE record_id GLOB 'QA-BI-*'; DELETE FROM simple_grc_records WHERE id GLOB 'QA-BI-*';");}finally{await browser.close()}}
