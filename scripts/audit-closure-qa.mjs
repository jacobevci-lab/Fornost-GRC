import { qaPassword } from './qa-credentials.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base='http://127.0.0.1:4173',out='audit-closure-qa-artifacts',tag=Date.now();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext({viewport:{width:1440,height:960}}),reviewer=await browser.newContext({viewport:{width:1440,height:960}}),editor=await browser.newContext();
const page=await admin.newPage(),peer=await reviewer.newPage(),errors=[],audits=[],users=[];
for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${method} ${path}: ${await r.text()}`);return r.json();}
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value)??'null';
async function shell(p){await p.goto(base);await expect(p.locator('.shell')).toBeVisible();await p.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();}
async function openAudit(p,name){await p.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());if(await p.locator('.audit-back').isVisible())await p.locator('.audit-back').click();await p.locator('.audit-card-open').filter({hasText:name}).click();await p.getByRole('tab',{name:'Closure and approval',exact:true}).click();}
try{
 await mkdir(out,{recursive:true});await api(admin,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const peerEmail=`closure-reviewer-${tag}@fornost.test`,editorEmail=`closure-editor-${tag}@fornost.test`;
 for(const [email,role]of [[peerEmail,'Admin'],[editorEmail,'Editor']]){await api(admin,'/api/users','POST',{email,name:`QA ${role} Closure`,role,password:qaPassword()},201);users.push((await api(admin,'/api/users')).users.find(u=>u.email===email).id);}
 await api(reviewer,'/api/auth','POST',{action:'login',email:peerEmail,password:qaPassword()});await api(editor,'/api/auth','POST',{action:'login',email:editorEmail,password:qaPassword()});
 const name=`QA Closure Audit ${tag}`,other=`QA Closure Other ${tag}`;
 for(const auditName of [name,other])audits.push((await api(admin,'/api/audits','POST',{name:auditName,template:'Özel Denetim',auditOwner:'QA',auditor:'QA'},201)).id);
 const auditId=audits[0],endpoint=`/api/audits/closure?auditId=${auditId}`;
 let plan=await api(admin,`/api/audits/plan?id=${auditId}`);
 plan=await api(admin,'/api/audits/plan','PUT',{id:auditId,expectedRevision:plan.revision,plan:{...plan.plan,objective:'Verify independent privileged access reviews',scope:'Privileged access and change management',lead:'QA Audit Lead'}});
 const requirement=i=>({auditName:name,auditType:'Internal',auditOwner:'QA',startDate:'2026-10-01',endDate:'2026-10-31',requirementRef:`C-${i}`,requirementTitle:`Kapanış kontrolü ${i}`,owner:'Çağrı',businessUnit:'Security',dueDate:'2026-10-30',status:i===25?'İncelemede':'Kapatıldı',progress:i===25?50:100});
 await api(admin,'/api/grc','POST',{module:'Denetim Yönetimi',rows:Array.from({length:26},(_,i)=>requirement(i))},201);
 const dueDate=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
 await api(admin,'/api/findings','POST',{action:'create',sourceType:'audit',sourceRef:auditId,sourceTitle:name,findingType:'observation',title:`Closure follow-up ${tag}`,description:'Periodic independent review needs a documented follow-up.',severity:'medium',owner:peerEmail,reviewer:'qa-admin@fornost.test',rootCause:'A documented review schedule was missing.',correctiveAction:'Complete the review and record the evidence.',preventiveAction:'Schedule recurring independent access reviews.',dueDate},201);
 const reqId=`ARQ-closure-${tag}`,fields={title:'Optional scope request',instructions:'Confirm that this scope item is not applicable.',owner:'qa-admin@fornost.test',reviewer:peerEmail,dueDate,reviewDueDate:dueDate,periodStart:'',periodEnd:''};
 await api(admin,'/api/audits/requests','POST',{auditId,action:'create',requestId:reqId,expectedRevision:'',fields});
 await shell(page);await openAudit(page,name);const panel=page.locator('.audit-closure');
 await expect(panel.getByRole('button',{name:'Prepare closure package',exact:true})).toBeEnabled();
 await panel.getByRole('button',{name:'Prepare closure package',exact:true}).click();await expect(panel).toContainText('Complete every audit requirement');await expect(panel).toContainText('Accept or cancel every request');
 const summary='İstanbul audit fieldwork is complete. Open findings retain their owners and target dates.';
 await panel.getByLabel('Closure summary',{exact:true}).fill(summary);await panel.getByLabel('Independent approver',{exact:true}).selectOption(users[0]);
 await panel.getByLabel('Follow-up plan for open findings (required)',{exact:true}).fill('The action owner will complete the review by the recorded due date and CAPA will independently verify it.');
 await expect(panel.getByRole('button',{name:'Submit for independent approval',exact:true})).toBeDisabled();
 let source=(await api(admin,endpoint+'&preview=1')).source,last=source.items.find(i=>i.kind==='requirement'&&i.record.data.requirementRef==='C-25');
 await api(admin,'/api/grc','PATCH',{id:last.id,expectedUpdatedAt:last.record.updatedAt,data:{...last.record.data,status:'Kapatıldı',progress:100}});
 let work=await api(admin,`/api/audits/requests?auditId=${auditId}`);
 await api(admin,'/api/audits/requests','POST',{auditId,action:'start',expectedRevision:work.workflow.revision,expectedPlanRevision:work.planRevision,expectedDrafts:work.requests.map(({id,revision})=>({id,revision})),timeZone:'Europe/Istanbul'});
 work=await api(admin,`/api/audits/requests?auditId=${auditId}`);
 await api(admin,'/api/audits/requests','POST',{auditId,action:'cancel',requestId:reqId,expectedRevision:work.requests[0].revision,note:'The scope item is not applicable; approved exclusion.'});
 work=await api(admin,`/api/audits/requests/closure?auditId=${auditId}&preview=1`);
 const workClosed=await api(admin,'/api/audits/requests/closure','POST',{auditId,action:'close',expectedRevision:work.workflow.revision,expectedPlanRevision:work.plan.revision,expectedRequests:work.requests.map(({id,revision})=>({id,revision})),note:'All requests have an explicit reviewed disposition.'});
 await panel.getByRole('button',{name:'Prepare closure package',exact:true}).click();await expect(panel.getByLabel('Closure summary',{exact:true})).toHaveValue(summary);
 await expect(panel.getByRole('button',{name:'Submit for independent approval',exact:true})).toBeEnabled();
 let release,posted,posts=0;const barrier=new Promise(r=>{release=r;});
 await page.route('**/api/audits/closure',async route=>{if(route.request().method()==='POST'){posts++;posted=route.request().postDataJSON();const response=await route.fetch();await barrier;await route.fulfill({response});}else await route.continue();});
 const send=panel.getByRole('button',{name:'Submit for independent approval',exact:true});await send.click();await expect(send).toBeDisabled();await send.dispatchEvent('click');await expect.poll(()=>posts).toBe(1);release();
 await expect(panel).toContainText('Closure in review');await page.unroute('**/api/audits/closure');
 assert.equal((await api(admin,'/api/audits/closure','POST',posted)).id,posted.eventId);assert.equal((await api(admin,endpoint)).events.length,1);
 const first=await api(admin,endpoint+`&eventId=${posted.eventId}`);assert.equal(first.report.snapshot.items.length,28);
 for(const ctx of [admin,editor])await api(ctx,'/api/audits/closure','POST',{auditId,eventId:`ACL-${crypto.randomUUID()}`,action:'approve',expectedRevision:posted.eventId,note:'Attempted unauthorized approval of this audit.'},403);
 for(const suffix of ['', '&preview=1',`&eventId=${posted.eventId}`,`&eventId=${posted.eventId}&download=1`])await api(editor,endpoint+suffix,'GET',undefined,403);
 assert.deepEqual((await api(editor,'/api/audits/requests')).closures,[]);
 // Reviewer follows their actual My Work task to the exact audit package.
 await shell(peer);await peer.locator('nav button[aria-label="My Work"]').evaluate(el=>el.click());await expect(peer.locator('.my-work-v2')).toBeVisible();await peer.locator('.mw2-filters').getByRole('button',{name:/^All/}).click();
 await peer.locator('.mw2-item').filter({hasText:name}).click();const peerPanel=peer.locator('.audit-closure');await expect(peer.getByRole('tab',{name:'Closure and approval',exact:true})).toHaveAttribute('aria-selected','true');await expect(peerPanel.locator('.asr-saved')).toContainText(summary);
 await peerPanel.getByLabel('Decision or reopening reason',{exact:true}).fill('I reviewed the scope and the assigned follow-up actions.');
 await peerPanel.getByLabel('I reviewed the package scope, results and follow-up of open findings.',{exact:true}).check();
 plan=await api(admin,'/api/audits/plan','PUT',{id:auditId,expectedRevision:plan.revision,plan:{...plan.plan,scope:'Privileged access with revised scope boundary'}});
 await peerPanel.getByRole('button',{name:'Approve and close audit',exact:true}).click();await expect(peerPanel.getByRole('alert')).toContainText('Sources or closure state changed');
 await expect(peerPanel.getByLabel('Decision or reopening reason',{exact:true})).toHaveValue('I reviewed the scope and the assigned follow-up actions.');
 await peerPanel.getByRole('button',{name:'Return for changes',exact:true}).click();await expect(peerPanel).toContainText('Returned for changes');
 await panel.getByRole('button',{name:'Refresh closure state',exact:true}).click();await panel.getByRole('button',{name:'Prepare closure package',exact:true}).click();
 await panel.getByLabel('Closure summary',{exact:true}).fill(summary);await panel.getByRole('button',{name:'Submit for independent approval',exact:true}).click();await expect(panel).toContainText('Closure in review');
 const submitted=(await api(admin,endpoint)).state.submissionId;
 await peerPanel.getByRole('button',{name:'Refresh closure state',exact:true}).click();await peerPanel.getByRole('button',{name:'Review current package',exact:true}).click();await expect(peerPanel.locator('.asr-saved')).toContainText(summary);
 await peerPanel.getByLabel('Decision or reopening reason',{exact:true}).fill('I independently approve the revised audit package and its CAPA follow-up.');await peerPanel.getByLabel('I reviewed the package scope, results and follow-up of open findings.',{exact:true}).check();
 await peerPanel.getByRole('button',{name:'Approve and close audit',exact:true}).click();await expect(peerPanel).toContainText('Closed with approval');
 const history=await api(admin,endpoint),approved=history.state.revision,exact=await api(admin,endpoint+`&eventId=${approved}`);
 assert.equal(exact.sha256,createHash('sha256').update(canonical(exact.event)).digest('hex'));assert.equal(exact.report.sha256,createHash('sha256').update(canonical(exact.report.snapshot)).digest('hex'));assert.equal(exact.event.submissionId,submitted);
 assert.equal((await api(admin,'/api/audits')).audits.find(a=>a.id===auditId).closure_state,'closed');assert.ok(!(await api(reviewer,'/api/audits/requests')).closures.some(c=>c.auditId===auditId));
 const response=await reviewer.request.get(base+endpoint+`&eventId=${approved}&download=1`);assert.equal(response.status(),200);assert.match(response.headers()['content-disposition'],/^attachment;/);assert.deepEqual(await response.json(),exact);
 source=(await api(admin,endpoint+'&preview=1')).source;last=source.items.find(i=>i.kind==='requirement');
 await api(admin,'/api/grc','POST',{module:'Denetim Yönetimi',data:requirement(30)},409);
 await api(admin,'/api/grc','POST',{module:'Denetim Yönetimi',rows:[requirement(31),requirement(32)]},409);
 await api(admin,'/api/grc','PATCH',{id:last.id,expectedUpdatedAt:last.record.updatedAt,data:{...last.record.data,owner:'Changed'}},409);
 await api(admin,`/api/grc?id=${last.id}`,'DELETE',undefined,409);
 await api(admin,'/api/audits/plan','PUT',{id:auditId,expectedRevision:plan.revision,plan:{...plan.plan,scope:'Disallowed scope change'}},409);
 await api(admin,'/api/audits/requests/closure','POST',{auditId,action:'reopen',expectedRevision:workClosed.revision,note:'Disallowed request plan reopening while audit is closed.'},409);
 await api(admin,`/api/audits?id=${auditId}`,'DELETE',undefined,409);
 for(const language of ['EN','TR']){await peer.locator('.language-switch:visible').getByRole('button',{name:language,exact:true}).click();await expect(peerPanel.locator('[role="status"]').filter({hasText:language==='TR'?'Approved and closed':'Onaylandı ve kapatıldı'})).toHaveCount(0);for(const theme of ['light','dark'])for(const width of [390,1440]){await peer.evaluate(t=>document.documentElement.dataset.theme=t,theme);await peer.setViewportSize({width,height:960});assert.ok(await peerPanel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await peerPanel.screenshot({path:`${out}/${language}-${theme}-${width}.png`});}}
 await peer.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await peer.setViewportSize({width:1440,height:960});
 await peerPanel.getByLabel('Decision or reopening reason',{exact:true}).fill('Additional sampling is required after an approved scope extension.');await peerPanel.getByRole('button',{name:'Reopen with reason',exact:true}).click();await expect(peerPanel).toContainText('Reopened with reason');
 await api(admin,'/api/audits/plan','PUT',{id:auditId,expectedRevision:plan.revision,plan:{...plan.plan,scope:'Additional scope after reopening'}});assert.deepEqual(await api(admin,endpoint+`&eventId=${approved}`),exact);
 // Late response from an old audit cannot replace the next workspace.
 await panel.getByRole('button',{name:'Refresh closure state',exact:true}).click();
 let releasePreview;const previewBarrier=new Promise(r=>{releasePreview=r;});await page.route('**/api/audits/closure?**preview=1',async route=>{const response=await route.fetch();await previewBarrier;await route.fulfill({response}).catch(()=>{});});
 await panel.getByRole('button',{name:'Prepare closure package',exact:true}).click();await page.locator('.audit-back').click();await page.locator('.audit-card-open').filter({hasText:other}).click();releasePreview();await page.unroute('**/api/audits/closure?**preview=1');await page.getByRole('tab',{name:'Closure and approval',exact:true}).click();await expect(panel.locator('.asr-preview,.asr-saved')).toHaveCount(0);
 assert.deepEqual(errors,[]);await writeFile(`${out}/result.json`,JSON.stringify({passed:true,scenarios:['complete preview','independent users','My Work exact package','duplicate retry','stale source return','approval','SQL write locks','JSON integrity','reopen retention','late navigation','TR/EN themes responsive'],errors},null,2));console.log('AUDIT_CLOSURE_QA_PASS: blockers, independent approval, My Work navigation, stale-source return, idempotency, locked CRUD/import/plan/workplan/delete, verified complete package, retained reopening and TR/EN responsive views');
}catch(error){console.error('AUDIT_CLOSURE_QA_FAILED',error.message);await Promise.all([page.screenshot({path:`${out}/failure-preparer.png`,fullPage:true}).catch(()=>{}),peer.screenshot({path:`${out}/failure-reviewer.png`,fullPage:true}).catch(()=>{})]);throw error;}
finally{
 for(const id of audits){const h=await api(admin,`/api/audits/closure?auditId=${id}`);if(h.state.state==='closed')await api(admin,'/api/audits/closure','POST',{auditId:id,eventId:`ACL-${crypto.randomUUID()}`,action:'reopen',expectedRevision:h.state.revision,note:'Isolated QA cleanup after completed scenario.'});await api(admin,`/api/audits?id=${id}`,'DELETE');}
 for(const id of users)await api(admin,'/api/users','PATCH',{id,role:'Editor',status:'Disabled'});await browser.close();
}
