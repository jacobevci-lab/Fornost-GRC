import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,waitForQaIdle} from './qa-browser-harness.mjs';
const base='http://127.0.0.1:4173',out='policy-connected-evidence-qa-artifacts';
const f=JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const [admin,reviewer,viewer,scoped,anonymous]=await Promise.all(Array.from({length:5},()=>createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}})));
const page=await admin.newPage(),peer=await reviewer.newPage(),reader=await viewer.newPage(),owner='qa-admin@fornost.test',tag=Date.now(),name=`QA connected policy ${tag}`;let code;
const checks=[],errors=[],future=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
let phase='setup',policyId,versionId,exceptionId,failChoices=false,failRead=false,rejectDecision=false,dropResponse=false;
for(const p of [page,peer,reader]){p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message))}
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json()}
const workspace=ctx=>api(ctx,'/api/policy-lifecycle');
async function open(p,lang='EN'){await p.goto(base,{waitUntil:"domcontentloaded",timeout:60000});await expect(p.locator('.shell')).toBeVisible({timeout:30000});await p.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();await p.locator(`nav button[aria-label="${lang==='EN'?'Policy Center':'Politika Merkezi'}"]`).evaluate(el=>el.click());await waitForQaIdle(p);await expect(p.locator('.pwl')).toBeVisible()}
async function tab(p,label){await p.locator('.plm-tabs').getByRole('button',{name:label,exact:true}).click();await waitForQaIdle(p)}
const row=p=>p.locator('.plm-table tbody tr').filter({hasText:name});
const exceptionRow=p=>p.locator('.plm-table tbody tr').filter({hasText:name});
async function person(d,label,email){const field=d.getByRole('combobox',{name:label,exact:true});await field.fill(email);await d.getByRole('listbox',{name:label,exact:true}).getByRole('option').filter({hasText:email}).click();await expect(field).toHaveValue(email)}
async function choose(d){const field=d.getByLabel('Evidence record',{exact:true});await expect(field).toBeEnabled();await field.selectOption(f.evidenceId);const version=d.getByLabel('File version',{exact:true});await expect(version).toBeEnabled();await expect(version.locator(`option[value="${f.version1Id}"]`)).toHaveCount(1);await version.selectOption(f.version1Id);await expect(d.locator('.workflow-evidence-summary')).toBeVisible()}
async function submit(p,d,label='Apply',status=200){const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/policy-lifecycle'&&r.request().method()==='POST');await d.getByRole('button',{name:label,exact:true}).click();const r=await pending;assert.equal(r.status(),status,await r.text());const body=await r.json();if(status<300)await expect(d).toBeHidden();await waitForQaIdle(p);return body}
async function fillDecision(d,phrase,{evidence=true,note='The policy content and selected supporting evidence have been reviewed.'}={}){await d.getByLabel('Decision / action note',{exact:true}).fill(note);if(evidence)await choose(d);await d.getByLabel(`Exact confirmation: ${phrase}`,{exact:true}).fill(phrase);await expect(d.locator('.plm-decision-context h3')).toContainText(code)}
async function action(p,record,button,phrase,options={}){await record.getByRole('button',{name:button,exact:true}).click();const d=p.locator('.plm-decision');await fillDecision(d,phrase,options);await submit(p,d);return d}
async function openUsage(){await reader.goto(base+'/#fornost-record?'+new URLSearchParams({module:'Kanıtlar',kind:'record',ref:f.evidenceId}));await expect(reader.locator('.shell')).toBeVisible();await reader.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await reader.locator('.eu-panel>summary').click();await reader.getByLabel('Evidence to inspect',{exact:true}).selectOption(f.evidenceId);await reader.getByLabel('Usage source',{exact:true}).selectOption('policy');await expect(reader.locator('.eu-list article')).toHaveCount(6)}
try{
 await mkdir(out,{recursive:true});for(const [ctx,email] of [[admin,owner],[reviewer,f.reviewerEmail],[viewer,f.viewerEmail],[scoped,f.scopedEmail]])await api(ctx,'/api/auth','POST',{action:'login',email,password:qaPassword()});
 await api(anonymous,'/api/policy-lifecycle','GET',undefined,401);await api(scoped,'/api/policy-lifecycle','GET',undefined,403);await api(viewer,'/api/policy-lifecycle','POST',{action:'save-policy'},403);
 phase='localized intake and register KPIs';await open(page,'TR');await expect(page.locator('.policy-kpis article')).toHaveCount(4);
 await page.locator('.plm-hero').getByRole('button',{name:'+ Politika',exact:true}).click();
 const intake=page.getByRole('dialog',{name:'Politika kaydı'});assert.deepEqual(await intake.getByLabel('Kategori',{exact:true}).locator('option').allTextContents(),['—','Bilgi Güvenliği','BT Operasyonları','Gizlilik ve KVKK','İnsan Kaynakları','İş Sürekliliği','Tedarikçi Yönetimi','Yapay Zeka Yönetişimi']);
 await expect(intake.getByLabel('Hedef kitle',{exact:true})).toHaveValue('Tüm Çalışanlar');await expect(intake.getByLabel('Sınıf',{exact:true}).locator('option:checked')).toHaveText('Kurum İçi');await page.keyboard.press('Escape');
 phase='directory policy and actual version creation';await open(page);await page.locator('.plm-hero').getByRole('button',{name:'+ Policy',exact:true}).click();let d=page.getByRole('dialog',{name:'Policy record',exact:true});
 code=await d.getByLabel('Policy code',{exact:true}).inputValue();assert.match(code,/^POL-\d{3,}$/);
 for(const [label,value] of [['Title',name],['Audience','Synthetic policy team']])await d.getByLabel(label,{exact:true}).fill(value);
 await person(d,'Policy owner',owner);await person(d,'Independent reviewer',f.reviewerEmail);policyId=(await submit(page,d,'Save')).id;
 await tab(page,'Policy Register');await row(page).getByRole('button',{name:'+ Version',exact:true}).click();d=page.getByRole('dialog',{name:'New controlled version',exact:true});
 for(const [label,value] of [['Effective date',future(0)],['Change summary','Define controlled policy review and independent evidence decisions.'],['Policy content','This policy governs access, accountability, independent approval and the handling of temporary exceptions. Owners must maintain evidence and review every relevant change.'],['Regulation refs','ISO-27001']])await d.getByLabel(label,{exact:true}).fill(value);
 const directory = (await api(admin,'/api/grc')).rows;
 const control = directory.find(row => row.module === 'Kontroller');
 const risk = directory.find(row => row.module === 'Risk Assessment');
 assert.ok(control && risk, 'Expected control and risk fixtures');
 async function pick(label, record, query) {
   const input = d.getByRole('combobox', {name:label,exact:true});
   await input.fill(query);
   const result = d.getByRole('listbox', {name:label}).getByRole('option').filter({hasText:record.record_code || record.id});
   await expect(result).toHaveCount(1);
   await result.click();
 }
 const controlData = JSON.parse(control.data_json);
 await pick('Add control', control, controlData.title || controlData.controlTitle || control.record_code);
 await pick('Add risk', risk, risk.record_code || risk.id);
 const risks = d.getByRole('list', {name:'Risk refs',exact:true});
 await risks.getByRole('button', {name:/Remove/}).click();
 await expect(risks).toHaveCount(0);
 await pick('Add risk', risk, risk.record_code || risk.id);
 const controlInput = d.getByRole('combobox', {name:'Add control',exact:true});
 await controlInput.fill(control.record_code || control.id);
 await expect(d.getByRole('listbox', {name:'Add control'}).getByRole('option').filter({hasText:control.record_code || control.id})).toHaveCount(0);
 await controlInput.press('Escape');
 versionId=(await submit(page,d,'Save')).id;assert.ok(policyId&&versionId);
 const savedVersion = (await workspace(admin)).versions.find(version => version.id === versionId);
 assert.deepEqual(savedVersion.controlRefs,[control.id]);
 assert.deepEqual(savedVersion.riskRefs,[risk.id]);
 assert.deepEqual(savedVersion.regulationRefs,['ISO-27001']);
 await tab(page,'Worklist');await page.locator('.pwl-table tr').filter({hasText:name}).getByRole('button',{name:'Submit for review →',exact:true}).click();d=page.getByRole('dialog',{name:'Submit for review',exact:true});
 const note='Retain this draft while another administrator changes the policy audience.';await fillDecision(d,'İNCELEMEYE GÖNDER',{note});await d.getByText('Policy content for this decision',{exact:true}).click();await expect(d.locator('.plm-decision-content')).toContainText('This policy governs access');
 checks.push('Actual policy and controlled-version UI creation, eligible owner/reviewer selectors, one required mapping group and exact policy-content preview');
 phase='choice and source recovery';await page.route(url=>url.pathname==='/api/workflow-choices',route=>failChoices?route.fulfill({status:503,json:{error:'unavailable'}}):route.continue());failChoices=true;await d.getByRole('button',{name:'Refresh versions',exact:true}).click();await expect(d.locator('.workflow-evidence').getByRole('alert')).toBeVisible();failChoices=false;await d.locator('.workflow-evidence').getByRole('button',{name:'Retry',exact:true}).click();await expect(d.getByLabel('File version',{exact:true})).toHaveValue(f.version1Id);
 // A separate actual UI session edits the policy metadata after the decision preview.
 await open(peer);await tab(peer,'Policy Register');await row(peer).getByRole('button',{name:'Open',exact:true}).click();await peer.getByRole('button',{name:'Edit metadata',exact:true}).click();const edit=peer.getByRole('dialog',{name:'Policy record',exact:true});await edit.getByLabel('Audience',{exact:true}).fill('Updated synthetic policy team');await submit(peer,edit,'Save');await peer.keyboard.press('Escape');
 await submit(page,d,'Apply',409);await expect(d.getByLabel('Decision / action note',{exact:true})).toHaveValue(note);await expect(d.getByLabel('File version',{exact:true})).toHaveValue(f.version1Id);await expect(d.getByRole('button',{name:'Apply',exact:true})).toBeDisabled();
 await page.route(url=>url.pathname==='/api/policy-lifecycle',route=>route.request().method()==='GET'&&new URL(route.request().url()).searchParams.get('view')==='decision'&&failRead?route.fulfill({status:503,json:{}}):route.request().method()==='POST'&&rejectDecision?route.fulfill({status:422,json:{code:'EVIDENCE_SELECTION'}}):route.continue());
 failRead=true;await d.getByRole('button',{name:'Refresh decision context',exact:true}).click();await expect(d.locator('.plm-decision-context').getByRole('alert')).toContainText('could not be loaded');await expect(d.getByRole('button',{name:'Apply',exact:true})).toBeDisabled();await expect(d.getByLabel('Decision / action note',{exact:true})).toHaveValue(note);
 failRead=false;await d.getByRole('button',{name:'Refresh decision context',exact:true}).click();await expect(d.locator('.plm-decision-context')).toContainText('Updated synthetic policy team');await d.getByRole('button',{name:'Use current context',exact:true}).click();await expect(d.getByLabel('Exact confirmation: İNCELEMEYE GÖNDER',{exact:true})).toHaveValue('');await d.getByLabel('Exact confirmation: İNCELEMEYE GÖNDER',{exact:true}).fill('İNCELEMEYE GÖNDER');
 rejectDecision=true;await submit(page,d,'Apply',422);await expect(d.getByRole('alert')).toContainText('Check your selection');rejectDecision=false;await submit(page,d);
 let state=await workspace(admin);assert.equal(state.versions.find(v=>v.id===versionId).status,'review');assert.equal(state.evidencePins.find(p=>p.entityId===versionId).evidence.id,f.version1Id);assert.equal(await row(page).getByRole('button',{name:'Approve',exact:true}).count(),0);
 const source=await api(admin,`/api/policy-lifecycle?view=decision&kind=version&id=${versionId}`),library={evidenceMode:'library',evidenceSelection:{evidenceId:f.evidenceId,versionId:f.version1Id}};
 await api(admin,'/api/policy-lifecycle','POST',{action:'version-action',versionId,operation:'approve',note:'Creator must not approve the policy they submitted.',confirmation:'POLİTİKAYI ONAYLA',decisionMode:'reviewed',expectedRevision:source.revision,...library},403);
 await api(scoped,`/api/policy-lifecycle?view=decision&kind=version&id=${versionId}`,'GET',undefined,403);
 checks.push('Actual concurrent metadata change rejects stale decision; failed reads and evidence errors preserve draft; explicit context adoption resets confirmation; creator approval denied');
 phase='independent publication and exception lifecycle';await open(peer);await action(peer,peer.locator('.pwl-table tr').filter({hasText:name}),'Review / Approve →','POLİTİKAYI ONAYLA');await tab(peer,'Versions & Release');await action(peer,row(peer),'Publish','POLİTİKAYI YAYINLA');
 await open(page);await tab(page,'Exceptions');await page.locator('.policy-tab-tools').getByRole('button').click();d=page.getByRole('dialog',{name:'Timed policy exception',exact:true});await d.getByLabel('Published policy',{exact:true}).selectOption(policyId);await person(d,'Exception owner',owner);await person(d,'Independent reviewer',f.reviewerEmail);
 for(const [label,value] of [['Expiry',future(30)],['Rationale','Complete the controlled migration while preserving accountable access.'],['Compensating control implementation note','Daily independent access monitoring with recorded escalation.']])await d.getByLabel(label,{exact:true}).fill(value);
 const asset=directory.find(r=>r.module==='Varlık Envanteri');assert.ok(asset);
 await pick('Scope record',asset,asset.record_code||asset.id);await pick('Compensating controls',control,control.record_code||control.id);
 exceptionId=(await submit(page,d,'Save')).id;await action(page,exceptionRow(page),'Submit','İSTİSNAYI GÖNDER',{evidence:false});await open(peer);await tab(peer,'Exceptions');await exceptionRow(peer).getByRole('button',{name:'Approve',exact:true}).click();d=peer.locator('.plm-decision');await pick('Related risk (optional)',risk,risk.record_code||risk.id);await fillDecision(d,'İSTİSNAYI ONAYLA');await submit(peer,d);
 const linked=(await workspace(reviewer)).exceptions.find(x=>x.id===exceptionId);assert.equal(linked.riskRef,risk.id);assert.equal(linked.scopeRef,asset.id);assert.deepEqual(linked.controlRefs,[control.id]);
 const retirement=await api(reviewer,`/api/policy-lifecycle?view=decision&kind=retire&id=${policyId}`);await api(reviewer,'/api/policy-lifecycle','POST',{action:'retire-policy',policyId,note:'An active exception must still block retirement.',confirmation:'POLİTİKAYİ YÜRÜRLÜKTEN KALDIR',decisionMode:'reviewed',expectedRevision:retirement.revision,...library},400);
 await api(reviewer,'/api/policy-lifecycle','POST',{action:'retire-policy',policyId,note:'An active exception must still block retirement.',confirmation:'POLİTİKAYI YÜRÜRLÜKTEN KALDIR',decisionMode:'reviewed',expectedRevision:retirement.revision,...library},409);
 await action(peer,exceptionRow(peer),'Close','İSTİSNAYI KAPAT');state=await workspace(reviewer);assert.equal(state.exceptions.find(x=>x.id===exceptionId).status,'closed');assert.equal(state.evidencePins.filter(p=>[versionId,exceptionId].includes(p.entityId)).length,5);
 checks.push('Actual independent approval/publication and exception creation/submission/approval/closure retain separate pins; active exception blocks retirement');
 phase='twelve accessible decision views';await tab(peer,'Policy Register');await row(peer).getByRole('button',{name:'Open',exact:true}).click();await peer.getByRole('dialog',{name,exact:true}).getByRole('button',{name:'Retire',exact:true}).click();d=peer.getByRole('dialog',{name:'Retire policy',exact:true});await fillDecision(d,'POLİTİKAYI YÜRÜRLÜKTEN KALDIR');
 await d.getByRole('button',{name:'Apply',exact:true}).focus();await peer.keyboard.press('Tab');await expect(d.getByRole('button',{name:'Close',exact:true})).toBeFocused();await peer.keyboard.press('Shift+Tab');await expect(d.getByRole('button',{name:'Apply',exact:true})).toBeFocused();
 d=peer.locator('.plm-decision');
 for(const lang of ['EN','TR'])for(const theme of ['light','dark']){
  await peer.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).evaluate(el=>el.click());if(await peer.locator('html').getAttribute('data-theme')!==theme)await peer.locator('.theme-toggle:visible').evaluate(el=>el.click());
  for(const width of [1440,1024,390]){await peer.setViewportSize({width,height:1000});await waitForQaIdle(peer);assert.ok(await peer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.ok(await d.evaluate(el=>el.scrollWidth<=el.clientWidth+2));const violations=(await new AxeBuilder({page:peer}).include('.plm-decision').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations;assert.deepEqual(violations,[]);await d.locator('.workflow-evidence').scrollIntoViewIfNeeded();await d.screenshot({path:`${out}/${lang}-${theme}-${width}.png`});}
 }
 await peer.setViewportSize({width:1440,height:1000});await peer.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).evaluate(el=>el.click());await peer.keyboard.press('Escape');await expect(peer.locator('.plm-decision')).toBeHidden();await expect(peer.getByRole('dialog',{name,exact:true}).getByRole('button',{name:'Retire',exact:true})).toBeFocused();
 await peer.getByRole('button',{name:'Retire',exact:true}).click();d=peer.getByRole('dialog',{name:'Retire policy',exact:true});await fillDecision(d,'POLİTİKAYI YÜRÜRLÜKTEN KALDIR');
 phase='committed response recovery';await peer.route(url=>url.pathname==='/api/policy-lifecycle',async route=>{if(dropResponse&&route.request().method()==='POST'&&route.request().postDataJSON()?.action==='retire-policy'){dropResponse=false;const response=await route.fetch();assert.equal(response.status(),200,await response.text());await route.abort('failed')}else await route.continue()});dropResponse=true;
 await d.getByRole('button',{name:'Apply',exact:true}).click();await expect(d.getByRole('alert')).toContainText('could not be confirmed');await expect(d.getByLabel('File version',{exact:true})).toHaveValue(f.version1Id);await expect(d.getByRole('button',{name:'Apply',exact:true})).toBeDisabled();await d.getByRole('button',{name:'Refresh decision context',exact:true}).click();await expect(d.locator('.plm-decision-context').getByRole('alert')).toContainText('unavailable in the current state');await expect(d.getByRole('button',{name:'Use current context',exact:true})).toHaveCount(0);await expect(d.getByText(/The outcome could not be confirmed/)).toHaveCount(0);await expect(d.getByRole('button',{name:'Apply',exact:true})).toBeDisabled();await peer.keyboard.press('Escape');await waitForQaIdle(peer);await expect(peer.getByRole('dialog',{name,exact:true}).getByRole('button',{name:'Retire',exact:true})).toHaveCount(0);await peer.keyboard.press('Escape');await expect(row(peer)).toContainText('Archived');
 state=await workspace(reviewer);assert.equal(state.documents.find(p=>p.id===policyId).status,'retired');assert.equal(state.evidencePins.filter(p=>[policyId,versionId,exceptionId].includes(p.entityId)).length,6);
 checks.push('Twelve TR/EN light/dark desktop/tablet/mobile decision views, zero Axe violations/overflow, keyboard trap and Escape focus; committed lost-response recovery prevents a duplicate decision');
 phase='retained usage and exact read-only navigation';const usage=await api(viewer,`/api/evidence/usage?id=${f.evidenceId}`),rows=usage.rows.filter(r=>r.source==='policy');assert.equal(rows.length,6);assert.ok(rows.every(r=>r.historical&&r.decision.sourceAvailable&&r.pins[0].state==='older'));assert.equal(usage.sources.find(s=>s.key==='policy').state,'complete');const restricted=await api(scoped,`/api/evidence/usage?id=${f.evidenceId}`);assert.equal(restricted.sources.find(s=>s.key==='policy').state,'restricted');assert.equal(restricted.rows.filter(r=>r.source==='policy').length,0);
 for(const id of [versionId,exceptionId,policyId]){await openUsage();const target=reader.locator('.eu-list article').filter({hasText:id}).first();const pending=reader.waitForResponse(r=>new URL(r.url()).pathname==='/api/policy-lifecycle'&&new URL(r.url()).searchParams.get('focusId')===id);await target.getByRole('button',{name:/^Open record:/}).click();assert.equal((await pending).status(),200);await expect(reader.locator('.enterprise-work-focus')).toContainText(id);await expect(reader.locator('.plm-table tbody tr')).toHaveCount(1);if(id===versionId){
   const controls=reader.locator('.plm-table tbody button');await expect(controls).toHaveCount(1);
   await reader.locator('.plm-table tbody').getByRole('button',{name:'Inspect version',exact:true}).click();
   const detail=reader.getByRole('dialog',{name:'Version comparison'});await expect(detail.getByRole('region',{name:'Selected version text'})).toContainText('This policy governs access');
   await expect(detail.getByRole('button',{name:/^(Approve|Reject|Publish|Submit)$/})).toHaveCount(0);
   await reader.keyboard.press('Escape');
  }else if(id===exceptionId)await expect(reader.locator('.plm-table tbody').getByRole('button',{name:/^(Submit|Approve|Close|Reject)$/})).toHaveCount(0)}
 await openUsage();await reader.locator('.eu-panel').screenshot({path:`${out}/usage.png`});await api(admin,`/api/grc?id=${f.evidenceId}`,'DELETE',undefined,409);checks.push('Viewer can inspect six historical decisions and follow exact policy/version/exception sources; scoped reads restricted and evidence deletion blocked');assert.deepEqual(errors,[]);
 await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',checks,errors,policyId,versionId,exceptionId,cleanup:'Owned policy retired and exception closed; immutable synthetic history remains only in disposable loopback QA.'},null,2));console.log('POLICY_CONNECTED_EVIDENCE_QA_PASS');
}catch(error){await writeFile(`${out}/failure.json`,JSON.stringify({phase,message:error.message,stack:error.stack,policyId,versionId,exceptionId,checks},null,2));await page.screenshot({path:`${out}/failure-admin.png`,fullPage:true}).catch(()=>{});await peer.screenshot({path:`${out}/failure-reviewer.png`,fullPage:true}).catch(()=>{});throw error}finally{await browser.close()}
