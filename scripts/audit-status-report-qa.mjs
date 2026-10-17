import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const base='http://127.0.0.1:4173',browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext({viewport:{width:1536,height:960}}),reader=await browser.newContext(),page=await admin.newPage();
const errors=[],tag=Date.now(),audits=[],accounts=[],directory='audit-status-report-qa-artifacts';
page.on('pageerror',e=>errors.push(e.message));
async function api(context,path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,await r.text());return r.json();}
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value)??'null';
try{
  await mkdir(directory,{recursive:true});await api(admin,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
  const email=`audit-report-editor-${tag}@fornost.test`;
  await api(admin,'/api/users','POST',{email,name:'QA Report Editor',role:'Editor',password:qaPassword()},201);
  accounts.push((await api(admin,'/api/users')).users.find(u=>u.email===email).id);
  await api(reader,'/api/auth','POST',{action:'login',email,password:qaPassword()});
  const name=`QA Audit Report ${tag}`,otherName=`QA Report Other ${tag}`;
  for(const auditName of [name,otherName])audits.push((await api(admin,'/api/audits','POST',{name:auditName,template:'Özel Denetim',auditOwner:'QA Report Owner',auditor:'QA Reviewer'},201)).id);
  const auditId=audits[0],endpoint=`/api/audits/reports?auditId=${auditId}`;
  // Initialize source tracking before exercising existing import/request writers.
  await api(admin,endpoint+'&preview=1');
  const requirement=i=>({auditName:name,auditType:'Internal',auditOwner:'QA',startDate:'2026-10-01',endDate:'2026-10-31',requirementRef:`QA-${i}`,requirementTitle:`Ödeme kontrolü ${i}`,owner:'Çağrı',businessUnit:'Finance',dueDate:'2026-10-30',status:'İncelemede',progress:40,requirementStatement:'Confirm approvals and independent access review.'});
  await api(admin,'/api/grc','POST',{module:'Denetim Yönetimi',rows:Array.from({length:25},(_,i)=>requirement(i))},201);
  await api(admin,'/api/audits/requests','POST',{auditId,action:'create',requestId:`ARQ-report-${tag}`,expectedRevision:'',fields:{title:'Report evidence request',instructions:'Review all privileged users and confirm the approver.',owner:'qa-admin@fornost.test',reviewer:email,dueDate:'2026-10-29',reviewDueDate:'2026-10-30',periodStart:'',periodEnd:''}});
  let preview=await api(admin,endpoint+'&preview=1');const first=preview.items.find(i=>i.kind==='requirement');
  const dueDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const finding=sourceRef=>({action:'create',sourceType:'audit',sourceRef,sourceTitle:'QA audit report scope',findingType:'observation',title:`Report scope finding ${sourceRef}`,description:'Independent audit observation awaiting an assigned action.',severity:'medium',owner:email,reviewer:'qa-admin@fornost.test',rootCause:'The periodic review was not completed.',correctiveAction:'Complete and document the missing independent review.',preventiveAction:'Schedule an independent review for every reporting period.',dueDate});
  for(const ref of [auditId,first.record.code,name])await api(admin,'/api/findings','POST',finding(ref),201);
  preview=await api(admin,endpoint+'&preview=1');assert.equal(preview.items.filter(i=>i.kind==='finding').length,2);
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());await page.locator('.audit-card-open').filter({hasText:name}).click();
  await page.getByRole('tab',{name:'Reports',exact:true}).click();const panel=page.locator('.audit-status-report');
  await panel.getByRole('button',{name:'Preview new report',exact:true}).click();await expect(panel.locator('.asr-preview')).toContainText('25 requirements');
  const reportTitle='İstanbul kontrol değerlendirmesi',summary='The assessment remains open. <script>window.reportInjected=true</script> All findings retain their owners.';
  await panel.getByLabel('Report title',{exact:true}).fill(reportTitle);await panel.getByLabel('Preparer summary',{exact:true}).fill(summary);
  await panel.getByLabel('Limitations and notes (optional)',{exact:true}).fill('=HYPERLINK("https://invalid.test")');
  let plan=await api(admin,`/api/audits/plan?id=${auditId}`);plan=await api(admin,'/api/audits/plan','PUT',{id:auditId,expectedRevision:plan.revision,plan:{...plan.plan,scope:'Scope changed during preview'}});
  await panel.getByRole('button',{name:'Save report snapshot',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Report sources changed');
  await expect(panel.getByRole('button',{name:'Save report snapshot',exact:true})).toBeDisabled();
  // Hold the replacement response: old preview controls must not accept input
  // that would be discarded when its source-revision key changes.
  let releaseReload;const reloadBarrier=new Promise(resolve=>{releaseReload=resolve;});
  await page.route('**/api/audits/reports?**preview=1',async route=>{const response=await route.fetch();await reloadBarrier;await route.fulfill({response});});
  await panel.getByRole('button',{name:'Reload report preview',exact:true}).click();
  await expect(panel).toHaveAttribute('aria-busy','true');
  await expect(panel.locator('.asr-preview .asr-source')).toHaveAttribute('inert','');
  assert.equal(await panel.locator('.asr-preview .asr-items > summary').evaluate(node=>{node.focus();return document.activeElement===node;}),false,'Reloading preview does not accept keyboard focus on stale records');
  await expect(panel.getByLabel('Preparer summary',{exact:true})).toBeDisabled();
  releaseReload();await expect(panel).toHaveAttribute('aria-busy','false');await page.unroute('**/api/audits/reports?**preview=1');
  await expect(panel.locator('.asr-preview .asr-source')).not.toHaveAttribute('inert','');
  await expect(panel.getByLabel('Preparer summary',{exact:true})).toHaveValue(summary);
  await panel.locator('.asr-preview .asr-items > summary').click();await panel.getByLabel('Record type',{exact:true}).selectOption('requirement');
  await expect(panel.locator('.asr-items li')).toHaveCount(20);await panel.locator('.asr-items').getByRole('button',{name:'Next',exact:true}).click();await expect(panel.locator('.asr-items li')).toHaveCount(5);
  let release,posts=0,submitted;const barrier=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/audits/reports',async route=>{if(route.request().method()==='POST'){posts++;submitted=route.request().postDataJSON();const response=await route.fetch();await barrier;await route.fulfill({response});}else await route.continue();});
  const save=panel.getByRole('button',{name:'Save report snapshot',exact:true});await save.click();await expect(save).toBeDisabled();await save.dispatchEvent('click');await expect.poll(()=>posts).toBe(1);release();
  await expect(panel.locator('.asr-saved')).toContainText('Saved report SHA-256 verified');await page.unroute('**/api/audits/reports');
  assert.equal((await api(admin,'/api/audits/reports','POST',submitted)).id,submitted.reportId);assert.equal((await api(admin,endpoint)).reports.length,1);
  const saved=await api(admin,endpoint+`&reportId=${submitted.reportId}`);assert.equal(saved.sha256,createHash('sha256').update(canonical(saved.snapshot)).digest('hex'));assert.equal(saved.snapshot.items.length,28);assert.equal(saved.snapshot.plan.plan.scope,'Scope changed during preview');
  const response=await admin.request.get(base+endpoint+`&reportId=${submitted.reportId}&download=1`);assert.equal(response.status(),200);assert.match(response.headers()['content-disposition'],/^attachment;/);assert.deepEqual(await response.json(),saved);
  for(const path of [endpoint,endpoint+'&preview=1',endpoint+`&reportId=${submitted.reportId}`,endpoint+`&reportId=${submitted.reportId}&download=1`])await api(reader,path,'GET',undefined,403);
  await api(reader,'/api/audits/reports','POST',submitted,403);await api(admin,`/api/audits/reports?auditId=${audits[1]}&reportId=${submitted.reportId}`,'GET',undefined,404);
  for(const format of ['HTML','PDF','CSV']){const event=page.waitForEvent('download');await panel.getByRole('button',{name:`${format} download`,exact:true}).click();const download=await event;await download.saveAs(`${directory}/report.${format.toLowerCase()}`);}
  const html=await readFile(`${directory}/report.html`,'utf8'),csv=await readFile(`${directory}/report.csv`,'utf8'),pdf=await PDFDocument.load(await readFile(`${directory}/report.pdf`));
  assert.match(html,/Ödeme kontrolü 24/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(csv,/"'=HYPERLINK/);assert.ok(pdf.getPageCount()>3);assert.equal(await page.evaluate(()=>window.reportInjected),undefined);
  await api(admin,'/api/audits/plan','PUT',{id:auditId,expectedRevision:plan.revision,plan:{...plan.plan,scope:'Scope changed after reporting'}});
  const added=await api(admin,'/api/grc','POST',{module:'Denetim Yönetimi',data:requirement(25)},201);
  const addedRow=(await api(admin,endpoint+'&preview=1')).items.find(i=>i.id===added.id).record;
  const edited=await api(admin,'/api/grc','PATCH',{id:added.id,expectedUpdatedAt:addedRow.updatedAt,data:{...requirement(25),requirementTitle:'Edited after reporting'}});
  await api(admin,'/api/grc','PATCH',{id:added.id,expectedUpdatedAt:addedRow.updatedAt,data:requirement(25)},409);
  await api(admin,`/api/grc?id=${added.id}&expectedUpdatedAt=${encodeURIComponent(edited.updatedAt)}`,'DELETE');
  await api(admin,'/api/grc','POST',{module:'Denetim Yönetimi',rows:[requirement(26),requirement(27)]},201);
  assert.deepEqual(await api(admin,endpoint+`&reportId=${submitted.reportId}`),saved);
  await panel.locator('.asr-saved .asr-plan > summary').click();await expect(panel.locator('.asr-saved')).toContainText('Scope changed during preview');
  for(const language of ['EN','TR']){await page.locator('.language-switch:visible').getByRole('button',{name:language,exact:true}).click();for(const theme of ['light','dark'])for(const width of [390,1536]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:960});assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await panel.screenshot({path:`${directory}/${language}-${theme}-${width}.png`});}}
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.setViewportSize({width:1536,height:960});
  // A delayed response from the prior audit must not populate the next audit workspace.
  let releasePreview;const previewBarrier=new Promise(resolve=>{releasePreview=resolve;});
  await page.route('**/api/audits/reports?**preview=1',async route=>{const response=await route.fetch();await previewBarrier;await route.fulfill({response}).catch(()=>{});});
  await panel.getByRole('button',{name:'Preview new report',exact:true}).click();await page.locator('.audit-back').click();await page.locator('.audit-card-open').filter({hasText:otherName}).click();releasePreview();await page.unroute('**/api/audits/reports?**preview=1');
  await page.getByRole('tab',{name:'Reports',exact:true}).click();await expect(panel.locator('.asr-preview,.asr-saved')).toHaveCount(0);
  assert.deepEqual(errors,[]);console.log('AUDIT_STATUS_REPORT_QA_PASS: exact linked scope, paginated preview, saved-plan conflict, retained narrative, duplicate guard, immutable source snapshots, SHA-256 exports, Admin boundary, HTML/PDF/CSV, stale navigation and TR/EN responsive themes');
}catch(error){console.error('AUDIT_STATUS_REPORT_QA_FAILED',error.message);await page.screenshot({path:`${directory}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{for(const id of audits)await api(admin,`/api/audits?id=${id}`,'DELETE');for(const id of accounts)await api(admin,'/api/users','PATCH',{id,role:'Editor',status:'Disabled'});await browser.close();}
