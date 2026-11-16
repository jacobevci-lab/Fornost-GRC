import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {cleanupQaFixture} from './qa-fixture-cleanup.mjs';

const base='http://127.0.0.1:4173',out='audit-management-qa-artifacts';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[],owned=new Set();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function api(path,method='GET',data,status=200){const r=await context.request.fetch(base+path,{method,data,headers:{origin:base}});assert.equal(r.status(),status,await r.text());return r.json();}
async function enter(name){await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="Audit Management"]').evaluate(e=>e.click());await page.locator('.audit-card-open').filter({hasText:name}).click();}
try{
 await mkdir(out,{recursive:true});await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 const name=`QA Audit Management ${Date.now()}`,renamed=name+' renamed';
 const audit=await api('/api/audits','POST',{name,template:'Özel Denetim',auditOwner:'QA',auditor:'QA'},201);owned.add(audit.id);
 await enter(name);const actions=page.getByRole('region',{name:'Audit actions',exact:true}),panel=actions.locator('.audit-action-panel');
 await actions.getByRole('button',{name:'Edit audit',exact:true}).click();await panel.getByLabel('Audit name',{exact:true}).fill(renamed);await panel.getByRole('button',{name:'Save',exact:true}).click();await expect(panel).toHaveCount(0);
 assert.equal((await api('/api/audits')).audits.find(a=>a.id===audit.id).name,renamed);
 await actions.getByRole('button',{name:'Archive',exact:true}).click();await panel.getByRole('button',{name:'Confirm archive',exact:true}).click();await expect(panel).toHaveCount(0);await expect(actions.getByRole('button',{name:'Restore audit',exact:true})).toBeVisible();
 await page.locator('.audit-back').click();await expect(page.locator('.audit-card-open').filter({hasText:renamed})).toHaveCount(0);await page.getByRole('button',{name:/^Archived audits/}).click();await page.locator('.audit-card-open').filter({hasText:renamed}).click();
 await actions.getByRole('button',{name:'Restore audit',exact:true}).click();await panel.getByRole('button',{name:'Restore audit',exact:true}).click();await expect(panel).toHaveCount(0);await expect(actions.getByRole('button',{name:'Archive',exact:true})).toBeVisible();
 // Opening the request workspace creates its retained workflow record. The
 // preflight must show the real dependency and navigate to that workspace.
 await page.getByRole('tab',{name:'Evidence requests',exact:true}).click();await expect(page.locator('.audit-request-panel').getByRole('button',{name:'Reload',exact:true})).toBeEnabled();
 await actions.getByRole('button',{name:'Delete Audit',exact:true}).click();await expect(panel).toContainText('Linked records and history prevent deletion.');await expect(panel.getByRole('button',{name:'Continue to delete confirmation',exact:true})).toHaveCount(0);
 await expect(panel.locator('li')).not.toHaveCount(0);await panel.locator('li').filter({hasText:'Request workflow'}).getByRole('button',{name:'Review →',exact:true}).click();await expect(page.getByRole('tab',{name:'Evidence requests',exact:true})).toHaveAttribute('aria-selected','true');
 for(const locale of ['EN','TR'])for(const theme of ['light','dark'])for(const width of [1440,390]){await page.locator('.language-switch:visible').getByRole('button',{name:locale,exact:true}).click();await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2);await page.screenshot({path:`${out}/actions-${locale}-${theme}-${width}.png`});}
 // Delete a fresh, unopened audit from the portfolio, before any retained
 // workflow history is initialized by the detail workspace.
 await page.setViewportSize({width:1440,height:1000});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 const emptyName=name+' empty',empty=await api('/api/audits','POST',{name:emptyName,template:'Özel Denetim',auditOwner:'QA',auditor:'QA'},201);owned.add(empty.id);
 await page.reload();await expect(page.locator('.shell')).toBeVisible();await page.locator('nav button[aria-label="Audit Management"]').evaluate(e=>e.click());if(await page.locator('.audit-back').isVisible())await page.locator('.audit-back').click();
 await page.locator('.apw-select').filter({hasText:emptyName}).click();const card=page.locator(`.apw-inspector[data-audit-id="${empty.id}"]`);await card.getByRole('button',{name:'Delete Audit',exact:true}).click();await expect(card.locator('.audit-action-panel')).toContainText('No linked work records were found.');await card.getByRole('button',{name:'Continue to delete confirmation',exact:true}).click();await expect(card).toHaveCount(0);assert.ok(!(await api('/api/audits')).audits.some(a=>a.id===empty.id));owned.delete(empty.id);
 assert.deepEqual(errors,[]);console.log('AUDIT_MANAGEMENT_QA_PASS: edit, archive, restore, dependency navigation, guarded and empty deletion, TR/EN responsive themes.');
}catch(error){await writeFile(`${out}/failure.json`,JSON.stringify({message:String(error),stack:error.stack,errors}));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await page.close();for(const id of owned)await cleanupQaFixture(context,base,'audit',id);await browser.close();}
