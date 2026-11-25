import {chooseQaReviewer} from './automation-reviewer-qa.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale} from './qa-browser-harness.mjs';

// Fixed disposable runtime. Rendered agent output and save acknowledgement are
// explicitly substituted; real collection/approval persistence is tested in SQLite.
const base='http://127.0.0.1:4173',endpoint='/api/evidence-automation',out='evidence-mapping-qa-artifacts';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(15000);const errors=[],saves=[],checks=[];let mode='success',analysisCalls=0;
const source={id:'mapping-ui-source',name:'QA Intune evidence mapping',driver:'provider-v1',vendor:'Intune',category:'Cloud',enabled:true,config:{providerId:'intune',dataset:'managed-devices'},lastTestStatus:'success'};
const report={sourceId:source.id,collectedAt:new Date().toISOString(),payloadHash:'a'.repeat(64),catalogTruncated:true,
 assessments:[{templateId:'intune-encryption',templateVersion:1,name:'Intune disk encryption',status:'fail',total:3,passed:2,failed:1,unknown:0,scope:'credential-visible'}],
 controls:[{id:'CTL-901',ref:'CTL-901',title:'Endpoint encryption',description:'Encrypt managed endpoints'}],
 proposals:[{templateId:'intune-encryption',controlId:'CTL-901',rationale:'Encryption state supports assessment of managed endpoints.',missingEvidence:'Recovery-key escrow and unmanaged endpoints require separate evidence.'}],summary:'One endpoint reports missing encryption.'};
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,`Unexpected ${method} ${path} status`);return r.json();}
try{
 await mkdir(out,{recursive:true});await api(context,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 // Real API enforcement without enabling AI or contacting any provider.
 await api(context,endpoint+'/mapping-agent','POST',{sourceId:source.id,lang:'en'},409);
 for(const role of ['Editor','Viewer']){
  const email=`qa-mapping-${role.toLowerCase()}@fornost.test`;
  await api(context,'/api/users','POST',{name:`Mapping ${role}`,email,password:qaPassword(),role},201);
  const other=await browser.newContext();await api(other,'/api/auth','POST',{action:'login',email,password:qaPassword()});
  await api(other,endpoint+'/mapping-agent','POST',{sourceId:source.id,lang:'en'},403);await other.close();
 }
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(url=>url.pathname===endpoint,async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{sources:[source],rules:[],runs:[],findings:[]}});
  const body=route.request().postDataJSON();assert.equal(body.action,'save-template-rule');saves.push(body);return route.fulfill({json:{ok:true,ruleId:'fixture-rule',message:'Saved fixture'}});
 });
 await page.route(url=>url.pathname===endpoint+'/mapping-agent',route=>{
  analysisCalls++;assert.equal(route.request().postDataJSON().sourceId,source.id);
  if(mode==='error')return route.fulfill({status:422,json:{code:'MAPPING_INCOMPLETE_COLLECTION'}});
  return route.fulfill({json:{runId:'mapping-fixture-run',report:{...report,proposals:mode==='empty'?[]:report.proposals}}});
 });
 for(const lang of ['tr','en'])for(const theme of ['light','dark'])for(const width of [1440,390]){
  const tr=lang==='tr';await page.setViewportSize({width,height:1000});await page.goto(base);await switchQaLocale(page,lang);
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
  await openQaModule(page,tr?'Kanıt Otomasyonu':'Evidence Automation');
  await page.getByRole('button',{name:tr?'AI ile kanıt eşleştir':'Map evidence with AI',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:tr?'Kanıt eşleştirme ajanı':'Evidence mapping agent',exact:true});
  const before=saves.length,calls=analysisCalls;
  await dialog.getByRole('button',{name:tr?'Kanıtı incele ve eşleştir':'Inspect evidence and map',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:'CTL-901 · Endpoint encryption',exact:true})).toBeVisible();
  assert.equal(analysisCalls,calls+1);assert.equal(saves.length,before,'Analysis must not activate a rule');
  await expect(dialog).toContainText(tr?'sınırlı bir bölümü':'bounded subset');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No page overflow');
  await dialog.screenshot({path:`${out}/mapping-${lang}-${theme}-${width}.png`});
  const prepare=dialog.getByRole('button',{name:tr?'Eşlemeyi incele ve kontrolü hazırla':'Review mapping and prepare control',exact:true});await prepare.focus();await page.keyboard.press('Enter');
  const ready=page.getByRole('dialog',{name:tr?'Hazır kontrol etkinleştir':'Enable ready control',exact:true});
  await expect(ready.getByLabel(tr?'Hazır test':'Ready test',{exact:true})).toHaveValue('intune-encryption');
  await expect(ready.getByLabel(tr?'Bağlı kontrol/maddeler':'Mapped controls',{exact:true})).toHaveValue('CTL-901');
  await expect(ready.getByLabel(tr?'Bağlı kontrol/maddeler':'Mapped controls',{exact:true})).not.toBeEditable();
  await chooseQaReviewer(ready,'qa-mapping-editor@fornost.test');assert.equal(saves.length,before);await ready.getByRole('button',{name:tr?'Hazır Kontrolü Etkinleştir':'Enable Ready Control',exact:true}).click();await expect(ready).toBeHidden();
  assert.equal(saves.length,before+1);assert.equal(saves.at(-1).mappingRunId,'mapping-fixture-run');assert.equal(saves.at(-1).mappingProposalIndex,0);assert.equal(saves.at(-1).controlRefs,'CTL-901');checks.push(`${lang}/${theme}/${width}`);
 }
 for(const state of ['empty','error']){
  mode=state;await page.goto(base);await switchQaLocale(page,'en');await openQaModule(page,'Evidence Automation');
  await page.getByRole('button',{name:'Map evidence with AI',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Evidence mapping agent',exact:true});
  await dialog.getByRole('button',{name:'Inspect evidence and map',exact:true}).click();
  await expect(dialog).toContainText(state==='empty'?'No defensible mapping found':'Source data could not verify');
  await expect(dialog.getByRole('button',{name:'Review mapping and prepare control',exact:true})).toHaveCount(0);
 }
 assert.deepEqual(errors,[]);const result={status:'PASS',checks,roleDenials:2,blockedAi:1,analysisCalls,explicitApprovals:saves.length,externalProviderCalls:0,transport:'Agent output and save acknowledgement substituted; real persistence covered by SQLite tests'};
 await writeFile(`${out}/result.json`,JSON.stringify(result,null,2));console.log('EVIDENCE_MAPPING_AGENT_QA_PASS',JSON.stringify(result));
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
