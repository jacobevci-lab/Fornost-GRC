import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import writeExcelFile from 'write-excel-file/node';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='register-import-qa-artifacts',tag=`QA IMPORT ${Date.now()}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(15000);const errors=[],checks=[],cleanup=[];let auditId,userId;
page.on('pageerror',error=>errors.push(error.message));
async function api(path,method='GET',data,status=200,ctx=context){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,await r.text());return r.json();}
async function owned(){const data=await api('/api/grc');assert.equal(data.nextCursor,null);return data.rows.filter(row=>String(row.data_json).includes(tag));}
async function go(name){const nav=page.locator('#fornost-navigation'),mobile=page.locator('.mobile-nav-toggle');if(await mobile.isVisible()&&await mobile.getAttribute('aria-expanded')!=='true')await mobile.click();const target=nav.getByRole('button',{name,exact:true,includeHidden:true});if(!await target.isVisible())for(const group of await nav.locator('.nav-group').all())if(await group.getByRole('button',{name,exact:true,includeHidden:true}).count()){await group.locator('.nav-group-trigger').click();break;}await target.click();}
const dialog=()=>page.getByRole('dialog',{name:/^(Import Excel|Excel içe aktar)$/});
async function upload(matrix,name='register.xlsx'){
 const sheet=matrix.map(row=>row.map(value=>value===null?null:{value,...(value instanceof Date?{format:'yyyy-mm-dd'}:{})}));
 const buffer=await writeExcelFile(sheet).toBuffer();await dialog().locator('input[type=file]').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await expect(dialog().getByRole('status').filter({hasText:/Reading workbook|Dosya okunuyor/})).toHaveCount(0);
}
async function uploadRow(row){await upload([Object.keys(row),Object.values(row)]);}
async function openImport(locale='EN'){await page.getByRole('button',{name:locale==='TR'?'Excel İçe Aktar':'Import Excel',exact:true}).click();await expect(dialog()).toBeVisible();}
const validate=()=>dialog().getByRole('button',{name:'Validate preview',exact:true});
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await go('Risk Assessment');await openImport();
 const valid=[['title','','owner','asset','nextReview'],[`${tag} risk`,'','Import Owner','Import Asset',new Date('2026-11-20T00:00:00Z')]];
 await upload([['title','','owner'],['Bad','Unlabelled','Owner']]);await expect(dialog().getByRole('alert')).toContainText('no header');await expect(validate()).toBeDisabled();
 await upload([['title','title'],['One','Two']]);await expect(dialog().getByRole('alert')).toContainText('repeated');
 await upload([['title'],...Array.from({length:1001},(_,i)=>['Row '+i])]);await expect(dialog().getByRole('alert')).toContainText('1,000');
 await uploadRow({title:'x'.repeat(1001),owner:'Owner',asset:'Asset'});await expect(dialog().getByRole('alert')).toContainText('no data was truncated');await expect(validate()).toBeDisabled();
 await uploadRow({title:'Bad date',owner:'Owner',asset:'Asset',nextReview:'2026-02-31'});await expect(dialog().getByRole('alert')).toContainText('Invalid calendar date');
 await upload(valid);await dialog().locator('.mapping select').nth(1).selectOption('title');await expect(dialog().getByRole('alert')).toContainText('same field');await expect(validate()).toBeDisabled();
 await upload(valid);await dialog().locator('input[type=file]').setInputFiles({name:'broken.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not a workbook')});await expect(dialog().getByRole('alert')).toContainText('could not be read');await expect(dialog().locator('.mapping select')).toHaveCount(0);await expect(validate()).toBeDisabled();
 checks.push('blank/duplicate headers, 1001 rows, cell length, impossible date, duplicate mapping and failed-file stale state');
 await upload(valid);await expect(dialog().getByRole('region',{name:'Record preview'})).toContainText('Import Owner');await expect(dialog().getByRole('region',{name:'Record preview'})).toContainText('2026-11-20');const before=(await owned()).length;
 let failPreview=true,loseCommit=true,commitCalls=0;
 await page.route('**/api/grc',async route=>{const request=route.request();if(request.method()!=='POST')return route.continue();const body=request.postDataJSON();if(body.action==='preview-import'&&failPreview){failPreview=false;return route.fulfill({status:503,json:{error:'unavailable'}});}if(body.importId){commitCalls++;if(loseCommit){loseCommit=false;const response=await route.fetch();assert.equal(response.status(),201);return route.abort('failed');}}return route.continue();});
 await validate().click();await expect(dialog().getByRole('alert')).toContainText('could not be confirmed');await expect(validate()).toBeEnabled();await validate().click();await expect(dialog().getByRole('status')).toContainText('Server validation passed');assert.equal((await owned()).length,before,'preview must not write business records');
 await dialog().getByRole('button',{name:'Import 1 records',exact:true}).click({clickCount:2});await expect(dialog().getByRole('button',{name:'Retry the same import',exact:true})).toBeEnabled();assert.equal(commitCalls,1);assert.equal((await owned()).length,before+1);
 await dialog().getByRole('button',{name:'Retry the same import',exact:true}).click();await expect(dialog()).toHaveCount(0);assert.equal(commitCalls,2);assert.equal((await owned()).length,before+1);await page.unroute('**/api/grc');
 const imported=JSON.parse((await owned()).find(row=>JSON.parse(row.data_json).title===`${tag} risk`).data_json);assert.equal(imported.owner,'Import Owner');assert.equal(imported.asset,'Import Asset');assert.equal(imported.nextReview,'2026-11-20');
 checks.push('physical column/date preservation, read-only server preview, preview retry, double-click guard and lost-response replay without duplicates');
 const auditName=`${tag} audit`;auditId=(await api('/api/audits','POST',{name:auditName,catalogImport:{name:'Import fixture',version:'1',source:'https://example.com/qa',rightsConfirmed:true,requirements:[{ref:'IMPORT-BASE',title:'QA base requirement',category:'QA',statement:'Synthetic.'}]}},201)).id;
 await page.reload();await expect(page.locator('.shell')).toBeVisible();
 const cases=[
 ['Business Impact Analysis (BIA)',{process:`${tag} process`,processCategory:'Operations',businessUnit:'Ops',owner:'Ops',criticality:'High',asset:'Import Asset',rto:'2',rpo:'1',status:'Aktif'}],
 ['Asset Inventory',{title:`${tag} asset`,assetType:'Server',businessUnit:'Ops',owner:'Ops',criticality:'High',status:'Aktif'}],
 ['Compliance Management',{framework:'Custom',controlRef:'Import Control',controlTitle:`${tag} compliance`,owner:'Ops',status:'Uyumlu'}],
 ['Vendor Management',{title:`${tag} vendor`,service:'Service',owner:'Ops',criticality:'High',riskLevel:'Low',status:'Aktif'}],
 ['Control Library',{controlRef:'Import Control',controlTitle:`${tag} control`,owner:'Ops',frequency:'Yearly',implementation:'Uygulanıyor',status:'Aktif'}],
 ['Evidence Library',{evidenceTitle:`${tag} evidence`,controlRef:'Import Control',owner:'Ops',period:'2026',status:'Taslak'}],
 ['Audit Management',{auditName,auditType:'Internal',auditOwner:'Ops',startDate:'2026-01-01',endDate:'2026-12-31',requirementRef:'IMPORT-NEW',requirementTitle:`${tag} requirement`,owner:'Ops',businessUnit:'Ops',dueDate:'2026-12-01',status:'Başlanmadı',progress:'0'}],
 ];
 for(const [name,row] of cases){await go(name);if(name==='Audit Management'){await page.locator('.audit-card-open').filter({hasText:auditName}).click();await page.getByRole('tab',{name:/^Requirements and tests/}).click();}await openImport();await uploadRow(row);const count=(await owned()).length;await validate().click();await expect(dialog().getByRole('status')).toContainText('Server validation passed');assert.equal((await owned()).length,count);await dialog().getByRole('button',{name:'Import 1 records',exact:true}).click();await expect(dialog()).toHaveCount(0);assert.equal((await owned()).length,count+1);checks.push(name+': real workbook mapping, no-write preview and atomic creation');}
 await go('Risk Assessment');
 for(const locale of ['EN','TR']){
  await page.locator('.language-switch:visible').getByRole('button',{name:locale,exact:true}).click();await openImport(locale);await upload(valid);
  await dialog().getByRole('button',{name:locale==='TR'?'Önizlemeyi doğrula':'Validate preview',exact:true}).click();await expect(dialog().getByRole('status')).toContainText(locale==='TR'?'Sunucu doğruladı':'Server validation passed');
  for(const theme of ['light','dark'])for(const width of [1440,390]){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);assert.ok(await dialog().evaluate(el=>el.scrollWidth-el.clientWidth)<=2);const box=await dialog().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.deepEqual((await new AxeBuilder({page}).include('.register-import-modal').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);await page.screenshot({path:`${out}/${locale}-${theme}-${width}.png`,animations:'disabled'});}
  await dialog().locator('.mapping select').first().selectOption('');await expect(dialog().getByRole('button',{name:locale==='TR'?'Önizlemeyi doğrula':'Validate preview',exact:true})).toBeDisabled();await expect(dialog().getByRole('alert')).toContainText(locale==='TR'?'Zorunlu':'Required');await dialog().locator('.mapping select').first().press('Escape');await expect(dialog()).toHaveCount(0);await page.setViewportSize({width:1440,height:1000});
 }
 checks.push('TR/EN, both themes, desktop/mobile, keyboard Escape, accessible controls and mapping-change approval invalidation');
 const email=`qa-import-reader-${Date.now()}@fornost.test`;await api('/api/users','POST',{email,name:'QA Import Reader',role:'Viewer',password:qaPassword()},201);userId=(await api('/api/users')).users.find(u=>u.email===email).id;
 const reader=await browser.newContext();await api('/api/auth','POST',{action:'login',email,password:qaPassword()},200,reader);
 for(const payload of [{action:'preview-import'},{importId:crypto.randomUUID()}])await api('/api/grc','POST',{module:'Risk Assessment',rows:[{title:`${tag} denied`,owner:'Ops',asset:'Import Asset'}],...payload},403,reader);
 await reader.close();checks.push('read-only users cannot preview or commit by direct API request');
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks,errors},null,2));console.log('REGISTER_IMPORT_QA_PASS',checks.length);
}catch(error){await writeFile(`${out}/failure.json`,JSON.stringify({message:error.message,stack:error.stack,errors},null,2));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{
 await page.close();
 if(auditId)try{await api(`/api/audits?id=${auditId}`,'DELETE');cleanup.push('audit removed');}catch(e){cleanup.push('audit cleanup failed: '+e.message);}
 try{for(const row of await owned())await api(`/api/grc?id=${encodeURIComponent(row.id)}&expectedUpdatedAt=${encodeURIComponent(row.updated_at)}`,'DELETE');cleanup.push('imported records removed');}catch(e){cleanup.push('record cleanup failed: '+e.message);}
 if(userId)try{await api('/api/users','PATCH',{id:userId,role:'Viewer',status:'Disabled'});cleanup.push('reader disabled');}catch(e){cleanup.push('reader cleanup failed: '+e.message);}
 await writeFile(`${out}/cleanup.json`,JSON.stringify(cleanup));await browser.close();if(cleanup.some(item=>item.includes('failed')))throw new Error('Import QA cleanup failed');
}
