import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// This runner deliberately has no configurable remote URL: CRUD is isolated only.
const base='http://127.0.0.1:4173', out='runtime-qa-artifacts', password='Fornost-QA!2026-Branch';
const owner='qa-admin@fornost.test', reviewer='qa-reviewer@fornost.test';
const today=new Date().toISOString().slice(0,10), future=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const evidence={note:'Independent QA evidence and verification completed.',evidenceReference:'QA-EVIDENCE-001',evidenceSha256:'a'.repeat(64)};
let currentPage=null;
const results=[], contexts=[]; await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
async function check(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS',name)}catch(e){results.push({name,status:'failed',error:e.message});console.error('FAIL',name,e.message);if(currentPage){await currentPage.screenshot({path:`${out}/failure-${results.length}.png`}).catch(()=>{});await fs.writeFile(`${out}/failure-${results.length}.json`,JSON.stringify(await currentPage.locator('input,select,textarea').evaluateAll(es=>es.filter(e=>e.offsetWidth).map(e=>({name:e.name,type:e.type,value:e.type==='password'?'[redacted]':e.value,valid:e.validity.valid,message:e.validationMessage}))).catch(()=>[]),null,2))}}}
async function request(ctx,path,method='GET',data,expected=200){const r=await ctx.request.fetch(base+path,{method,headers:{origin:base},data});const body=await r.text();assert.equal(r.status(),expected,`${method} ${path}: ${body.slice(0,700)}`);try{return JSON.parse(body)}catch{return body}}
async function login(email){const ctx=await browser.newContext({viewport:{width:1536,height:960}});contexts.push(ctx);await request(ctx,'/api/auth','POST',{action:'login',email,password});return ctx}
const admin=await login(owner);
for(const [email,role] of [[reviewer,'Admin'],['qa-editor@fornost.test','Editor'],['qa-viewer@fornost.test','Viewer']])await request(admin,'/api/users','POST',{name:`QA ${role}`,email,password,role},201);
const checker=await login(reviewer), editor=await login('qa-editor@fornost.test'),viewer=await login('qa-viewer@fornost.test');
let seedRows=(await request(admin,'/api/grc')).rows;
const modules=[...new Set(seedRows.map(x=>x.module))];
for(const moduleName of modules)await check(`API CRUD and role boundaries: ${moduleName}`,async()=>{
 const seed=seedRows.find(x=>x.module===moduleName),data=JSON.parse(seed.data_json),key=['title','process','evidenceTitle','controlTitle','requirementTitle'].find(k=>data[k]);
 data[key]=`QA ${moduleName} ${Date.now()}`;const created=await request(editor,'/api/grc','POST',{module:moduleName,data},201);
 assert.ok(created.id);assert.ok(created.code);let found=(await request(admin,'/api/grc')).rows.find(x=>x.id===created.id);assert.equal(JSON.parse(found.data_json)[key],data[key]);
 data[key]+=' updated';await request(editor,'/api/grc','PATCH',{id:created.id,data});found=(await request(admin,'/api/grc')).rows.find(x=>x.id===created.id);assert.equal(JSON.parse(found.data_json)[key],data[key]);
 await request(viewer,'/api/grc','POST',{module:moduleName,data},403);await request(viewer,'/api/grc','PATCH',{id:created.id,data},403);await request(editor,`/api/grc?id=${created.id}`,'DELETE',undefined,403);
 await request(admin,'/api/grc','POST',{module:moduleName,data:{}},400);await request(admin,`/api/grc?id=${created.id}`,'DELETE');assert.ok(!(await request(admin,'/api/grc')).rows.some(x=>x.id===created.id));
});
const page=await admin.newPage();currentPage=page;page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500&&r.url().startsWith(base))errors.push(`HTTP ${r.status()} ${r.url()}`)});
async function open(label){await page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).evaluate(el=>el.click());await page.waitForTimeout(500)}
async function reset(){await page.setViewportSize({width:1536,height:960});await page.goto(base);await page.locator('.shell').waitFor();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();}
await reset();
for(const [moduleName,label,key] of [['Risk Assessment','Risk Assessment','title'],['BIA','Business Impact Analysis (BIA)','process'],['Varlık Envanteri','Asset Inventory','title'],['Uyum','Compliance Management','controlTitle'],['Kontroller','Control Library','controlTitle']])await check(`UI create/edit/delete: ${label}`,async()=>{
 await reset();await open(label);await page.getByPlaceholder('Search records').fill('QA-no-match-20261001');assert.match(await page.locator('.table-wrap').innerText(),/No records in this view/);await page.getByPlaceholder('Search records').fill('');await page.locator('.actions .primary').click();const dialog=page.locator('.modal[role=dialog]');await dialog.waitFor();await dialog.getByRole('button',{name:/Show advanced/}).click();
 const data=JSON.parse(seedRows.find(x=>x.module===moduleName).data_json);data[key]=`QA UI ${moduleName} ${Date.now()}`;
 const inputs=dialog.locator('input[name]:not([type=hidden]),textarea[name],select[name]');
 for(let i=0;i<await inputs.count();i++){const input=inputs.nth(i),name=await input.getAttribute('name'),tag=await input.evaluate(e=>e.tagName),value=data[name];if(value===undefined||value===null)continue;
 if(tag==='SELECT'){const options=await input.locator('option').evaluateAll(es=>es.map(e=>e.value));const multi=await input.getAttribute('multiple')!==null;const chosen=multi?String(value).split(',').map(v=>v.trim()).filter(v=>options.includes(v)):String(value);if(multi?chosen.length:options.includes(chosen))await input.selectOption(chosen)}else await input.fill(String(value));}
 const response=page.waitForResponse(r=>r.url().endsWith('/api/grc')&&r.request().method()==='POST').catch(()=>null);await dialog.locator('.form-actions .primary').click();const r=await response;assert.equal(r.status(),201,await r.text());const created=await r.json();await dialog.waitFor({state:'hidden'});
 if(moduleName==='BIA'){const saved=(await request(admin,'/api/grc')).rows.find(x=>x.id===created.id);await request(admin,'/api/grc','PATCH',{id:created.id,data:{...JSON.parse(saved.data_json),rpo:0,asset:"QA archived asset reference"}});await reset();await open(label)}
 const row=page.locator('tr').filter({has:page.locator(`.code[title="${created.id}"]`)});await row.getByRole('button',{name:'Edit',exact:true}).click();if(moduleName==='BIA'){assert.equal(await dialog.locator('[name=rpo]').inputValue(),'0','Zero RPO survives edit');assert.equal(await dialog.locator('[name=asset]').inputValue(),'QA archived asset reference','Missing linked assets remain visible');assert.match(await dialog.locator('[name=asset] option:checked').innerText(),/linked record unavailable/)}await dialog.locator(`[name="${key}"]`).fill(data[key]+' edited');const update=page.waitForResponse(r=>r.url().endsWith('/api/grc')&&r.request().method()==='PATCH').catch(()=>null);await dialog.locator('.form-actions .primary').click();assert.equal((await update).status(),200);await dialog.waitFor({state:'hidden'});
 const found=(await request(admin,'/api/grc')).rows.find(x=>x.id===created.id);assert.equal(JSON.parse(found.data_json)[key],data[key]+' edited');if(moduleName==='BIA'){assert.match(await row.innerText(),/RPO 0h/);assert.doesNotMatch(await row.innerText(),/Missing Data/)}
 await page.screenshot({path:`${out}/ui-${moduleName.replaceAll(' ','-')}.png`});page.once('dialog',d=>d.accept());const del=page.waitForResponse(r=>r.url().includes('/api/grc?id=')&&r.request().method()==='DELETE').catch(()=>null);await row.getByRole('button',{name:'Delete',exact:true}).click();assert.equal((await del).status(),200);assert.ok(!(await request(admin,'/api/grc')).rows.some(x=>x.id===created.id));
});
await check('Dashboard audit deadlines: today remains current, yesterday overdue, closed excluded',async()=>{
 const seed=seedRows.find(x=>x.module==='Denetim Yönetimi');assert.ok(seed);
 const data={...JSON.parse(seed.data_json),auditName:'QA deadline regression',requirementTitle:'QA deadline regression',dueDate:today,status:'Devam Ediyor'};
 async function count(expected){const loaded=page.waitForResponse(r=>r.url().endsWith('/api/grc')&&r.request().method()==='GET');await reset();await (await loaded).finished();await open('Dashboard');const metric=page.locator('.audit-remediation-metrics button').filter({hasText:'Overdue audits'}).locator('b');if(expected!==undefined)await expect(metric).toHaveText(String(expected));return Number(await metric.innerText())}
 const baseline=await count();const created=await request(admin,'/api/grc','POST',{module:'Denetim Yönetimi',data},201);
 try {
  assert.equal(await count(baseline),baseline,'Today is not overdue');
  data.dueDate=future(-1);await request(admin,'/api/grc','PATCH',{id:created.id,data});assert.equal(await count(baseline+1),baseline+1,'Yesterday is overdue');
  data.status='Tamamlandı';await request(admin,'/api/grc','PATCH',{id:created.id,data});assert.equal(await count(baseline),baseline,'Completed requirements are excluded');
 } finally {await request(admin,`/api/grc?id=${created.id}`,'DELETE')}
});
await check('Evidence Library UI upload, file integrity, edit and delete',async()=>{
 await reset();await open('Evidence Library');await page.locator('.actions .primary').click();const dialog=page.locator('.modal[role=dialog]');await dialog.waitFor();
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await dialog.locator('input[type=file]').setInputFiles({name:'qa-evidence.png',mimeType:'image/png',buffer:bytes});
 for(const [name,value] of Object.entries({evidenceTitle:'QA uploaded evidence',controlRef:'A.5.18',owner,period:today.slice(0,7)}))await dialog.locator(`[name=${name}]`).fill(value);
 await dialog.locator('[name=status]').selectOption('Taslak');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/evidence')&&r.request().method()==='POST').catch(()=>null);await dialog.locator('.form-actions .primary').click();const r=await response;assert.equal(r.status(),201,await r.text());const created=await r.json();assert.match(created.contentSha256,/^[a-f0-9]{64}$/);await dialog.waitFor({state:'hidden'});
 const saved=(await request(admin,'/api/grc')).rows.find(x=>x.id===created.id),data=JSON.parse(saved.data_json);const downloaded=await admin.request.get(`${base}/api/evidence?key=${encodeURIComponent(data.fileKey)}`);assert.equal(downloaded.status(),200);assert.deepEqual(await downloaded.body(),bytes);
 const row=page.locator('tr').filter({has:page.getByRole('button',{name:saved.record_code,exact:true})});await row.getByRole('button',{name:'Edit',exact:true}).click();await dialog.locator('[name=evidenceTitle]').fill('QA evidence updated');const update=page.waitForResponse(r=>r.url().endsWith('/api/grc')&&r.request().method()==='PATCH').catch(()=>null);await dialog.locator('.form-actions .primary').click();assert.equal((await update).status(),200);await dialog.waitFor({state:'hidden'});await page.screenshot({path:`${out}/evidence-uploaded.png`});
 page.once('dialog',d=>d.accept());const deletion=page.waitForResponse(r=>r.url().includes('/api/grc?id=')&&r.request().method()==='DELETE').catch(()=>null);await row.getByRole('button',{name:'Delete',exact:true}).click();assert.equal((await deletion).status(),200);assert.ok(!(await request(admin,'/api/grc')).rows.some(x=>x.id===created.id));
});

