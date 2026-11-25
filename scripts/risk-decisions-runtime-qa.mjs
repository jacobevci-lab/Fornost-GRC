import { qaPassword } from "./qa-credentials.mjs";
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Every fixture and mutation is confined to fixed loopback and explicit local D1.
const base='http://127.0.0.1:4173',out='risk-decisions-qa-artifacts',password=qaPassword(),endpoint='/api/continuous-assurance/governance';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const admin=await browser.newContext({viewport:{width:1536,height:960}}),page=await admin.newPage();
page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0,seeded=false;
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=`${out}/fixture.sql`;await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);checks++;return r.json();}
async function open(){await page.locator('nav button[aria-label="Connected GRC Map"]').evaluate(el=>el.click());await page.getByRole('group',{name:'Map view',exact:true}).getByRole('button',{name:'Assurance',exact:true}).click();const disclosure=panel.locator('xpath=ancestor::details[1]');if(!(await disclosure.evaluate(el=>el.open)))await disclosure.locator(':scope > summary').click();await expect(panel.getByRole('button',{name:'Refresh governance',exact:true})).toBeEnabled();await expect(panel.getByRole('alert')).toHaveCount(0);}
const panel=page.locator('.assurance-governance');
const proposal={residualLikelihood:2,residualImpact:3,rationale:'Independent reassessment supported by documented control evidence.',evidenceReference:'QA RD documented evidence',evidenceSha256:'a'.repeat(64)};
const riskId=i=>`QA-RD-${String(i).padStart(2,'0')}`;
const core=async id=>(await api(admin,'/api/grc')).rows.find(row=>row.id===id);
try{
 await api(admin,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password});
 await api(admin,'/api/grc');await api(admin,'/api/evidence-automation');await api(admin,endpoint);
 const stamp=new Date().toISOString();seeded=true;
 await seed(Array.from({length:12},(_,i)=>`INSERT INTO simple_grc_records VALUES(${q(riskId(i))},'Risk Assessment',${q(JSON.stringify({title:`QA RD risk ${String(i).padStart(2,'0')}`,owner:'QA risk owner',asset:'QA asset',status:'Değerlendiriliyor',inherentLikelihood:'4',inherentImpact:'5',residualLikelihood:'4',residualImpact:'4',residualRiskReviewRequired:true,riskReviewRequestedAt:stamp,assuranceState:'ineffective',lastAssuranceRunRef:'QA RD latest run',reassessmentReason:'A control failure requires independent risk reassessment.'}))},${q(stamp)},${q(stamp)});`).join('\n'));
 await api(admin,'/api/grc');
 const actors={};
 for(const [label,role,moduleAccess] of [['maker','Editor',{mode:'full'}],['viewer','Viewer',{mode:'full'}],['scoped','Editor',{mode:'scoped',modules:{'Risk Assessment':'write'}}]]){
  const email=`qa-risk-${label}@fornost.test`;await api(admin,'/api/users','POST',{name:`QA Risk ${label}`,email,password,role,moduleAccess},201);
  actors[label]=await browser.newContext();await api(actors[label],'/api/auth','POST',{action:'login',email,password});
 }
 await api(actors.viewer,endpoint);await api(actors.viewer,endpoint,'POST',{action:'submit-risk-review',riskId:riskId(0),...proposal},403);
 await api(actors.scoped,endpoint,'GET',undefined,403);await api(actors.scoped,endpoint,'POST',{action:'submit-risk-review',riskId:riskId(0),...proposal},403);
 const original=await api(admin,endpoint),ids={};assert.equal(original.dataQuality.verified,true);
 for(let i=0;i<10;i++){const risk=original.risksRequiringReview.find(x=>x.id===riskId(i));ids[i]=(await api(actors.maker,endpoint,'POST',{action:'submit-risk-review',riskId:i===0?risk.riskRef:risk.id,expectedRiskRevision:risk.context.revision,...proposal},201)).id;}
 const first=original.risksRequiringReview.find(x=>x.id===riskId(0));
 await api(actors.maker,endpoint,'POST',{action:'submit-risk-review',riskId:first.id,expectedRiskRevision:first.context.revision,...proposal},409);
 await api(actors.maker,endpoint,'POST',{action:'review-risk',reviewId:ids[0],decision:'approve'},403);
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await open();
 await panel.getByLabel('Search risks, proposals or exceptions').fill('QA RD');
 await expect(panel.locator('.ag-review-list>.ag-row')).toHaveCount(8);
 await panel.getByRole('navigation',{name:'Proposal pages'}).getByRole('button',{name:'Next',exact:true}).click();await expect(panel.locator('.ag-review-list>.ag-row')).toHaveCount(2);
 // The last risk is reachable and proposals are authored through the real form.
 await panel.getByRole('navigation',{name:'Risk pages'}).getByRole('button',{name:'Next',exact:true}).click();
 await panel.locator('.ag-grid>article').first().locator('.ag-row').filter({hasText:'QA RD risk 11'}).getByRole('button',{name:'Assess',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Risk assessment',exact:true});
 await form.getByLabel('Residual likelihood').fill('2');await form.getByLabel('Residual impact').fill('3');await form.getByLabel('Rationale',{exact:true}).fill(proposal.rationale);
 await form.getByLabel('Evidence reference',{exact:true}).fill(proposal.evidenceReference);await form.getByLabel('SHA-256',{exact:true}).fill(proposal.evidenceSha256);
 await form.getByRole('button',{name:'Submit for Independent Review',exact:true}).click();await expect(form).toHaveCount(0);
 const own=(await api(admin,endpoint)).riskReviews.find(x=>x.riskId===riskId(11));await api(admin,endpoint,'POST',{action:'review-risk',reviewId:own.id,decision:'approve'},409);
 await panel.getByLabel('Search risks, proposals or exceptions').fill('QA RD risk 11');await panel.locator('.ag-review-list').getByRole('button',{name:/Review proposal/}).click();
 let dialog=page.getByRole('dialog',{name:'Review risk proposal',exact:true});await expect(dialog).toContainText('Another administrator');await expect(dialog.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Close',exact:true}).last().click();
 await panel.getByLabel('Search risks, proposals or exceptions').fill('QA RD risk 00');const reviewButton=panel.locator('.ag-review-list').getByRole('button',{name:/Review proposal/});await reviewButton.click();
 await expect(dialog).toContainText('4 × 4 = 16');await expect(dialog).toContainText('2 × 3 = 6');await expect(dialog).toContainText(proposal.rationale);await expect(dialog).toContainText(proposal.evidenceSha256);
 for(const theme of ['light','dark']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);for(const width of [1536,390]){await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);assert.ok(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)<=4);await page.screenshot({path:`${out}/risk-decision-${theme}-${width}.png`});}}
 await page.setViewportSize({width:1536,height:960});
 // A newer edit arrives while the reviewer is reading. The real server rejects the stale decision.
 const before=JSON.parse((await core(riskId(0))).data_json);
 await api(admin,'/api/grc','PATCH',{id:riskId(0),data:{...before,owner:'QA changed owner',residualRiskReviewRequired:false,residualRiskApprovedBy:'forged',residualLikelihood:'1',assuranceState:'effective'}});
 const edited=JSON.parse((await core(riskId(0))).data_json);assert.equal(edited.residualRiskReviewRequired,true);assert.equal(edited.residualLikelihood,'4');assert.equal(edited.residualRiskApprovedBy,undefined);assert.equal(edited.assuranceState,'ineffective');
 await dialog.getByRole('button',{name:'Approve',exact:true}).click();await expect(dialog).toContainText('The risk changed after submission');await expect(dialog.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();
 await dialog.getByRole('textbox').fill('Risk context changed; request a current assessment.');await dialog.getByRole('button',{name:'Reject',exact:true}).click();await expect(dialog).toHaveCount(0);
 await panel.getByLabel('Search risks, proposals or exceptions').fill('QA RD risk 01');await panel.locator('.ag-review-list').getByRole('button',{name:/Review proposal/}).click();await dialog.getByRole('button',{name:'Approve',exact:true}).click();await expect(dialog).toHaveCount(0);
 const approved=JSON.parse((await core(riskId(1))).data_json);assert.equal(approved.residualScore,'6');assert.equal(approved.residualRiskReviewRequired,false);assert.equal(approved.inherentImpact,'5');
 await panel.getByLabel('Proposal view',{exact:true}).selectOption('all');await panel.locator('.ag-review-list').getByRole('button',{name:/Review proposal/}).click();await expect(dialog).toContainText('Approved');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(panel.locator('.ag-review-list').getByRole('button',{name:/Review proposal/})).toBeFocused();
 await page.route('**/api/continuous-assurance/governance',route=>route.fulfill({status:503,json:{error:'Isolated transport fixture'}}));await panel.getByRole('button',{name:'Refresh governance',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('could not be loaded');await expect(panel.locator('.ag-metrics b').first()).toHaveText('—');await page.unroute('**/api/continuous-assurance/governance');await panel.getByRole('button',{name:'Refresh governance',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0);
 // Read bounds remain explicit instead of silently presenting a complete approval queue.
 await seed(Array.from({length:501},(_,i)=>`INSERT INTO continuous_assurance_risk_reviews(id,risk_id,status,proposal_json,submitted_by,submitted_at) VALUES('QA-RD-BOUND-${i}','QA-RD-NO-RISK','rejected','{}','qa',${q(stamp)});`).join('\n'));
 assert.equal((await api(admin,endpoint)).dataQuality.verified,false);await panel.getByRole('button',{name:'Refresh governance',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Evaluation incomplete');await expect(panel.locator('.ag-metrics b').first()).toHaveText('—');
 await seed("DELETE FROM continuous_assurance_risk_reviews WHERE id GLOB 'QA-RD-BOUND-*';");await panel.getByRole('button',{name:'Refresh governance',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0);
 await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();await panel.getByLabel('Risk, teklif veya istisna ara').fill('QA RD risk 02');await panel.locator('.ag-review-list').getByRole('button',{name:/Teklifi incele/}).click();dialog=page.getByRole('dialog',{name:'Risk teklifini incele',exact:true});await expect(dialog).toContainText('Önerilen artık risk');await expect(dialog.getByRole('button',{name:'Onayla',exact:true})).toBeEnabled();await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/summary.json`,JSON.stringify({passed:true,apiChecks:checks,pageErrors:errors},null,2));for(const context of Object.values(actors))await context.close();
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),pageErrors:errors,body:await page.locator('body').innerText().catch(()=>'')},null,2));throw error;}
finally{try{await page.close();if(seeded)await seed("DELETE FROM continuous_assurance_risk_reviews WHERE risk_id GLOB 'QA-RD-*' OR id GLOB 'QA-RD-*'; DELETE FROM simple_grc_record_codes WHERE record_id GLOB 'QA-RD-*'; DELETE FROM simple_grc_records WHERE id GLOB 'QA-RD-*';");}finally{await browser.close();}}
console.log(`RISK_DECISIONS_QA_PASS: ${checks} API checks; full queue pagination, real proposal form, independent approval/rejection, version conflicts, protected register edits, history, read bounds, retry, bilingual dialogs, keyboard focus and both themes at desktop/mobile`);
