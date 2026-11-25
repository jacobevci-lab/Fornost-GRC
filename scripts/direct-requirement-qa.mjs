import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale,waitForQaIdle} from './qa-browser-harness.mjs';
// Deliberately fixed loopback: all users, evidence, policies and decisions are disposable.
const base='http://127.0.0.1:4173',out='direct-requirement-qa-artifacts',iso='ISO/IEC 27001:2022',endpoint='/api/framework-posture',owner='qa-admin@fornost.test',reviewEmail='direct-reviewer@fornost.test';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1440,height:900}}),reviewer=await createQaContext(browser,base,{}, {viewport:{width:1440,height:900}});
const page=await context.newPage(),peer=await reviewer.newPage(),checks=[],errors=[];let phase='setup';
for(const p of [page,peer]){p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));}
async function api(path,body,status=200,ctx=context){const r=await ctx.request.fetch(base+path,{method:body?'POST':'GET',headers:{origin:base},data:body});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json();}
const matrix=()=>api(endpoint+'?name='+encodeURIComponent(iso)),row=async(ref='4.1')=>(await matrix()).requirements.find(r=>r.ref===ref);
const tableRow=(p,ref)=>p.locator('.posture-ledger tbody tr').filter({has:p.getByRole('rowheader',{name:ref,exact:true})});
async function open(p,ref='4.1'){
 await p.goto(base);await expect(p.locator('.shell')).toBeVisible();await switchQaLocale(p,'en');await openQaModule(p,'Compliance Management');
 await p.locator('.posture-column-head').filter({hasText:'ISO 27001'}).click();await p.getByRole('button',{name:/^All requirements/}).click();await p.getByRole('searchbox',{name:'Search requirements',exact:true}).fill(ref);
 await tableRow(p,ref).getByRole('button',{name:'Evidence / Policy / Control',exact:true}).click();await expect(p.locator('.posture-direct')).toBeVisible();
}
async function linkDocument(p,kind,code){
 await p.getByRole('button',{name:kind==='evidence'?'+ Link evidence (EVD)':'+ Link policy (POL)',exact:true}).click();
 const combo=p.getByRole('combobox',{name:kind==='evidence'?'Select evidence':'Select policy',exact:true});await combo.fill(code);await expect(p.getByRole('option').filter({hasText:code})).toBeVisible();await combo.press('ArrowDown');await combo.press('Enter');
 await p.getByRole('button',{name:'Save requirement sources',exact:true}).click();await waitForQaIdle(p);
}
try{
 await api('/api/auth',{action:'login',email:owner,password:qaPassword()});
 await api('/api/users',{name:'Direct reviewer',email:reviewEmail,password:qaPassword(),role:'Editor'},201);
 await api('/api/auth',{action:'login',email:reviewEmail,password:qaPassword()},200,reviewer);
 await api(endpoint,{action:'enroll',name:iso});
 const upload=await context.request.post(base+'/api/evidence',{headers:{origin:base},multipart:{evidenceTitle:'QA organizational context evidence',owner,period:'2026',controlRef:'4.1',reviewer:reviewEmail,file:{name:'context.txt',mimeType:'text/plain',buffer:Buffer.from('Context of the organization: external and internal issues, scope and accountable owners have been reviewed and documented.')}}});
 assert.equal(upload.status(),201,await upload.text());const evidence=await upload.json();
 const stored=(await api('/api/grc')).rows.find(r=>r.id===evidence.id);await api('/api/evidence/review',{id:evidence.id,version:1,expectedUpdatedAt:stored.updated_at},200,reviewer);
 const baseline=(await api(endpoint+'?overview=1')).coverage[iso];assert.equal(baseline.compliant,0);
 phase='direct evidence without controls';await open(page);await tableRow(page,'4.1').getByRole('combobox',{name:'4.1 · Implementation status'}).selectOption('implemented');await expect(tableRow(page,'4.1').locator('.posture-status')).toHaveText('Self-declared · Awaiting evidence');
 await linkDocument(page,'evidence',evidence.code);await expect(tableRow(page,'4.1').locator('.posture-status')).toHaveText('Awaiting verification');
 assert.equal((await row()).links.length,0);
 await api(endpoint,{action:'verify-requirement',name:iso,ref:'4.1',revision:(await row()).direct.revision,note:'Owner attempts to verify own requirement with approved sources.'},403);
 await open(peer);await peer.getByText('Independently verify requirement',{exact:true}).click();await peer.getByLabel('Requirement relevance and verification rationale').fill('Independent review confirms organizational context evidence addresses ISO 27001 clause 4.1.');await peer.getByRole('button',{name:'Verify and record as compliant',exact:true}).click();
 await expect(tableRow(peer,'4.1').locator('.posture-status')).toHaveText('Compliant');assert.equal((await row()).links.length,0);assert.equal((await api(endpoint+'?overview=1')).coverage[iso].compliant,1);checks.push('ISO 4.1: zero CTL mappings, implementation, approved EVD, independent verification, increased compliance');
 phase='direct published policy';
 const policy=await api('/api/policy-lifecycle',{action:'save-policy',assignmentMode:'directory',title:'QA interested parties policy',category:'security',classification:'internal',owner,reviewer:reviewEmail,audience:'Security team',reviewFrequencyDays:365});
 const version=await api('/api/policy-lifecycle',{action:'create-version',policyId:policy.id,summary:'Interested parties governance',content:'The organization identifies interested parties and their requirements, assigns accountable owners and reviews all obligations annually. The approved context register and applicable obligations inform the information security management system.',effectiveDate:new Date().toISOString().slice(0,10),regulationRefs:['ISO-27001']});
 const history=await api('/api/evidence/history?id='+encodeURIComponent(evidence.id));
 for(const [operation,confirmation,ctx] of [['submit','İNCELEMEYE GÖNDER',context],['approve','POLİTİKAYI ONAYLA',reviewer],['publish','POLİTİKAYI YAYINLA',reviewer]]){
  const decision=await api('/api/policy-lifecycle?view=decision&kind=version&id='+version.id,undefined,200,ctx);
  await api('/api/policy-lifecycle',{action:'version-action',versionId:version.id,operation,confirmation,note:'Independent review and publication of policy for direct requirement verification.',decisionMode:'reviewed',expectedRevision:decision.revision,evidenceMode:'library',evidenceSelection:{evidenceId:evidence.id,versionId:history.versions[0].id}},200,ctx);
 }
 const policyRow=(await api('/api/policy-lifecycle')).documents.find(p=>p.id===policy.id);
 await open(page,'4.2');await tableRow(page,'4.2').getByRole('combobox',{name:'4.2 · Implementation status'}).selectOption('implemented');await waitForQaIdle(page);await linkDocument(page,'policy',policyRow.code);
 await api(endpoint,{action:'verify-requirement',name:iso,ref:'4.2',revision:(await row('4.2')).direct.revision,note:'Independent review confirms published policy addresses interested parties requirements.'},200,reviewer);
 assert.equal((await api(endpoint+'?overview=1')).coverage[iso].compliant,2);assert.equal((await row('4.2')).links.length,0);checks.push('Real policy creation, independent approval/publication, direct POL linking and verification without CTL');
 phase='mandatory scope and justified Annex A exclusion';
 await api(endpoint,{action:'save',name:iso,ref:'4.1',revision:(await row()).revision,applicability:'excluded',reason:'Invalid mandatory clause exclusion',links:[]},400);
 const before=(await api(endpoint+'?overview=1'));await open(page,'A.5.1');const annex=tableRow(page,'A.5.1');
 await annex.getByRole('combobox',{name:'A.5.1 · SoA scope'}).selectOption('excluded');await expect(annex.getByRole('button',{name:'Save scope',exact:true})).toBeDisabled();await annex.getByLabel('Exclusion rationale').fill('Synthetic exclusion to validate denominator and open count updates.');await annex.getByRole('button',{name:'Save scope',exact:true}).click();
 await expect(annex.locator('.posture-status')).toHaveText('Excluded');const after=await api(endpoint+'?overview=1');assert.equal(after.coverage[iso].scope,before.coverage[iso].scope-1);assert.equal(after.comparison[iso].openCount,before.comparison[iso].openCount-1);checks.push('Mandatory clauses protected; Annex A rationale required; denominator and open count update');
 phase='single optional control combobox';const ctl=await api('/api/grc',{module:'Kontroller',data:{controlTitle:'QA reusable context control',owner,frequency:'Annual',implementation:'Uygulama Hazırlığında',status:'Taslak'}},201);
 await open(page,'4.3');const combo=page.getByRole('combobox',{name:'Link a library control',exact:true});await combo.fill(ctl.code);await expect(page.getByRole('option').filter({hasText:ctl.code})).toBeVisible();await combo.press('Escape');await expect(page.locator('.posture-editor')).toBeVisible();await combo.fill(ctl.code);await combo.press('ArrowDown');await combo.press('Enter');await page.getByRole('button',{name:'Link and save',exact:true}).click();await expect.poll(async()=>(await row('4.3')).links.length).toBe(1);assert.equal((await row()).links.length,0);checks.push('Single control combobox: keyboard search, Escape and optional shared control mapping');
 await open(page);
 for(const locale of ['tr','en'])for(const theme of ['light','dark'])for(const width of [1440,390]){
  phase=`layout ${locale}/${theme}/${width}`;await page.setViewportSize({width,height:900});await switchQaLocale(page,locale);if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();await waitForQaIdle(page);
  await expect(tableRow(page,'4.1').locator('.posture-status')).toHaveText(locale==='tr'?'Uyumlu':'Compliant');await expect(page.locator('.posture-direct')).toContainText(evidence.code);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),phase);await page.locator('.posture-register').screenshot({path:`${out}/${locale}-${theme}-${width}.png`});
 }
 checks.push('TR/EN × light/dark × 1440/390 layouts; no horizontal page overflow');
 assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({result:'passed',checks,errors},null,2));console.log('DIRECT_REQUIREMENT_QA_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/failure.json`,JSON.stringify({phase,error:error.message,errors},null,2));throw error;}finally{await browser.close();}
