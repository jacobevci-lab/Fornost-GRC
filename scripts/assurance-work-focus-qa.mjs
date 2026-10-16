import {qaPassword} from './qa-credentials.mjs';
import {seedCurrentAssessmentFixture} from './current-assessment-qa-fixture.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
// Real local API and explicitly local D1 fixtures. No production writes or collectors.
const base='http://127.0.0.1:4173',out='assurance-work-focus-qa-artifacts',prefix='QA-WORK-FOCUS-',name='QA Assurance Work Focus';
const rule=prefix+'RULE',finding=prefix+'FINDING',control=prefix+'CONTROL';
const ids={closed:prefix+'Z-CLOSED',self:prefix+'SELF',review:prefix+'REVIEW',error:prefix+'ERROR'};
const endpoint=id=>'/api/continuous-assurance?workItemId='+encodeURIComponent(id);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));let checks=0,auditId='',seeded=false,writes=0;
page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/continuous-assurance')writes++;});
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=out+'/fixture.sql';await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
async function api(ctx,path,method='GET',data,status=200){const r=await ctx.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);checks++;return r.json();}
async function focus(target,id){await target.evaluate(id=>{const request={module:'Bağlantılı GRC',kind:'assurance-work',ref:id,source:'qa-native-focus'};sessionStorage.setItem('fornost:pending-focus',JSON.stringify({...request,createdAt:Date.now()}));document.querySelector('nav button[aria-label="Connected GRC Map"],nav button[aria-label="Bağlantılı GRC Haritası"]')?.click();window.dispatchEvent(new CustomEvent('fornost:focus',{detail:request}));},id);}
try{
 await api(context,'/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 for(const path of ['/api/grc','/api/evidence-automation','/api/continuous-assurance','/api/findings','/api/evidence/history'])await api(context,path);
 auditId=(await api(context,'/api/audits','POST',{name,template:'Özel Denetim',auditOwner:'QA',auditType:'Diğer Denetim'},201)).id;
 const stamp=new Date().toISOString();seeded=true;
 const work=(id,status,actor='maker@fornost.test')=>`INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,actor,created_at,updated_at) VALUES(${q(id)},${q(finding)},${q(rule)},'control-retest',${q(status)},${q(JSON.stringify({targetControlRef:control}))},${q(actor)},${q(stamp)},${q(stamp)});`;
 await seed(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('${prefix}SOURCE','QA Focus Source','Custom','Custom','rest-json','{}',${q(stamp)},${q(stamp)},'qa');
 INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES(${q(rule)},'QA Focus Rule','${prefix}SOURCE',${q(control)},'value','eq','1','daily',${q(stamp)},${q(stamp)},'qa');
 INSERT INTO evidence_automation_findings(id,rule_id,title,severity,owner,due_date,status,detail,created_at,updated_at) VALUES(${q(finding)},${q(rule)},'QA Focus Finding','high','QA','2099-01-01','closed','Synthetic focus fixture',${q(stamp)},${q(stamp)});
 INSERT INTO simple_grc_records VALUES('${prefix}AUDIT','Denetim Yönetimi',${q(JSON.stringify({auditName:name,controlRef:control,requirementRef:control,requirementTitle:'Focus workflow'}))},${q(stamp)},${q(stamp)});
 ${work(ids.closed,'completed')}${work(ids.self,'pending-review','qa-admin@fornost.test')}${work(ids.review,'pending-review')}${work(ids.error,'retest-error')}
 ${Array.from({length:501},(_,i)=>work(prefix+'NOISE-'+String(i).padStart(4,'0'),'completed')).join('\n')}`);
 await seedCurrentAssessmentFixture({ruleIds:[rule],prefix:prefix+'PASS',out});
 assert.ok(!(await api(context,'/api/continuous-assurance')).items.some(item=>item.id===ids.closed));
 const closed=await api(context,endpoint(ids.closed));assert.deepEqual(closed.items.map(item=>item.id),[ids.closed]);assert.equal(closed.items[0].status,'completed');assert.equal(closed.coverage.complete,true);assert.equal(closed.nextCursor,null);
 for(const id of [ids.closed.toLowerCase(),ids.closed+'-10',"' OR 1=1 --"])assert.equal((await api(context,endpoint(id))).items.length,0);
 for(const path of [endpoint(''),endpoint(' padded'),endpoint('x'.repeat(121)),endpoint(ids.closed)+'&q=QA',endpoint(ids.closed)+'&filter=active',endpoint(ids.closed)+'&cursor=x',endpoint(ids.closed)+'&workItemId=other'])await api(context,path,'GET',undefined,400);
 const anonymous=await browser.newContext();await api(anonymous,endpoint(ids.closed),'GET',undefined,401);await anonymous.close();
 for(const [role,access,status] of [['Viewer',{mode:'full'},200],['Editor',{mode:'full'},200],['Editor',{mode:'scoped',modules:{Kontroller:'read',Kanıtlar:'read'}},403]]){
  const email=`qa-focus-${role.toLowerCase()}-${status}@fornost.test`;
  await api(context,'/api/users','POST',{name:'QA Focus '+role,email,password:qaPassword(),role,moduleAccess:access},201);
  const actor=await browser.newContext();await api(actor,'/api/auth','POST',{action:'login',email,password:qaPassword()});
  await api(actor,endpoint(ids.review),'GET',undefined,status);
  await api(actor,'/api/continuous-assurance','POST',{action:'review-work-item',workItemId:ids.review,decision:'approve',note:''},403);
  if(role==='Viewer'){
   const viewer=await actor.newPage();await viewer.goto(base);await expect(viewer.locator('.shell')).toBeVisible();await viewer.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await focus(viewer,ids.review);
   const queue=viewer.locator('.assurance-work-queue');await expect(queue.locator(`[data-work-id="${ids.review}"]`)).toBeVisible();await expect(queue.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await expect(queue.getByRole('button',{name:'Reject',exact:true})).toHaveCount(0);await viewer.close();
  }
  await actor.close();
 }
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Audit Management"]').evaluate(el=>el.click());await page.locator('.audit-card-open').filter({hasText:name}).click();
 const gate=page.locator('.audit-readiness-gate');await expect(gate.locator('.audit-readiness-state>span')).toHaveText('NOT READY');await gate.locator('.audit-readiness-metrics button').nth(4).click();
 await expect(gate.locator('.assurance-blocker')).toHaveCount(1);await gate.locator('.assurance-blocker').click();
 const panel=page.locator('.assurance-work-queue'),row=panel.locator('.assurance-work-list>article');
 await expect(panel.locator('.assurance-work-focus')).toContainText(ids.error);await expect(row).toHaveCount(1);await expect(row).toHaveAttribute('data-work-id',ids.error);await expect(row).toContainText('Re-test error');
 await expect(panel.getByRole('button',{name:'Request New Test',exact:true})).toBeEnabled();assert.equal(writes,0,'Opening a work record must not execute it');
 await focus(page,ids.closed);await expect(row).toHaveAttribute('data-work-id',ids.closed);await expect(row).toContainText('Completed');await expect(panel.locator('.assurance-work-summary b').last()).toHaveText('1');await expect(panel.getByRole('searchbox')).toHaveCount(0);
 await focus(page,ids.self);await expect(row).toHaveAttribute('data-work-id',ids.self);await expect(panel.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Reject',exact:true})).toHaveCount(0);
 await focus(page,ids.review);await expect(row).toHaveAttribute('data-work-id',ids.review);await panel.getByRole('button',{name:'Reject',exact:true}).click();
 const dialog=panel.getByRole('dialog',{name:'Review assurance work'});await dialog.locator('textarea').fill('This isolated request is no longer needed.');await dialog.locator('footer button.reject').click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('Rejected');await expect(row).toHaveAttribute('data-work-id',ids.review);assert.equal(writes,1);
 // A slow refresh of A must hide A actions, then never replace a newer B selection.
 await focus(page,ids.closed);await expect(row).toHaveAttribute('data-work-id',ids.closed);
 let release,finish,held=false,mode='held';const barrier=new Promise(r=>{release=r}),finished=new Promise(r=>{finish=r});
 await page.route('**/api/continuous-assurance?*',async route=>{
  const id=new URL(route.request().url()).searchParams.get('workItemId');if(!id)return route.continue();
  if(mode==='held'&&id===ids.closed&&!held){const response=await route.fetch();held=true;await barrier;try{await route.fulfill({response});}catch{/* superseded request aborted */}finally{finish();}return;}
  if(mode==='wrong')return route.fulfill({json:{...closed,workItemId:id,items:[{...closed.items[0],id:ids.closed+'-10'}]}});
  if(mode==='error')return route.fulfill({status:503,json:{error:'Isolated transport failure'}});
  return route.continue();
 });
 await panel.getByRole('button',{name:'Refresh',exact:true}).click();await expect.poll(()=>held).toBe(true);await expect(panel).toHaveAttribute('aria-busy','true');await expect(row).toHaveCount(0);assert.deepEqual(await panel.locator('.assurance-work-summary b').allTextContents(),['—','—','—','—']);
 await focus(page,ids.self);await expect(row).toHaveAttribute('data-work-id',ids.self);release();await finished;await expect(row).toHaveAttribute('data-work-id',ids.self);
 for(mode of ['wrong','error']){await panel.getByRole('button',{name:'Refresh',exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();await expect(row).toHaveCount(0);}
 await page.unroute('**/api/continuous-assurance?*');await panel.getByRole('button',{name:'Refresh',exact:true}).click();await expect(row).toHaveAttribute('data-work-id',ids.self);
 await focus(page,prefix+'MISSING');await expect(panel.locator('.assurance-work-empty')).toContainText('was not found');await expect(row).toHaveCount(0);
 await focus(page,ids.review);await expect(row).toContainText('Rejected');
 for(const lang of ['en','tr'])for(const [theme,width] of [['light',1536],['dark',390]]){
  await page.locator('.language-switch:visible').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);await page.setViewportSize({width,height:960});await panel.scrollIntoViewIfNeeded();
  await expect(row).toHaveAttribute('data-work-id',ids.review);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=4);assert.ok(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)<=4);await page.screenshot({path:`${out}/focused-${lang}-${theme}-${width}.png`});
 }
 await page.setViewportSize({width:1536,height:960});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await panel.getByRole('button',{name:'Show all work',exact:true}).click();await expect(panel.locator('.assurance-work-focus')).toHaveCount(0);await expect(panel.getByRole('searchbox')).toBeVisible();await expect(panel).toHaveAttribute('aria-busy','false');assert.equal(writes,1);assert.deepEqual(errors,[]);
 console.log(`ASSURANCE_WORK_FOCUS_QA_PASS: ${checks} API checks; audit signal to exact work; completed work beyond 500; literal/case-sensitive identity; Viewer/scoped boundaries; independent review with focus retained; stale-response isolation, wrong identity/outage/missing recovery; TR/EN responsive themes.`);
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});console.log('ASSURANCE_WORK_FOCUS_QA_FAILURE',JSON.stringify({message:String(error),errors}));throw error;}
finally{
 try{await page.close();if(seeded)await seed(`DELETE FROM continuous_assurance_work_items WHERE id GLOB '${prefix}*';DELETE FROM evidence_automation_runs WHERE rule_id=${q(rule)};DELETE FROM simple_grc_record_codes WHERE record_id GLOB '${prefix}*';DELETE FROM simple_grc_records WHERE id GLOB '${prefix}*';DELETE FROM evidence_automation_findings WHERE id=${q(finding)};DELETE FROM evidence_automation_rules WHERE id=${q(rule)};DELETE FROM evidence_automation_sources WHERE id='${prefix}SOURCE';`);if(auditId)await seed(`DELETE FROM simple_audits WHERE id=${q(auditId)};`);}finally{await browser.close();}
}
