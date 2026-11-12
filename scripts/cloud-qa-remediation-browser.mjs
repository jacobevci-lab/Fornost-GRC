// Focused local regression run. Starts an isolated local Worker; never targets production.
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {createQaContext,openQaModule,switchQaLocale,waitForQaIdle} from './qa-browser-harness.mjs';
import {qaPassword} from './qa-credentials.mjs';

if(!process.env.GITHUB_ACTIONS)throw new Error('This runner is for the repository CI sandbox; use the supported preview for interactive QA.');
const base='http://127.0.0.1:4186',out=process.env.QA_OUTPUT_DIR||'/tmp/fornost-qa-browser',tag=Date.now();
const owner='qa-admin@fornost.test',reviewerEmail=`qa-fix-reviewer-${tag}@fornost.test`,leadEmail=`qa-fix-lead-${tag}@fornost.test`;
const password=qaPassword(),checks=[],errors=[];
await mkdir(out,{recursive:true});
const log=createWriteStream(`${out}/server.log`);
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4186','--strictPort'],{stdio:['ignore','pipe','pipe'],detached:true});
server.stdout.pipe(log);server.stderr.pipe(log);
let browser,page,phase='server';
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base},timeout:60000});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json()}
async function open(p,label){await p.goto(base);await expect(p.locator('.shell')).toBeVisible();await switchQaLocale(p,'en');await openQaModule(p,label)}
async function login(p,email){await p.goto(base);await p.locator('input[name=email]').fill(email);await p.locator('input[name=password]').fill(password);await p.getByRole('button',{name:'Giriş Yap',exact:true}).click();await expect(p.locator('.shell')).toBeVisible();await switchQaLocale(p,'en')}
async function submit(p,dialog,button,path,status=200){const response=p.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await dialog.getByRole('button',{name:button,exact:true}).click();const r=await response;assert.equal(r.status(),status,await r.text());return r.json()}
async function planDecision(p,label,phrase){await p.locator('.cpd-file').getByRole('button',{name:label,exact:true}).click();const d=p.getByRole('dialog',{name:label,exact:true});await d.locator('[name=note]').fill('Synthetic regression: reviewed draft lifecycle and retained history.');await d.locator('[name=confirmation]').fill(phrase);await submit(p,d,label,'/api/continuity');await expect(d).toBeHidden()}
try{
 const deadline=Date.now()+120000;
 while(true){try{const r=await fetch(base+'/api/auth');if(r.ok)break}catch{}if(Date.now()>deadline)throw Error('Local server did not start');await new Promise(r=>setTimeout(r,500))}
 browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
 const admin=await createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}}),peer=await createQaContext(browser,base,{}, {viewport:{width:1440,height:1000}});
 const auth=await api(admin,'/api/auth');if(auth.bootstrapRequired)await api(admin,'/api/auth','POST',{action:'bootstrap',email:owner,name:'Local QA Administrator',password});
 await admin.clearCookies();page=await admin.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 phase='UI login';await login(page,owner);checks.push('Local administrator signed in through browser form');
 for(const [email,role] of [[reviewerEmail,'Admin'],[leadEmail,'Editor']])await api(admin,'/api/users','POST',{name:`QA Fix ${role}`,email,role,password,moduleAccess:{mode:'full'}},201);

 phase='exact DOCX import';await open(page,'Policy Center');await page.getByRole('button',{name:'Import Word / PDF',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Import a policy document'});
 const bytes=await readFile('tests/fixtures/policy-import-python-docx.docx');
 await dialog.getByLabel('Policy file').setInputFiles({name:'qa-policy.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
 await expect(dialog.getByLabel('Policy text',{exact:true})).toHaveValue(/Yalnızca sentetik test belgesidir/,{timeout:60000});
 await dialog.getByLabel('Policy code',{exact:true}).fill('POL-FIX-'+tag);await dialog.getByLabel('Title',{exact:true}).fill('DOCX browser regression '+tag);
 await dialog.getByLabel('Policy owner',{exact:true}).selectOption(owner);await dialog.getByLabel('Independent reviewer',{exact:true}).selectOption(reviewerEmail);
 await dialog.getByLabel('Planned effective date',{exact:true}).fill('2026-11-12');await dialog.getByLabel('Regulation references').fill('ISO 27001');
 const imported=await submit(page,dialog,'Import as draft','/api/policy-lifecycle');
 const version=page.getByRole('dialog',{name:'Version comparison'});await expect(version).toContainText('Yalnızca sentetik test belgesidir');
 const original=await admin.request.get(new URL(await version.getByRole('link',{name:/Download original file/}).getAttribute('href'),base).href);assert.equal(original.status(),200);assert.deepEqual(await original.body(),bytes);
 await version.screenshot({path:`${out}/docx-import.png`});await page.keyboard.press('Escape');checks.push('Exact cloud-QA DOCX imported via browser; original download bytes match');

 phase='policy cancellation';await open(page,'Policy Center');
 await page.locator('[data-policy-tab=policies]').click();
 const row=page.getByRole('row').filter({hasText:'POL-FIX-'+tag});await row.getByRole('button',{name:'Open',exact:true}).click();
 await page.getByRole('button',{name:'Cancel record',exact:true}).click();dialog=page.getByRole('dialog',{name:'Record cancellation'});
 await dialog.getByLabel('Reason',{exact:true}).selectOption('test');await dialog.locator('textarea').fill('Synthetic browser QA policy; cancel while preserving the imported source file.');await dialog.locator('[name=confirmation]').fill('İPTAL ET');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+2),'Cancellation dialog overflow');await dialog.screenshot({path:`${out}/cancel-${width}.png`})}
 await submit(page,dialog,'Confirm cancellation','/api/policy-lifecycle');await expect(dialog).toBeHidden();
 const policies=await api(admin,'/api/policy-lifecycle');assert.equal(policies.policies.find(p=>p.id===imported.policyId).status,'cancelled');assert.equal(policies.versions.find(v=>v.id===imported.versionId).status,'cancelled');checks.push('Policy cancellation UI preserves imported document and cancels its draft version');

 phase='continuity setup';const asset=await api(admin,'/api/grc','POST',{module:'Varlık Envanteri',data:{title:'QA recovery asset '+tag,assetType:'Sunucu',businessUnit:'QA',owner,criticality:'Kritik',status:'Aktif'}},201);
 const bia=await api(admin,'/api/grc','POST',{module:'BIA',data:{process:'QA recovery process '+tag,processCategory:'Operasyonel Süreç',businessUnit:'QA',owner,criticality:'Kritik',asset:asset.code,rto:4,rpo:1,status:'Taslak'}},201);
 await open(page,'Business Continuity & Resilience');await page.locator('.continuity-hero').getByRole('button',{name:'New Plan'}).click();dialog=page.getByRole('dialog',{name:'New continuity plan',exact:true});
 const planName='QA recovery draft '+tag;
 for(const [name,value] of Object.entries({name:planName,process:'Payments recovery',biaRef:bia.code,dependencies:'Identity and database dependencies',recoveryStrategy:'Restore services from the secondary site and verify their integrity.',communicationPlan:'Notify crisis owners and affected teams.'}))await dialog.locator(`[name=${name}]`).fill(value);
 await dialog.getByLabel('Independent reviewer',{exact:true}).selectOption(reviewerEmail);await dialog.getByLabel('Crisis lead',{exact:true}).selectOption(leadEmail);
 const plan=await submit(page,dialog,'Create draft plan','/api/continuity',201);await expect(dialog).toBeHidden();
 await page.locator('.cpd-index button').filter({hasText:planName}).click();
 phase='edit draft';await page.locator('.cpd-file').getByRole('button',{name:'Edit draft',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit draft',exact:true});await dialog.locator('[name=alternateSite]').fill('Updated recovery location');await submit(page,dialog,'Save changes','/api/continuity');await expect(dialog).toBeHidden();
 let state=await api(admin,'/api/continuity');assert.equal(state.plans.find(p=>p.id===plan.id).alternateSite,'Updated recovery location');
 phase='submit draft';await planDecision(page,'Submit for review','PLANI İNCELEMEYE GÖNDER');await page.locator('.cpd-file').screenshot({path:`${out}/continuity-submitted.png`});
 const reviewer=await peer.newPage();reviewer.setDefaultTimeout(30000);await login(reviewer,reviewerEmail);await open(reviewer,'Business Continuity & Resilience');await reviewer.locator('.cpd-index button').filter({hasText:planName}).click();
 phase='independent review';await planDecision(reviewer,'Approve plan','PLANI ONAYLA');await open(page,'Business Continuity & Resilience');await page.locator('.cpd-index button').filter({hasText:planName}).click();await planDecision(page,'Activate plan','PLANI ETKİNLEŞTİR');
 phase='schedule exercise';await page.locator('.cpd-file').getByRole('button',{name:'Schedule exercise',exact:true}).click();dialog=page.getByRole('dialog',{name:'Schedule exercise',exact:true});await dialog.locator('[name=scenario]').fill('Simulate service loss and validate the recovery sequence with the assigned team.');await dialog.getByLabel('Facilitator',{exact:true}).selectOption(owner);await submit(page,dialog,'Schedule','/api/continuity',201);await expect(dialog).toBeHidden();
 state=await api(admin,'/api/continuity');assert.equal(state.plans.find(p=>p.id===plan.id).status,'active');assert.ok(state.exercises.some(e=>e.planId===plan.id));checks.push('Browser chain: create → edit → submit → independent approve → activate → schedule exercise');
 assert.deepEqual(errors,[],'Browser runtime errors');await waitForQaIdle(page);
 await writeFile(`${out}/result.json`,JSON.stringify({result:'pass',checks},null,2));console.log(JSON.stringify({result:'pass',checks}));
}catch(error){await page?.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/result.json`,JSON.stringify({result:'fail',phase,checks,error:String(error),browserErrors:errors},null,2));throw error}
finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM')}catch{}log.end()}
