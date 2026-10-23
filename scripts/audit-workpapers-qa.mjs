import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:4173', out='audit-workpapers-qa-artifacts', tag=Date.now();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['clipboard-read','clipboard-write']}),reviewer=await browser.newContext(),viewer=await browser.newContext();
const peer=await reviewer.newPage();
const page=await context.newPage(),errors=[],users=[];page.on('pageerror',e=>errors.push(e.message));peer.on('pageerror',e=>errors.push(e.message));let auditId,evidenceId;
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,await r.text());return r.json();}
async function openWork(target, title, completed=false) {
 await target.locator('nav button[aria-label="My Work"]').evaluate(e=>e.click());
 const refresh=target.locator('.my-work-v2').getByRole('button',{name:'Refresh',exact:true});
 await expect(refresh).toBeEnabled();await refresh.click();await expect(refresh).toBeEnabled();
 await target.locator('.mw2-filters').getByRole('button',{name:completed?/^Completed/:/^All/}).click();
 await target.getByRole('textbox',{name:'Search work',exact:true}).fill(title);
}
async function followWork(target, title, id, completed=false) {
 await openWork(target,title,completed);
 await expect(target.locator('.mw2-item')).toHaveCount(1);
 await target.locator('.mw2-item').click();
 await expect(target.getByRole('tab',{name:'Workpapers',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(target.locator('.aw-detail')).toContainText(id);
}
try{
 await mkdir(out,{recursive:true});await api(context,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const reviewerEmail=`workpaper-reviewer-${tag}@fornost.test`, viewerEmail=`workpaper-viewer-${tag}@fornost.test`;
 for(const [email,role,ctx]of [[reviewerEmail,'Editor',reviewer],[viewerEmail,'Viewer',viewer]]){
  await api(context,'/api/users','POST',{email,name:`QA Workpaper ${role}`,role,password:qaPassword()},201);users.push({id:(await api(context,'/api/users')).users.find(u=>u.email===email).id,role});
  await api(ctx,'/api/auth','POST',{action:'login',email,password:qaPassword()});
 }
 const name=`QA Workpapers ${tag}`;auditId=(await api(context,'/api/audits','POST',{name,template:'Özel Denetim',auditOwner:'QA',auditor:'QA'},201)).id;
 const upload=await context.request.post(base+'/api/evidence',{headers:{origin:base},multipart:{evidenceTitle:`QA Workpaper Evidence ${tag}`,owner:'qa-admin@fornost.test',period:'Q3 2026',controlRef:'QA-AC-1',status:'İncelemede',file:{name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX8AAAAASUVORK5CYII=','base64')}}});assert.equal(upload.status(),201,await upload.text());evidenceId=(await upload.json()).id;
 const version=(await api(context,`/api/evidence/history?id=${evidenceId}`)).versions[0];
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Audit Management"]').evaluate(e=>e.click());await page.locator('.audit-card-open').filter({hasText:name}).click();await page.getByRole('tab',{name:'Workpapers',exact:true}).click();
 const panel=page.locator('.aw-panel');await panel.getByRole('button',{name:'New workpaper',exact:true}).click();
 for(const [label,value]of [['Title','Quarterly access sample'],['Test objective','Verify privileged access approvals'],['Test steps','Compare account permissions with dated approvals'],['Population and source','Q3 IAM export with ten privileged accounts'],['Sampling rationale','Select the highest privilege account'],['Conclusion','The selected account has a documented approval']])await panel.getByLabel(label,{exact:true}).fill(value);
 await panel.getByLabel('Population size',{exact:true}).fill('10');await panel.getByLabel('Independent reviewer',{exact:true}).selectOption(reviewerEmail);await panel.getByRole('button',{name:'Add sample',exact:true}).click();await panel.getByLabel('Sample reference 1',{exact:true}).fill('Account-001');await panel.getByLabel('Test result 1',{exact:true}).selectOption('pass');await panel.getByLabel('Test note 1',{exact:true}).fill('Approval predates access provisioning');await panel.getByLabel('Evidence version 1',{exact:true}).selectOption(version.id);
 // Opt-in defaults off and persists with the phase deadlines through independent review.
 await expect(panel.getByLabel('Preparation due date',{exact:true})).toHaveValue('');
 await expect(panel.getByLabel('Review due date',{exact:true})).toHaveValue('');
 const preparationDate='2020-01-01', reviewDate='2099-12-30';
 await panel.getByLabel('Preparation due date',{exact:true}).fill(preparationDate);
 await panel.getByLabel('Review due date',{exact:true}).fill(reviewDate);
 await panel.getByLabel('Deadline time zone',{exact:true}).fill('Europe/Istanbul');
 await expect(panel.getByRole('checkbox',{name:'Email reminders',exact:true})).not.toBeChecked();
 await panel.getByRole('checkbox',{name:'Email reminders',exact:true}).check();
 await expect(panel).toContainText('Preparation · Advance / Due day / Overdue / Escalation');
 await expect(panel).toContainText('Review · Advance / Due day / Overdue / Escalation');
 for(const lang of ['EN','TR']) {await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width:390,height:960});await page.screenshot({path:`${out}/deadlines-${lang}-${theme}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'deadline editor overflow');assert.deepEqual((await new AxeBuilder({page}).include('.aw-editor').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);}}
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.setViewportSize({width:1440,height:960});
 // CSV preview never writes; duplicates and changed population block the entire append.
 await panel.getByText('Import samples from CSV',{exact:true}).click();
 const importer=panel.locator('.aw-import');
 await importer.getByLabel('CSV content',{exact:true}).fill('reference,note\n account-001 ,Duplicate');
 await importer.getByRole('button',{name:'Preview samples',exact:true}).click();
 await expect(importer.getByRole('alert')).toContainText('Duplicate sample reference');
 await expect(panel.locator('.aw-sample')).toHaveCount(1);
 await importer.getByLabel('Sample CSV file',{exact:true}).setInputFiles({name:'samples.csv',mimeType:'text/csv',buffer:Buffer.from('reference,note\nAccount-002,"Approval, checked"\nAccount-003,"Source row 3"')});
 await expect(importer.getByRole('region',{name:'Sample import preview'})).toBeVisible();
 await panel.getByLabel('Population size',{exact:true}).fill('2');
 await expect(importer.getByRole('alert')).toContainText('total samples cannot exceed');
 await expect(importer.getByRole('button',{name:'Add samples to draft',exact:true})).toHaveCount(0);
 await panel.getByLabel('Population size',{exact:true}).fill('10');
 assert.equal((await api(context,`/api/audits/workpapers?auditId=${auditId}`)).papers.length,0);
 assert.deepEqual((await new AxeBuilder({page}).include('.aw-import').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);
 await page.setViewportSize({width:390,height:960});await page.screenshot({path:`${out}/sample-import-mobile.png`,fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'import viewport overflow');await page.setViewportSize({width:1440,height:960});
 await importer.getByRole('button',{name:'Add samples to draft',exact:true}).click();
 await expect(panel.locator('.aw-sample')).toHaveCount(3);
 for(const index of [2,3]){await expect(panel.getByLabel(`Test result ${index}`,{exact:true})).toHaveValue('pending');await expect(panel.getByLabel(`Evidence version ${index}`,{exact:true})).toHaveValue('');await panel.getByLabel(`Test result ${index}`,{exact:true}).selectOption('pass');await panel.getByLabel(`Evidence version ${index}`,{exact:true}).selectOption(version.id);}
 await expect(panel.getByLabel('Test note 2',{exact:true})).toHaveValue('Approval, checked');
 await importer.getByRole('button',{name:'Clear import',exact:true}).click();
 await expect(panel.locator('.aw-sample')).toHaveCount(3);
 let posts=0,release;const barrier=new Promise(r=>{release=r;});await page.route('**/api/audits/workpapers',async route=>{if(route.request().method()==='POST'){posts++;const response=await route.fetch();await barrier;await route.fulfill({response});}else await route.continue();});
 const save=panel.getByRole('button',{name:'Save draft',exact:true});await save.click();await expect(save).toBeDisabled();await save.dispatchEvent('click');await expect.poll(()=>posts).toBe(1);release();await expect(panel.getByRole('status').filter({hasText:'Action saved.'})).toHaveText('Action saved.');await page.unroute('**/api/audits/workpapers');
 let row=(await api(context,`/api/audits/workpapers?auditId=${auditId}`)).papers[0];assert.equal(row.samples[0].versionId,version.id);assert.equal(row.samples.length,3);assert.equal(row.samples[1].reference,'Account-002');
 assert.equal(row.remindersEnabled,true);assert.equal(row.dueDate,preparationDate);assert.equal(row.reviewDueDate,reviewDate);assert.equal(row.timeZone,'Europe/Istanbul');
 await openWork(page,row.title);await page.locator('.mw2-filters').getByRole('button',{name:/^Overdue/}).click();await expect(page.locator('.mw2-item')).toHaveCount(1);await expect(page.locator('.mw2-item time')).toHaveClass('overdue');
 await followWork(page,row.title,row.id);
 const inboxPaper=(await api(context,'/api/audits/requests')).workpapers.find(p=>p.id===row.id);assert.equal(inboxPaper.status,'draft');assert.equal(inboxPaper.dueAt,'2020-01-01T20:59:59.999Z');assert.equal(inboxPaper.evidence,undefined);assert.equal(inboxPaper.samples,undefined);
 await peer.goto(base);await expect(peer.locator('.shell')).toBeVisible();await peer.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await openWork(peer,row.title);await expect(peer.locator('.mw2-item')).toHaveCount(0);
 await api(viewer,'/api/audits/workpapers','POST',{auditId,id:row.id,action:'submit',expectedRevision:row.revision,note:'Viewer cannot submit'},403);
 await panel.getByRole('button',{name:'Edit draft',exact:true}).click();await panel.getByLabel('Conclusion',{exact:true}).fill('Local draft retained after a conflict');
 await api(context,'/api/audits/workpapers','POST',{auditId,id:row.id,action:'save',expectedRevision:row.revision,fields:{...row,conclusion:'Updated by another browser'}});
 await panel.getByRole('button',{name:'Save draft',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('draft is retained');await expect(panel.getByLabel('Conclusion',{exact:true})).toHaveValue('Local draft retained after a conflict');await panel.getByRole('button',{name:'Discard draft and reload current record',exact:true}).click();await expect(panel.locator('.aw-detail')).toContainText('Updated by another browser');
 await panel.getByLabel('Action reason',{exact:true}).fill('Sample testing is complete and ready for independent review');await panel.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'Action saved.'})).toHaveText('Action saved.');
 row=(await api(context,`/api/audits/workpapers?auditId=${auditId}`)).papers[0];await api(context,'/api/audits/workpapers','POST',{auditId,id:row.id,action:'approve',expectedRevision:row.revision,note:'Cannot approve own work'},403);
 const submittedPaper=(await api(reviewer,'/api/audits/requests')).workpapers.find(p=>p.id===row.id);assert.equal(submittedPaper.dueAt,'2099-12-30T20:59:59.999Z');
 await openWork(peer,row.title);await peer.locator('.mw2-filters').getByRole('button',{name:/^Overdue/}).click();await expect(peer.locator('.mw2-item')).toHaveCount(0);
 await followWork(peer,row.title,row.id);await peer.locator('.aw-panel').getByLabel('Action reason',{exact:true}).fill('Clarify the population extraction date');await peer.locator('.aw-panel').getByRole('button',{name:'Request changes',exact:true}).click();await expect(peer.locator('.aw-panel').getByRole('status').filter({hasText:'Action saved.'})).toHaveText('Action saved.');await openWork(peer,row.title);await expect(peer.locator('.mw2-item')).toHaveCount(0);
 await panel.getByRole('button',{name:'Refresh',exact:true}).click();await expect(panel.getByRole('button',{name:'Edit draft',exact:true})).toBeVisible();
 await panel.getByLabel('Action reason',{exact:true}).fill('Source period is documented; resubmitting for review');await panel.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'Action saved.'})).toHaveText('Action saved.');
 row=(await api(context,`/api/audits/workpapers?auditId=${auditId}`)).papers[0];await api(reviewer,'/api/audits/workpapers','POST',{auditId,id:row.id,action:'approve',expectedRevision:row.revision,note:'Independently reviewed sample selection and evidence'});
 await panel.getByRole('button',{name:'Refresh',exact:true}).click();await expect(panel.getByRole('button',{name:'Reopen with reason',exact:true})).toBeVisible();
 await followWork(page,row.title,row.id,true);await page.screenshot({path:`${out}/my-work-exact-target.png`,fullPage:true});
 await panel.getByText('Action and sample history',{exact:true}).click();await expect(panel).toContainText('Independently reviewed sample selection and evidence');
 assert.deepEqual((await new AxeBuilder({page}).include('.aw-panel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);
 for(const lang of ['EN','TR']){await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);for(const width of [1440,390]){await page.setViewportSize({width,height:960});await page.screenshot({path:`${out}/${lang}-${theme}-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'viewport overflow');}}}
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await panel.getByLabel('Action reason',{exact:true}).fill('Additional testing required before final opinion');await panel.getByRole('button',{name:'Reopen with reason',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'Action saved.'})).toHaveText('Action saved.');await panel.getByLabel('Action reason',{exact:true}).fill('Superseded by a revised test scope; retain history');await panel.getByRole('button',{name:'Cancel with reason',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'Action saved.'})).toHaveText('Action saved.');
 await panel.getByRole('button',{name:'Copy record link',exact:true}).click();const paperLink=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(paperLink.includes('kind=audit-workpaper'));await page.goto(paperLink);await expect(page.getByRole('tab',{name:'Workpapers',exact:true})).toHaveAttribute('aria-selected','true');await expect(panel.locator('.aw-detail')).toContainText(row.id);
 const final=await api(context,`/api/audits/workpapers?auditId=${auditId}&id=${row.id}`);assert.equal(final.papers[0].status,'cancelled');assert.equal(final.papers[0].remindersEnabled,true);assert.equal(final.papers[0].reviewDueDate,reviewDate);assert.equal((await api(context,'/api/audits/requests')).workpapers.find(p=>p.id===row.id).dueAt,'');assert.equal(final.history.length,8);assert.equal(final.papers[0].evidence[0].id,version.id);assert.deepEqual(errors,[]);
 await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks:['email opt-in defaults off and persists through lifecycle','bilingual reminder calendar preview','optional deadline UI and timezone persistence','preparation overdue filter in My Work','review deadline switches on submission','terminal deadline cleared from queue','bilingual mobile deadline editor axe','CSV preview without writes','CSV duplicates rejected','changed population revalidated','CSV append preserves existing samples','imported samples pending and unpinned','CSV notes persist through review','mobile import and accessibility','copied workpaper URL opens exact audit and paper','owner draft My Work exact link','reviewer handoff and UI return','reviewer queue removes returned paper','completed owner My Work link','inbox excludes sample evidence details','browser create and version pinning','duplicate click prevention','viewer denial','stale conflict retains draft','owner submission','independent return and approval','history','reopen and cancel','axe','TR EN light dark desktop mobile'],errors},null,2));console.log('AUDIT_WORKPAPERS_QA_PASS');
}catch(e){await writeFile(`${out}/failure.json`,JSON.stringify({message:e.message,stack:e.stack,errors},null,2));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await peer.screenshot({path:`${out}/reviewer-failure.png`,fullPage:true}).catch(()=>{});console.error('AUDIT_WORKPAPERS_QA_FAILED',e.message);throw e;}
finally{try{if(auditId)await api(context,`/api/audits?id=${auditId}`,'DELETE');if(evidenceId)await api(context,`/api/grc?id=${evidenceId}`,'DELETE');for(const user of users)await api(context,'/api/users','PATCH',{...user,status:'Disabled'});await writeFile(`${out}/cleanup.json`,JSON.stringify({auditDeleted:!!auditId,evidenceDeleted:!!evidenceId,accountsDisabled:users.length}));}catch(error){await writeFile(`${out}/cleanup-failure.json`,JSON.stringify({message:error.message,stack:error.stack},null,2));throw error;}finally{await browser.close();}}
