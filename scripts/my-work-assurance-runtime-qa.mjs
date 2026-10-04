import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { qaPassword } from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='my-work-assurance-qa-artifacts';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();
page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function seed(sql){const file=`${out}/local-fixture.sql`;await fs.writeFile(file,sql);execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});}
const panel=page.locator('.mw-assurance-signals');
async function open(){await page.locator('nav button[aria-label="My Work"]').evaluate(el=>el.click());await expect(panel.getByRole('button',{name:'Refresh assurance',exact:true})).toBeEnabled();await expect(panel.locator('.mw-assurance-groups')).toBeVisible();}
async function evidenceList(){await panel.locator('.mw-assurance-groups').getByRole('button',{name:/Evidence review/}).click();}
let seeded=false;
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
 for(const path of ['/api/evidence-automation','/api/continuous-assurance','/api/findings'])assert.equal((await context.request.get(base+path)).status(),200);
 const stamp=new Date().toISOString();
 const rows=Array.from({length:10},(_,i)=>({id:`qa-work-assurance-${String(i).padStart(2,'0')}`,data:{evidenceTitle:`QA WORK ${i}`,owner:i===9?'qa-admin@fornost.test.other':'qa-admin@fornost.test',status:'Draft'}}));
 seeded=true;await seed(rows.map(row=>`INSERT INTO simple_grc_records VALUES(${q(row.id)},'Kanıtlar',${q(JSON.stringify(row.data))},${q(stamp)},${q(stamp)});`).join('\n'));
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await open();await evidenceList();
 const seen=new Set();
 for(let p=0;p<30;p++){
  for(const title of await panel.locator('.mw-assurance-records article b').allTextContents())seen.add(title);
  const next=panel.getByRole('button',{name:'Next',exact:true});if(!await next.count()||await next.isDisabled())break;await next.click();
 }
 for(let i=0;i<9;i++)assert.ok(seen.has(`QA WORK ${i}`));assert.ok(!seen.has('QA WORK 9'),'substring owner must not be assigned');
 await page.locator('.mw2-scope').getByRole('button',{name:'Organization',exact:true}).click();await evidenceList();
 let found=false;for(let p=0;p<30;p++){const item=panel.getByRole('button',{name:'Open record: QA WORK 9',exact:true});if(await item.count()){found=true;await item.click();break;}const next=panel.getByRole('button',{name:'Next',exact:true});if(!await next.count()||await next.isDisabled())break;await next.click();}assert.ok(found);
 const records=await (await context.request.get(base+'/api/grc')).json();
 const target=records.rows.find(row=>row.id==='qa-work-assurance-09');assert.ok(target);
 await expect(page.locator('.core-record-focus')).toContainText(target.recordCode||target.record_code||target.code||target.id);
 await expect(page.locator('.table-card .table-wrap tbody tr')).toHaveCount(1);
 await expect(page.locator('.table-card .table-wrap')).toContainText('QA WORK 9');
 await open();
 await page.route('**/api/controls/assurance',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await panel.getByRole('button',{name:'Refresh assurance',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('could not be loaded');await expect(panel.locator('.mw-assurance-groups')).toHaveCount(0);
 await page.unroute('**/api/controls/assurance');await panel.getByRole('button',{name:'Refresh assurance',exact:true}).click();await expect(panel.locator('.mw-assurance-groups')).toBeVisible();
 await seed("UPDATE simple_grc_records SET data_json='{' WHERE id='qa-work-assurance-00';");
 await panel.getByRole('button',{name:'Refresh assurance',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Evaluation incomplete');await expect(panel.locator('.mw-assurance-groups')).toHaveCount(0);
 await seed(`UPDATE simple_grc_records SET data_json=${q(JSON.stringify(rows[0].data))} WHERE id='qa-work-assurance-00';`);
 await panel.getByRole('button',{name:'Refresh assurance',exact:true}).click();await expect(panel.locator('.mw-assurance-groups')).toBeVisible();
 for(const theme of ['light','dark'])for(const width of [1536,390]){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:960});await panel.scrollIntoViewIfNeeded();assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`${out}/${theme}-${width}.png`});}
 await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();await expect(panel).toContainText('Neden dikkat gerekiyor?');
 assert.deepEqual(errors,[]);console.log('MY_WORK_ASSURANCE_QA passed: assignment, pagination, organization, navigation, outage, incomplete source, recovery, themes and mobile');
}finally{if(seeded)await seed("DELETE FROM simple_grc_record_codes WHERE record_id LIKE 'qa-work-assurance-%'; DELETE FROM simple_grc_records WHERE id LIKE 'qa-work-assurance-%';");await browser.close();}