await check('Continuity UI form, layout, modal, maker-checker, exercise breach and gap closure',async()=>{
 await reset();await open('Business Continuity & Resilience');await page.locator('.continuity-page').waitFor();assert.equal(await page.locator('nav.continuity-tabs').count(),0);assert.ok((await page.locator('.continuity-tabs').boundingBox()).height<100);
 await page.locator('.continuity-hero').getByRole('button',{name:'New Plan'}).click();let dialog=page.locator('dialog.continuity-overlay');await dialog.waitFor();const bounds=await dialog.boundingBox();assert.ok(bounds.x>250&&bounds.y>=20,'Continuity dialog is centered with viewport margins');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.locator('.continuity-hero').getByRole('button',{name:'New Plan'}).click();await dialog.waitFor();assert.equal(await dialog.locator('fieldset').count(),3);
 await dialog.locator('[name=name]').fill('QA Payment recovery plan');await dialog.locator('[name=process]').fill('Payment processing');await dialog.locator('[name=biaRef]').fill('BIA-001');await dialog.locator('[name=reviewer]').fill(reviewer);await dialog.locator('[name=crisisLead]').fill('qa-lead@fornost.test');await dialog.locator('[name=dependencies]').fill('Identity, network and database services');await dialog.locator('[name=recoveryStrategy]').fill('Recover in the secondary region and validate the restored data.');await dialog.locator('[name=communicationPlan]').fill('Notify crisis owners and affected customers.');
 await page.screenshot({path:`${out}/continuity-form.png`});
 const response=page.waitForResponse(r=>r.url().endsWith('/api/continuity')&&r.request().method()==='POST').catch(()=>null);await dialog.getByRole('button',{name:'Create draft plan'}).click();const r=await response;assert.equal(r.status(),201,await r.text());const {id}=await r.json();await dialog.waitFor({state:'hidden'});
 await request(admin,'/api/continuity','POST',{action:'approve-plan',planId:id,...evidence,confirmation:'PLANI ONAYLA'},403);
 await request(checker,'/api/continuity','POST',{action:'approve-plan',planId:id,...evidence,confirmation:'PLANI ONAYLA'});await request(admin,'/api/continuity','POST',{action:'activate-plan',planId:id,...evidence,confirmation:'PLANI ETKİNLEŞTİR'});
 await request(admin,'/api/continuity','POST',{action:'schedule-exercise',planId:id,type:'tabletop',scheduledDate:today,scenario:'Simulate regional outage and recover the critical payment process.',facilitator:owner},201);
 let state=await request(admin,'/api/continuity'),ex=state.exercises.find(x=>x.planId===id);assert.ok(ex);
 await request(admin,'/api/continuity','POST',{action:'complete-exercise',exerciseId:ex.id,outcome:'partial',actualRecoveryHours:6,actualDataLossHours:2,observations:'Manual recovery exceeded both approved recovery targets.',rootCause:'Secondary automation coverage was incomplete.',...evidence});
 state=await request(admin,'/api/continuity');const gap=state.gaps.find(x=>x.planId===id);assert.ok(gap);assert.equal(state.exercises.find(x=>x.id===ex.id).rtoBreached,true);
 await request(admin,'/api/continuity','POST',{action:'close-gap',gapId:gap.id,...evidence,confirmation:'AÇIĞI KAPAT'},403);await request(checker,'/api/continuity','POST',{action:'close-gap',gapId:gap.id,...evidence,confirmation:'AÇIĞI KAPAT'});
 await reset();await open('Business Continuity & Resilience');for(const theme of ['dark','light']){if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();for(const tab of ['Plans','Exercises','Improvement gaps']){await page.locator('.continuity-tabs').getByRole('button',{name:tab,exact:true}).click();await page.screenshot({path:`${out}/continuity-${theme}-${tab.replaceAll(' ','-')}.png`});}}
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/continuity-mobile.png`});await page.setViewportSize({width:1536,height:960});
 await request(admin,'/api/continuity','POST',{action:'retire-plan',planId:id,...evidence,confirmation:'PLANI YÜRÜRLÜKTEN KALDIR'});state=await request(admin,'/api/continuity');assert.equal(state.plans.find(x=>x.id===id).status,'retired');assert.equal(state.gaps.find(x=>x.id===gap.id).status,'closed');
});
await check('Risk appetite and KRI: approval, threshold breach, remediation, independent closure, retirement',async()=>{
 const {id}=await request(admin,'/api/risk-appetite','POST',{action:'save-appetite',code:`QA-${Date.now()}`,category:'cyber',statement:'Critical vulnerabilities must remain within approved thresholds.',kriName:'Critical vulnerability count',metricUnit:'count',direction:'upper',appetiteTarget:1,warningThreshold:3,breachThreshold:5,owner,reviewer,frequencyDays:30,validFrom:today,validUntil:future(365)});
 const act=(ctx,operation,confirmation,extra={})=>request(ctx,'/api/risk-appetite','POST',{action:'appetite-action',appetiteId:id,operation,confirmation,...evidence,...extra});
 await act(admin,'submit','RİSK İŞTAHINI İNCELEMEYE GÖNDER');await request(admin,'/api/risk-appetite','POST',{action:'appetite-action',appetiteId:id,operation:'approve',confirmation:'RİSK İŞTAHINI ONAYLA',...evidence},403);await act(checker,'approve','RİSK İŞTAHINI ONAYLA');
 const m=await request(admin,'/api/risk-appetite','POST',{action:'record-measurement',appetiteId:id,periodStart:today,periodEnd:today,value:7,sourceRef:'QA-source',...evidence});assert.equal(m.band,'red');assert.ok(m.breachId);
 await request(admin,'/api/risk-appetite','POST',{action:'plan-breach',breachId:m.breachId,responseOwner:owner,responsePlan:'Remediate critical vulnerabilities and remeasure the production scope.',dueDate:future(7)});
 for(const [ctx,operation,confirmation] of [[admin,'submit-breach','İHLALİ DOĞRULAMAYA GÖNDER'],[checker,'close-breach','İHLALİ KAPAT']])await request(ctx,'/api/risk-appetite','POST',{action:'breach-action',breachId:m.breachId,operation,confirmation,...evidence});await act(checker,'retire','RİSK İŞTAHINI YÜRÜRLÜKTEN KALDIR');
});
await check('Policy lifecycle: draft, version, independent approval, publish and retire',async()=>{
 const {id}=await request(admin,'/api/policy-lifecycle','POST',{action:'save-policy',code:`QA-${Date.now()}`,title:'QA Information Security Policy',category:'security',classification:'internal',owner,reviewer,audience:'All employees',reviewFrequencyDays:365});
 const version=await request(admin,'/api/policy-lifecycle','POST',{action:'create-version',policyId:id,summary:'QA annual policy review and control mapping',content:'This policy defines mandatory information security governance, accountability, monitoring, exceptions and annual review requirements for the organization.',effectiveDate:today,controlRefs:['ISO27001-A.5.1'],regulationRefs:[],riskRefs:['RSK-001']});
 for(const [ctx,operation,confirmation] of [[admin,'submit','İNCELEMEYE GÖNDER'],[checker,'approve','POLİTİKAYI ONAYLA'],[checker,'publish','POLİTİKAYI YAYINLA']])await request(ctx,'/api/policy-lifecycle','POST',{action:'version-action',versionId:version.id,operation,confirmation,...evidence});
 await request(checker,'/api/policy-lifecycle','POST',{action:'retire-policy',policyId:id,confirmation:'POLİTİKAYI YÜRÜRLÜKTEN KALDIR',...evidence});
});
await check('Incident lifecycle: declaration through independent close and reopen',async()=>{
 const {id}=await request(admin,'/api/incidents','POST',{action:'create',title:'QA Production identity compromise',category:'account-compromise',severity:'critical',detectedDate:today,description:'Privileged identity showed confirmed anomalous access activity.',businessImpact:'Production services and restricted records may be affected.',owner,commander:'qa-commander@fornost.test',reviewer,assetRefs:'AST-001',riskRef:'RSK-001',biaRef:'BIA-001',dataClassification:'Restricted',personalData:false},201);
 for(const [operation,confirmation] of [['triage','OLAY TRİAJINI BAŞLAT'],['contain','OLAYI KONTROL ALTINA AL'],['eradicate','TEHDİDİ ORTADAN KALDIR'],['recover','HİZMETİ GERİ YÜKLE'],['review','OLAYI İNCELEMEYE GÖNDER'],['close','OLAYI KAPAT'],['reopen','OLAYI YENİDEN AÇ']])await request(operation==='close'?checker:admin,'/api/incidents','POST',{action:'transition',incidentId:id,operation,confirmation,...evidence,rootCause:'Compromised credentials lacked strong authentication.',lessonsLearned:'Require phishing-resistant MFA for every privileged identity.',notificationDecision:'not-required',notificationRationale:'Isolated simulation contains no actual customer or personal data.'});
});
await check('CAPA lifecycle: create, start, submit, independent verify and reopen',async()=>{
 const {id}=await request(admin,'/api/findings','POST',{action:'create',sourceType:'audit',sourceRef:'AUD-QA-001',sourceTitle:'QA audit',findingType:'nonconformity',title:'QA access review incomplete',description:'Quarterly privileged access evidence does not cover all production administrators.',severity:'high',owner,reviewer,rootCause:'Ownership changes were not reflected in the review workflow.',correctiveAction:'Complete missing review population and remove unjustified access.',preventiveAction:'Automate population reconciliation and require owner attestation.',dueDate:future(7),riskRef:'RSK-001',controlRef:'A.5.18'},201);
 for(const [operation,confirmation] of [['start','CAPA AKSİYONUNU BAŞLAT'],['submit','CAPA DOĞRULAMAYA GÖNDER'],['verify','BULGUYU KAPAT'],['reopen','BULGUYU YENİDEN AÇ']])await request(operation==='verify'?checker:admin,'/api/findings','POST',{action:'transition',findingId:id,operation,confirmation,...evidence});
});
await check('Audit portfolio: template creation, duplicate protection, archive/delete and requirement cleanup',async()=>{
 const body={name:`QA ISO audit ${Date.now()}`,template:'ISO/IEC 27001:2022',auditType:'İç Denetim',auditor:reviewer,auditOwner:owner};
 const created=await request(admin,'/api/audits','POST',body,201);assert.ok(created.insertedRequirements>0);await request(admin,'/api/audits','POST',body,409);await request(viewer,'/api/audits','POST',{...body,name:'QA denied'},403);
 assert.ok((await request(admin,'/api/audits')).audits.some(x=>x.id===created.id));await request(editor,`/api/audits?id=${created.id}`,'DELETE',undefined,403);const removed=await request(admin,`/api/audits?id=${created.id}`,'DELETE');assert.equal(removed.deletedRequirements,created.insertedRequirements);assert.ok(!(await request(admin,'/api/grc')).rows.some(x=>JSON.parse(x.data_json).auditName===body.name));
});
await check('AI governance: model draft CRUD, risk scoring and role boundaries',async()=>{
 const model={systemName:'QA governed assistant',modelName:'QA Model',vendor:'Internal',purpose:'Isolated quality assurance model inventory fixture.',owner,deployment:'Local',region:'EU',dataClassification:'Internal',autonomy:'Human-reviewed',affectedUsers:10,impact:2,likelihood:2,dataSensitivity:2,autonomyRisk:1,controlMaturity:4,controls:'Human review, access controls and audit logging.',reviewDate:future(90)};
 const {id}=await request(admin,'/api/ai/models','POST',model,201);await request(admin,'/api/ai/models','PUT',{...model,id,systemName:'QA updated assistant'});assert.equal((await request(admin,'/api/ai/models')).models.find(x=>x.id===id).systemName,'QA updated assistant');await request(editor,'/api/ai/models','POST',model,403);await request(admin,'/api/ai/models','DELETE',{id,confirmation:'incorrect'},400);await request(admin,'/api/ai/models','DELETE',{id,confirmation:'SİL'});assert.ok(!(await request(admin,'/api/ai/models')).models.some(x=>x.id===id));
});

await check('Master data: add, duplicate validation, delete and role restrictions',async()=>{
 const {catalogs}=await request(admin,'/api/catalogs'),catalog=Object.keys(catalogs)[0],value='QA isolated catalog';
 await request(admin,'/api/catalogs','POST',{catalog,value},201);await request(admin,'/api/catalogs','POST',{catalog,value},409);assert.ok((await request(viewer,'/api/catalogs')).catalogs[catalog].includes(value));await request(editor,'/api/catalogs','POST',{catalog,value:'QA denied'},403);await request(admin,`/api/catalogs?catalog=${encodeURIComponent(catalog)}&value=${encodeURIComponent(value)}`,'DELETE');assert.ok(!(await request(admin,'/api/catalogs')).catalogs[catalog].includes(value));
});
await check('Vendor governance: onboarding, assessment, independent approval and offboarding',async()=>{
 const controls=Object.fromEntries(['securityProgram','accessControl','encryption','logging','vulnerabilityManagement','incidentNotification','bcdr','subprocessorGovernance','dataDeletion','auditRights','dataPortability','dpa'].map(x=>[x,true]));
 const {vendorId,assessmentId}=await request(admin,'/api/third-party-risk','POST',{action:'save-vendor',name:'QA Cloud Provider',service:'Identity platform',legalEntity:'QA Provider Ltd',category:'SaaS',criticality:'critical',dataClassification:'confidential',dataAccess:'Employee identity metadata',hostingLocation:'EU',businessOwner:'qa-business@fornost.test',riskOwner:owner,reviewer,contact:'qa-contact@fornost.test',contractEnd:future(365),nextReview:future(90),exitPlan:'Export records, verify deletion and migrate to an approved alternative.',impact:4,likelihood:3,controlMaturity:5,treatmentPlan:'Maintain continuous assurance and annual independent review.',...controls},201);
 for(const [ctx,operation,confirmation] of [[admin,'submit','İNCELEMEYE GÖNDER'],[checker,'approve','TEDARİKÇİYİ ONAYLA']])await request(ctx,'/api/third-party-risk','POST',{action:'assessment-action',assessmentId,operation,confirmation,...evidence});
 await request(checker,'/api/third-party-risk','POST',{action:'offboard',vendorId,confirmation:'TEDARİKÇİYİ KAPAT',...evidence});
});
await check('Regulatory changes: source, intake, impact, action, independent verification and closure',async()=>{
 const source=await request(admin,'/api/regulatory-intelligence','POST',{action:'save-source',name:'QA Official Source',authority:'QA Regulator',jurisdiction:'Türkiye',sourceType:'regulator',owner,reviewFrequencyDays:30,url:'https://example.com/regulations'},201);
 const change=await request(admin,'/api/regulatory-intelligence','POST',{action:'create-change',sourceId:source.id,externalRef:`QA-${Date.now()}`,title:'QA material regulatory amendment',summary:'A detailed summary describing a material control and governance change.',publishedDate:today,effectiveDate:future(30),severity:'high',changeType:'amendment',owner,reviewer},201);
 const impact=await request(admin,'/api/regulatory-intelligence','POST',{action:'add-impact',changeId:change.id,targetType:'control',targetRef:'A.5.18',targetTitle:'Access review control',impactLevel:'high',requiredAction:'Update control design and operating procedures for the new obligation.',actionOwner:owner,dueDate:future(14)},201);
 for(const [ctx,operation,confirmation] of [[admin,'start','AKSİYONU BAŞLAT'],[admin,'submit','DOĞRULAMAYA GÖNDER'],[checker,'verify','ETKİYİ DOĞRULA']])await request(ctx,'/api/regulatory-intelligence','POST',{action:'impact-action',impactId:impact.id,operation,confirmation,...evidence});
 const closed=await request(checker,'/api/regulatory-intelligence','POST',{action:'change-action',changeId:change.id,operation:'close',confirmation:'DEĞİŞİKLİĞİ KAPAT',...evidence});assert.equal(closed.status,'closed');
});
await check('Evidence automation: source creation, edit, rule creation and disable (no external collection)',async()=>{
 const source={action:'save-source',name:'QA isolated evidence source',vendor:'Generic REST',category:'Security',driver:'rest-json',baseUrl:'https://example.com',path:'/qa',authType:'none'};
 const {sourceId}=await request(admin,'/api/evidence-automation','POST',source);await request(admin,'/api/evidence-automation','POST',{...source,sourceId,name:'QA updated evidence source'});
 const {ruleId}=await request(admin,'/api/evidence-automation','POST',{action:'save-rule',name:'QA evidence policy',sourceId,controlRefs:'A.5.18',jsonPath:'status',operator:'exists',expected:'',schedule:'monthly',freshnessHours:24,failureThreshold:1,remediationDueDays:7,autoFinding:false,remediationOwner:owner});assert.ok(ruleId);await request(admin,'/api/evidence-automation','POST',{action:'toggle-rule',ruleId,enabled:false});
});

await check('Read routes, invalid writes, exports and Viewer write boundaries',async()=>{
 for(const route of ['continuity','risk-appetite','policy-lifecycle','incidents','findings']){await request(viewer,`/api/${route}`);await request(viewer,`/api/${route}`,'POST',{action:'invalid'},403);await request(admin,`/api/${route}`,'POST',{action:'invalid'},400);const csv=await request(admin,`/api/${route}?format=csv`);assert.equal(typeof csv,'string');}
});
await check('Connected GRC opens exact core records and clears contextual filters',async()=>{
 for(const moduleName of ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Kontroller','Kanıtlar','Denetim Yönetimi']){
  const seed=seedRows.find(x=>x.module===moduleName),code=seed.record_code;
  await reset();await open('Connected GRC Map');await page.locator('.cg-filters select').selectOption(moduleName);await page.locator('.cg-filters input').fill(code);
  const entry=page.locator('.cg-records>button').filter({hasText:code});await expect(entry).toHaveCount(1);await entry.click();
  await page.locator('.cg-detail').getByRole('button',{name:/^Open record/}).click();
  await expect(page.locator('.core-record-focus')).toContainText(code);
  if(moduleName==='Denetim Yönetimi'){const name=JSON.parse(seed.data_json).auditName,total=seedRows.filter(x=>x.module===moduleName&&JSON.parse(x.data_json).auditName===name).length;await expect(page.locator('.audit-detail-kpis article').first().locator('b')).toHaveText(String(total))}
  await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);
  await page.locator('.table-card .table-wrap tbody tr').getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.locator('.modal[role=dialog]')).toBeVisible();await page.locator('.modal[role=dialog]').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('.core-record-focus').getByRole('button',{name:'Show all records',exact:true}).click();await expect(page.locator('.core-record-focus')).toHaveCount(0);
 }
});
await check('My Work: exact ownership, Today, pagination after 80, mobile due dates and CAPA navigation',async()=>{
 const seed=JSON.parse(seedRows.find(x=>x.module==='Kontroller').data_json),prefix=`QA Inbox ${Date.now()}`;
 await reset();
 const fixtures=Array.from({length:83},(_,i)=>({...seed,controlTitle:`${prefix} ${String(i).padStart(3,'0')}`,owner:i===82?`not-${owner}`:owner,status:'Aktif',dueDate:today}));
 await request(admin,'/api/grc','POST',{module:'Kontroller',rows:fixtures},201);
 try {
  await open('My Work');await page.locator('.mw2-refresh').waitFor();await expect(page.locator('.mw2-refresh')).toBeEnabled();
  await page.getByRole('textbox',{name:'Search work',exact:true}).fill(prefix);await page.locator('.mw2-filters').getByRole('button',{name:/^Today/}).click();
  await expect(page.locator('.mw2-pagination')).toContainText('1–20 / 82');
  for(let i=0;i<4;i++)await page.locator('.mw2-pagination').getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.mw2-pagination')).toContainText('81–82 / 82');await expect(page.locator('.mw2-item')).toHaveCount(2);
  await expect(page.locator('.mw2-list')).not.toContainText(`${prefix} 082`);
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.mw2-item time').first()).toBeVisible();await page.screenshot({path:`${out}/my-work-mobile-due.png`});await page.setViewportSize({width:1536,height:960});
  await page.locator('.mw2-item').filter({hasText:`${prefix} 081`}).click();await expect(page.locator('.core-record-focus')).toBeVisible();await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);await expect(page.locator('.table-card .table-wrap')).toContainText(`${prefix} 081`);
  await open('My Work');await expect(page.locator('.mw2-refresh')).toBeEnabled();await page.getByRole('textbox',{name:'Search work',exact:true}).fill('QA access review incomplete');await page.locator('.mw2-filters').getByRole('button',{name:/^All/}).click();
  await expect(page.locator('.mw2-item')).toHaveCount(1);await page.locator('.mw2-item').click();await expect(page.locator('.finding-page')).toBeVisible();await expect(page.locator('.finding-table tbody tr')).toHaveCount(1);
 } finally {
  const rows=(await request(admin,'/api/grc')).rows.filter(x=>JSON.parse(x.data_json).controlTitle?.startsWith(prefix));
  for(const row of rows)await request(admin,`/api/grc?id=${row.id}`,'DELETE');
 }
});
await reset();await open('AI Governance');
const aiTabs=page.locator('.fornost-ai-tabs>button'),aiCount=await aiTabs.count();
await check('AI governance exposes its complete navigation',()=>assert.ok(aiCount>=30));
for(const theme of ['light','dark']){
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
 for(let i=0;i<aiCount;i++)await check(`AI workspace render: ${theme} / ${i+1}`,async()=>{
  await aiTabs.nth(i).click();await page.waitForTimeout(450);const panel=page.locator('.fornost-ai-panel');assert.equal(await aiTabs.nth(i).getAttribute('class'),'active');assert.ok(await panel.getAttribute('data-ai-view'));assert.ok((await page.locator('.fornost-ai-tabs').boundingBox()).height<=64,'AI chooser leaves room for workspace content');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);await page.screenshot({path:`${out}/ai-${theme}-${i+1}.jpg`,type:'jpeg',quality:65});
 });
}
await page.locator('.fornost-ai-panel button[aria-label="Kapat"]').click();

await check('No unhandled UI errors',()=>assert.deepEqual(errors,[]));
await fs.writeFile(`${out}/results.json`,JSON.stringify({environment:base,results,limitations:['External SMTP, SSO, webhook delivery and third-party credentials are not configured in this isolated environment.','Lifecycle modules retain audit history and use retirement/closure rather than unsupported hard deletion.']},null,2));
for(const ctx of contexts)await ctx.close();await browser.close();if(results.some(x=>x.status==='failed'))process.exitCode=1;
