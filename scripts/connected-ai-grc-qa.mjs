import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='connected-ai-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let mode='complete';
const fixtures={
 '/api/ai/models':{models:[{id:'QA-AIM-1',systemName:'QA AI assistant',controls:'Free text is not a control link'}]},
 '/api/ai/assurance-alerts':{alerts:[{id:'QA-AIA-1',modelId:'QA-AIM-1',findingId:'QA-AIF-1',title:'QA AI drift alert'}]},
 '/api/ai/findings':{findings:[{id:'QA-AIF-1',modelId:'QA-AIM-1',title:'QA AI remediation'}]},
};
for(const [path,body] of Object.entries(fixtures)) await page.route(`**${path}`,route=>{
 if(path==='/api/ai/models'&&mode==='unavailable')return route.fulfill({status:503,json:{error:'QA source unavailable'}});
 if(path==='/api/ai/models'&&mode==='malformed')return route.fulfill({json:{models:[null]}});
 return route.fulfill({json:body});
});
async function openMap(){
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el=>el.click());
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-loading','false');
}
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 await openMap();
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-total','11');
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','11');
 await page.locator('.cg-filters input').fill('QA AI drift alert');
 await expect(page.locator('.cg-records>button')).toHaveCount(1);
 await expect(page.locator('.cg-connections article')).toHaveCount(2);
 await expect(page.locator('.cg-connections')).toContainText('QA AI remediation');
 await page.getByRole('button',{name:'Explore connections: QA AI assistant',exact:true}).click();
 await expect(page.locator('.cg-detail h3')).toHaveText('QA AI assistant');
 await expect(page.locator('.cg-connections article')).toHaveCount(2);
 for(const lang of ['EN','TR']){
  await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
  for(const theme of ['light','dark'])for(const width of [1536,390]){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
   await page.setViewportSize({width,height:960});
   assert.ok(await page.locator('.connected-grc').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.screenshot({path:`${out}/${lang}-${theme}-${width}.png`});
  }
 }
 await page.setViewportSize({width:1536,height:960});
 for(const failure of ['unavailable','malformed']){
  mode=failure;await openMap();
  await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','10');
  await page.locator('.connected-grc').getByRole('button',{name:/^Gaps/}).click();
  await page.locator('.connected-unresolved summary').click();
  await expect(page.locator('.connected-unresolved')).toContainText('QA-AIM-1');
 }
 mode='complete';await openMap();
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','11');
 for(const body of [{}, {findings:[{id:'duplicate'},{id:'duplicate'}]}]){
  await page.route('**/api/findings?view=graph*',route=>route.fulfill({json:body}));
  await openMap();
  await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','10');
  await expect(page.locator('.cg-export')).toContainText('partial');
  await page.locator('.connected-grc').getByRole('button',{name:/^Gaps/}).click();
  await expect(page.locator('.cg-assessment-pending').first()).toBeVisible();
  await page.unroute('**/api/findings?view=graph*');
 }
 await openMap();
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','11');
 let graphPages=0;
 const graphRows=Array.from({length:501},(_,i)=>({id:`QA-GRAPH-${String(i).padStart(6,'0')}`,title:i===500?'QA final paginated finding':`QA graph finding ${i}`}));
 await page.route('**/api/findings?view=graph*',route=>{
  const params=new URL(route.request().url()).searchParams;
  graphPages++;
  if(params.has('after')){
   assert.equal(params.get('after'),graphRows[499].id);
   assert.equal(params.get('revision'),'a'.repeat(32));
   return route.fulfill({json:{findings:graphRows.slice(500),revision:'a'.repeat(32),complete:true,nextCursor:null}});
  }
  return route.fulfill({json:{findings:graphRows.slice(0,500),total:501,revision:'a'.repeat(32),complete:false,nextCursor:graphRows[499].id}});
 });
 await openMap();
 await expect(page.locator('.cg-source-state')).toHaveAttribute('data-ready','11');
 assert.equal(graphPages,2);
 await page.locator('.cg-filters input').fill('QA final paginated finding');
 await expect(page.locator('.cg-records')).toContainText('QA final paginated finding');
 await page.unroute('**/api/findings?view=graph*');
 fixtures['/api/ai/assurance-alerts'].alerts.push(...Array.from({length:25},(_,i)=>({id:`QA-GAP-${String(i).padStart(3,'0')}`,modelId:`QA-MISSING-${i}`,title:`QA gap alert ${i}`})));
 await openMap();
 await page.locator('.connected-grc').getByRole('button',{name:/^Gaps/}).click();
 const gapSearch=page.locator('.cg-gap-filters input');
 await gapSearch.fill('QA gap alert');
 await page.getByLabel('Source module',{exact:true}).selectOption('AI Yönetişimi');
 await page.getByLabel('Issue type',{exact:true}).selectOption('missing');
 const gapDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export gaps · CSV',exact:true}).click();
 const exportFile=await gapDownload;
 assert.equal(exportFile.suggestedFilename(),'fornost-connected-grc-gaps.csv');
 const exported=await fs.readFile(await exportFile.path(),'utf8');
 assert.equal(exported.split('\n').length,26);
 assert.ok(exported.includes('QA-MISSING-24'));
 assert.ok(exported.includes('"AI Yönetişimi";"missing";"25"'));
 await page.getByLabel('Issue type',{exact:true}).selectOption('ambiguous');
 await expect(page.locator('.cg-gaps .cg-empty')).toContainText('No gaps match');
 await page.getByLabel('Issue type',{exact:true}).selectOption('missing');
 await page.locator('.connected-unresolved summary').click();
 await expect(page.locator('.connected-unresolved>div')).toHaveCount(20);
 await page.getByRole('button',{name:/Show more references/}).click();
 await expect(page.locator('.connected-unresolved>div')).toHaveCount(25);
 await gapSearch.fill('QA-GAP-024');
 await expect(page.locator('.connected-unresolved>div')).toHaveCount(1);
 await expect(page.locator('.connected-unresolved')).toContainText('QA-MISSING-24');
 await gapSearch.fill('QA-NO-SUCH-GAP');
 await expect(page.locator('.cg-gaps .cg-empty')).toContainText('No gaps match');
 await expect(page.locator('.cg-gaps .connected-assurance-ok')).toHaveCount(0);
 await page.locator('.cg-gap-filters').getByRole('button',{name:'Clear',exact:true}).click();
 await expect(gapSearch).toHaveValue('');
 await expect(page.getByLabel('Issue type',{exact:true})).toHaveValue('all');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('.cg-gaps').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:`${out}/gaps-filter-mobile.png`});
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',fixtureTransport:true,relationships:3,layouts:8,sourceRecovery:true}));
}finally{await browser.close();}
