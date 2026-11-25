import {qaPassword} from './qa-credentials.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
// Explicit local D1 fixtures; no collectors or production changes.
const base='http://127.0.0.1:4173',out='control-run-detail-qa-artifacts',prefix='QA-RUN-DETAIL-';
const rule=prefix+'RULE',source=prefix+'SOURCE',finding=prefix+'FINDING',evidence=prefix+'EVIDENCE';
const old=prefix+'OLD',other=prefix+'OTHER',generic=prefix+'ERROR',bad=prefix+'CORRUPT',work=prefix+'WORK',otherWork=prefix+'OTHER-WORK';
const endpoint=id=>'/api/evidence-automation?runId='+encodeURIComponent(id),stamp=new Date().toISOString(),historical='2001-01-01T12:00:00.000Z';
const assessment={templateId:'intune-compliance',templateVersion:1,status:'pass',total:2,passed:2,failed:0,unknown:0,score:100,evaluatedAt:historical,scope:'credential-visible',issues:[],issuesTruncated:false};
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));let checks=0,seeded=false,writes=0;
page.on('request',request=>{if(request.method()==='POST'&&['/api/evidence-automation','/api/continuous-assurance','/api/grc'].includes(new URL(request.url()).pathname))writes++;});
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=out+'/fixture.sql';await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);checks++;return r.json();}
async function focus(id){await page.evaluate(id=>{const request={module:'Bağlantılı GRC',kind:'assurance-work',ref:id,source:'qa-run-result'};sessionStorage.setItem('fornost:pending-focus',JSON.stringify({...request,createdAt:Date.now()}));document.querySelector('nav button[aria-label="Connected GRC Map"],nav button[aria-label="Bağlantılı GRC Haritası"]')?.click();window.dispatchEvent(new CustomEvent('fornost:focus',{detail:request}));},id);}
const dialog=page.locator('.assurance-result-dialog'),detail=dialog.locator('.control-run-record[data-run-id]');
async function openWork(id=work){await focus(id);await expect(page.locator(`.assurance-work-list>article[data-work-id="${id}"]`)).toBeVisible();await page.locator('.assurance-work-queue').getByRole('button',{name:/^(View Test Result|Test Sonucunu Aç)$/}).click();await expect(dialog).toBeVisible();await expect(detail).toHaveAttribute('data-run-id',id===work?old:other);}
try{
 await api(context,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 for(const path of ['/api/grc','/api/evidence-automation','/api/continuous-assurance'])await api(context,path);
 const evidenceRow=`INSERT INTO simple_grc_records VALUES(${q(evidence)},'Kanıtlar',${q(JSON.stringify({evidenceTitle:'QA Historical Run Evidence',controlRef:prefix+'CONTROL',status:'Approved',validationStatus:'pass',automationRunId:old,automationRuleId:rule}))},${q(historical)},${q(historical)});`;
 const run=(id,status='pass',at=stamp,diagnostics=null,ev=null)=>`INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor,assessment_json,trigger_type,duration_ms,error_code) VALUES(${q(id)},${q(rule)},'QA Original Rule',${q(id===generic?'QA Generic Run':'QA Historical Source')},${q(status)},${status==='pass'?100:0},'Saved diagnostic detail','',${ev?q(ev):'NULL'},${q(at)},'qa',${diagnostics===null?'NULL':q(diagnostics)},'manual',42,${status==='error'?"'QA_COLLECTION_ERROR'":'NULL'});`;
 const item=(id,runId)=>`INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,result_ref,decision_json,actor,created_at,updated_at) VALUES(${q(id)},${q(finding)},${q(rule)},'control-retest','completed',${q(runId)},'{}','qa',${q(stamp)},${q(stamp)});`;
 seeded=true;await seed(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES(${q(source)},'QA Changed Source','Custom','Custom','rest-json','{}',${q(stamp)},${q(stamp)},'qa');
 INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES(${q(rule)},'QA Changed Rule',${q(source)},'A.8.1','value','eq','1','daily',${q(stamp)},${q(stamp)},'qa');
 INSERT INTO evidence_automation_findings(id,rule_id,title,severity,owner,due_date,status,detail,created_at,updated_at) VALUES(${q(finding)},${q(rule)},'QA Historical Finding','high','QA','2099-01-01','closed','Fixture',${q(stamp)},${q(stamp)});
 ${evidenceRow}${run(old,'pass',historical,JSON.stringify(assessment),evidence)}${run(other,'pass',historical,null,evidence)}${run(bad,'pass',historical,'broken')}
 ${Array.from({length:105},(_,i)=>run(prefix+'RECENT-'+i)).join('\n')}${run(generic,'error',new Date(Date.now()+1000).toISOString())}${item(work,old)}${item(otherWork,other)}`);
 const snapshot=(await api(context,endpoint(old))).run;assert.equal(snapshot.ruleName,'QA Original Rule');assert.equal(snapshot.sourceName,'QA Historical Source');assert.equal(snapshot.createdAt,historical);assert.equal(snapshot.evidenceState,'available');assert.equal(snapshot.durationMs,42);assert.deepEqual(snapshot.assessment,assessment);
 assert.ok(!(await api(context,'/api/evidence-automation')).runs.some(row=>row.id===old));
 for(const id of [old.toLowerCase(),old+'-10',"' OR 1=1 --"])await api(context,endpoint(id),'GET',undefined,404);
 for(const path of [endpoint(''),endpoint(' padded'),endpoint('x'.repeat(81)),endpoint('bad\nID'),endpoint(old)+'&runId=other',endpoint(old)+'&q=QA'])await api(context,path,'GET',undefined,400);
 await api(context,endpoint(bad),'GET',undefined,503);
 await seed(`UPDATE simple_grc_records SET module='Kontroller' WHERE id=${q(evidence)}`);assert.equal((await api(context,endpoint(old))).run.evidenceState,'missing');await seed(`UPDATE simple_grc_records SET module='Kanıtlar' WHERE id=${q(evidence)}`);
 const anonymous=await browser.newContext();await api(anonymous,endpoint(old),'GET',undefined,401);await anonymous.close();
 for(const [role,access,status] of [['Viewer',{mode:'full'},200],['Editor',{mode:'full'},200],['Editor',{mode:'scoped',modules:{Kontroller:'read',Kanıtlar:'read'}},403]]){
  const email=`qa-run-${role.toLowerCase()}-${status}@fornost.test`;await api(context,'/api/users','POST',{name:'QA Run '+role,email,password:qaPassword(),role,moduleAccess:access},201);
  const actor=await browser.newContext();await api(actor,'/api/auth','POST',{action:'login',email,password:qaPassword()});await api(actor,endpoint(old),'GET',undefined,status);await actor.close();
 }
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await openWork();await expect(detail.locator('.control-run-status')).toHaveText('Passed');await expect(detail).toContainText('QA Original Rule');await expect(detail).toContainText('QA Historical Source');await expect(detail).toContainText('2001');await expect(detail).toContainText('not a current assurance assessment');assert.deepEqual(await detail.locator('.ea-assessment-counts b').allTextContents(),['2','2','0','0']);
 const code=(await api(context,'/api/grc')).rows.find(row=>row.id===evidence).record_code;assert.ok(code);
 await detail.getByRole('button',{name:'Open Evidence',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.core-record-focus')).toContainText(code);await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);await expect(page.locator('.table-card .table-wrap')).toContainText('QA Historical Run Evidence');
 await openWork();
 let mode='wrong-id';await page.route('**/api/evidence-automation?runId=*',async route=>{
  if(mode==='outage')return route.fulfill({status:503,json:{error:'Isolated outage'}});
  if(mode==='html')return route.fulfill({status:200,contentType:'text/html',body:'<html>Unusable response</html>'});
  const patch=mode==='wrong-id'?{id:old+'-10'}:mode==='wrong-rule'?{ruleId:rule+'-10'}:mode==='bad-counts'?{assessment:{...assessment,total:99}}:{evidenceId:null,evidenceState:'available'};
  return route.fulfill({json:{run:{...snapshot,...patch}}});
 });
 for(mode of ['wrong-id','wrong-rule','bad-counts','bad-evidence','outage','html']){
  await dialog.getByRole('button',{name:/^(Refresh|Retry)$/}).click();await expect(dialog.getByRole('alert')).toContainText('could not be verified');await expect(detail).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Open Evidence',exact:true})).toHaveCount(0);
 }
 await page.unroute('**/api/evidence-automation?runId=*');await dialog.getByRole('button',{name:'Retry',exact:true}).click();await expect(detail).toHaveAttribute('data-run-id',old);
 // Delayed A cannot replace a newer B, and refresh never exposes stale evidence actions.
 let release,finish,held=false;const barrier=new Promise(r=>{release=r}),finished=new Promise(r=>{finish=r});
 await page.route('**/api/evidence-automation?runId=*',async route=>{if(new URL(route.request().url()).searchParams.get('runId')!==old||held)return route.continue();const response=await route.fetch();held=true;await barrier;try{await route.fulfill({response});}catch{/* request superseded */}finally{finish();}});
 await detail.getByRole('button',{name:'Refresh',exact:true}).click();await expect.poll(()=>held).toBe(true);await expect(detail).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Open Evidence',exact:true})).toHaveCount(0);await expect(dialog.getByRole('status')).toContainText('Loading results');
 await focus(otherWork);await expect(dialog).toHaveCount(0);await page.locator('.assurance-work-queue').getByRole('button',{name:'View Test Result',exact:true}).click();await expect(detail).toHaveAttribute('data-run-id',other);release();await finished;await expect(detail).toHaveAttribute('data-run-id',other);await page.unroute('**/api/evidence-automation?runId=*');
 await page.keyboard.press('Escape');await openWork();await seed(`DELETE FROM simple_grc_records WHERE id=${q(evidence)}`);await detail.getByRole('button',{name:'Refresh',exact:true}).click();await expect(detail).toContainText('linked evidence record was not found');await expect(detail.getByRole('button',{name:'Open Evidence',exact:true})).toHaveCount(0);await expect(detail.locator('.control-run-status')).toHaveText('Passed');
 await seed(evidenceRow);await detail.getByRole('button',{name:'Refresh',exact:true}).click();await expect(detail.getByRole('button',{name:'Open Evidence',exact:true})).toBeVisible();
 await page.route('**/api/evidence-automation?runId=*',route=>route.fulfill({status:404,json:{error:'Selected run removed'}}));await detail.getByRole('button',{name:'Refresh',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('was not found');await expect(detail).toHaveCount(0);await page.unroute('**/api/evidence-automation?runId=*');await dialog.getByRole('button',{name:'Retry',exact:true}).click();await expect(detail).toHaveAttribute('data-run-id',old);await page.keyboard.press('Escape');
 for(const lang of ['en','tr'])for(const [theme,width] of [['light',1536],['dark',390]]){
  await page.setViewportSize({width,height:960});await page.locator('.language-switch:visible').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await openWork();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);assert.ok(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)<=4);await dialog.evaluate(el=>{el.scrollTop=0});await page.screenshot({path:`${out}/result-${lang}-${theme}-${width}.png`});
  if(width===390){await detail.getByRole('button',{name:/^(Open Evidence|Kanıtı Aç)$/}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/evidence-${lang}-${theme}-${width}.png`});}
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 }
 // The same reliable view also serves ordinary/custom runs in automation history.
 await page.setViewportSize({width:1536,height:960});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Evidence Automation"]').evaluate(el=>el.click());await page.locator('.ea-tabs').getByRole('button',{name:'Run History',exact:true}).click();await page.locator('.ea-table tr').filter({hasText:'QA Generic Run'}).getByRole('button',{name:'View Results',exact:true}).click();
 const genericDialog=page.getByRole('dialog',{name:'Control results',exact:true});await expect(genericDialog.locator('[data-run-id]')).toHaveAttribute('data-run-id',generic);await expect(genericDialog).toContainText('QA_COLLECTION_ERROR');await expect(genericDialog).toContainText('No evidence record was captured');await expect(genericDialog.locator('.ea-assessment-counts')).toHaveCount(0);
 assert.equal(writes,0,'Result and evidence navigation must never execute a test or write a business record');assert.deepEqual(errors,[]);
 console.log(`CONTROL_RUN_DETAIL_QA_PASS: ${checks} API checks; exact historical run beyond 100; role boundaries; immutable run metadata; evidence drill-through and missing evidence; corrupt/mismatched/HTML/outage/missing result recovery; stale-response isolation; generic results; TR/EN responsive themes; zero business writes.`);
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});console.log('CONTROL_RUN_DETAIL_QA_FAILURE',JSON.stringify({message:String(error),errors}));throw error;}
finally{try{await page.close();if(seeded)await seed(`DELETE FROM continuous_assurance_work_items WHERE id GLOB '${prefix}*';DELETE FROM evidence_automation_runs WHERE id GLOB '${prefix}*';DELETE FROM simple_grc_record_codes WHERE record_id GLOB '${prefix}*';DELETE FROM simple_grc_records WHERE id GLOB '${prefix}*';DELETE FROM evidence_automation_findings WHERE id=${q(finding)};DELETE FROM evidence_automation_rules WHERE id=${q(rule)};DELETE FROM evidence_automation_sources WHERE id=${q(source)};`);}finally{await browser.close();}}
