import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
const base='http://127.0.0.1:4173',out='relationship-chains-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
page.setDefaultTimeout(20000);
const errors=[],checks=[],tag=Date.now(),owner='qa-admin@fornost.test';let phase='bootstrap';
page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data,status=200,ctx=context){const r=await ctx.request.fetch(base+path,{method,headers:{origin:base},data});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json();}
const create=async(module,data)=>(await api('/api/grc','POST',{module,data},201)).id;
async function open(module,title,p=page){
 await p.goto(base);await expect(p.locator('.shell')).toBeVisible();
 await p.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await p.locator(`#fornost-navigation button[aria-label="${module}"]`).evaluate(b=>b.click());
 const trigger=p.locator('.table-card tbody tr').filter({has:p.getByText(title,{exact:true})}).locator('.record-open');await expect(trigger).toHaveCount(1);await trigger.click();await expect(p.locator('.record-workspace')).toBeVisible();
}
const editor=()=>page.locator('.cgw-editor');
async function saveLink(title){await editor().getByRole('combobox',{name:'Target record',exact:true}).fill(title);await editor().getByRole('option').filter({hasText:title}).click();await editor().getByLabel('Change note').fill('QA verifies explicit relationship without status promotion');await editor().getByRole('button',{name:'Save relationship',exact:true}).click();await expect(editor()).toContainText('Relationship saved. View refreshed');await editor().getByRole('button',{name:'Close',exact:true}).click();}
try{
 const auth=await api('/api/auth');await api('/api/auth','POST',{action:auth.bootstrapRequired?'bootstrap':'login',name:'QA Admin',email:owner,password:qaPassword()});
 const asset=await create('Varlık Envanteri',{title:`Chain asset ${tag}`,assetType:'Yazılım',businessUnit:'Bilgi Teknolojileri',owner,criticality:'Yüksek',status:'Aktif'});
 const bia=await create('BIA',{process:`Chain BIA ${tag}`,businessUnit:'Bilgi Teknolojileri',owner,criticality:'Yüksek',asset,rto:'4 saat',rpo:'1 saat',status:'Taslak'});
 const otherAsset=await create('Varlık Envanteri',{title:`Other asset ${tag}`,assetType:'Yazılım',businessUnit:'Bilgi Teknolojileri',owner,criticality:'Yüksek',status:'Aktif'});
 const otherBia=await create('BIA',{process:`Other BIA ${tag}`,asset:otherAsset,businessUnit:'Bilgi Teknolojileri',owner,criticality:'Yüksek',rto:'4 saat',rpo:'1 saat',status:'Taslak'});
 const risk=await create('Risk Assessment',{title:`Chain risk ${tag}`,owner,asset,processLink:bia,status:'Değerlendiriliyor'});
 const ctl=await create('Kontroller',{controlRef:`CHAIN-${tag}`,controlTitle:`Chain control ${tag}`,owner,frequency:'Aylık',implementation:'Planlandı',status:'Taslak'});
 const records=()=>api('/api/grc');
 phase='real missing control action';await open('Risk Assessment',`Chain risk ${tag}`);
 await expect(page.locator('[data-context-stage="plan"] .relationship-empty')).toContainText('No BCP defined');
 for(const lang of ['TR','EN'])for(const theme of ['light','dark'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
  for(const el of await page.locator('.record-inspector button.relationship-empty').all())await expect(el).toHaveCSS('border-top-style','dashed');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('.record-inspector').screenshot({path:`${out}/missing-${lang}-${theme}-${width}.png`,animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:900});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 checks.push('Missing BCP/control dashed actions render in eight locale/theme/viewport combinations');
 await page.locator('.relationship-tree').getByRole('button',{name:'No control linked · + Link',exact:true}).click();
 await expect(editor().getByLabel('Target module')).toHaveValue('Kontroller');
 await page.keyboard.press('Escape');await expect(editor()).toHaveCount(0);await expect(page.locator('.record-workspace')).toBeVisible();
 await page.locator('.relationship-tree').getByRole('button',{name:'No control linked · + Link',exact:true}).press('Enter');await saveLink(`Chain control ${tag}`);
 let rows=(await records()).rows;assert.match(JSON.parse(rows.find(r=>r.id===risk).data_json).existingControls,new RegExp(ctl));assert.equal(JSON.parse(rows.find(r=>r.id===ctl).data_json).status,'Taslak');
 assert.equal((await api('/api/connected-grc/links?sourceId='+risk)).events.length,1);checks.push('Missing control opens preselected modal; Escape preserves detail; real save refreshes chain and audit, draft stays draft');
 phase='real missing BCP action';
 const plan=await api('/api/continuity','POST',{action:'create-plan',name:`Chain BCP ${tag}`,process:'Identity recovery',biaRef:otherBia,criticality:'high',owner,reviewer:'independent@fornost.test',crisisLead:'crisis@fornost.test',rtoHours:4,rpoHours:1,mtpdHours:8,dependencies:'Identity and database',recoveryStrategy:'Restore services and validate recovery objectives.',communicationPlan:'Notify crisis team and service owners.',minimumStaff:2,reviewDate:'2028-11-27'},201);
 await open('Business Impact Analysis (BIA)',`Chain BIA ${tag}`);
 const planStage=page.locator('[data-context-stage="plan"]');await planStage.getByRole('button',{name:'No BCP defined · + Link',exact:true}).click();await expect(editor().getByLabel('Target module')).toHaveValue('İş Sürekliliği');await saveLink(`Chain BCP ${tag}`);
 const saved=(await api('/api/continuity')).plans.find(p=>p.id===plan.id);assert.equal(saved.biaRef,bia);assert.equal(saved.status,'draft');await expect(planStage.locator('.relationship-status')).toHaveText('Draft');assert.equal((await api('/api/connected-grc/links?sourceId='+plan.id+'&kind=continuity-plan')).events.length,1);
 await planStage.locator('.relationship-card').click();await expect(page.locator('.cpd-file')).toContainText(`Chain BCP ${tag}`);
 await page.locator('.cpd-file').getByRole('button',{name:'Plan details and reviews',exact:true}).click();
 const details=page.getByRole('dialog',{name:'Plan details and reviews',exact:true}).locator('.module-trail-panel');await details.locator('summary').click();await expect(details.locator('[data-context-stage="plan"] .relationship-card[aria-current="true"]')).toContainText(`Chain BCP ${tag}`);
 await details.locator('[data-context-stage="bia"] .relationship-card').click();await expect(page.locator('.record-workspace')).toContainText(`Chain BIA ${tag}`);
 checks.push('Missing BCP links a real draft plan, records audit, preserves approval; BIA → BCP → BIA detail navigation');
 phase='multi-record fixtures';
 for(let n=2;n<=3;n++)await create('Kontroller',{controlRef:`CHAIN-${tag}-${n}`,controlTitle:`Chain control ${tag} ${n}`,owner,frequency:'Aylık',implementation:'Planlandı',status:'Taslak',controlRiskRefs:[risk]});
 for(let n=1;n<=3;n++)await create('Kanıtlar',{evidenceTitle:`Chain evidence ${tag} ${n}`,owner,period:'2026',controlRef:ctl,status:'Taslak'});
 for(let n=2;n<=3;n++)await create('BIA',{process:`Chain BIA ${tag} ${n}`,businessUnit:'Bilgi Teknolojileri',owner,criticality:'Yüksek',asset,rto:'4 saat',rpo:'1 saat',status:'Taslak'});
 await open('Risk Assessment',`Chain risk ${tag}`);
 const tree=page.locator('.relationship-tree');
 const biaStage=page.locator('[data-context-stage="bia"]');await expect(biaStage.locator('.relationship-card')).toHaveCount(2);await biaStage.locator('.relationship-more').click();await expect(biaStage.locator('.relationship-card')).toHaveCount(3);await biaStage.locator('.relationship-more').click();
 await expect(tree.locator('[data-stage="1"]')).toHaveCount(2);await tree.getByRole('button',{name:'Control Library · +1 more records',exact:true}).click();await expect(tree.locator('[data-stage="1"]')).toHaveCount(3);await tree.getByRole('button',{name:'Control Library · Show less',exact:true}).click();
 const ctlBranch=tree.locator('[data-stage="1"]').filter({has:page.locator(`button[data-record-id="${ctl}"]`)});
 await expect(ctlBranch.locator('[data-stage="2"]')).toHaveCount(2);await ctlBranch.getByRole('button',{name:'Evidence Library · +1 more records',exact:true}).click();await expect(ctlBranch.locator('[data-stage="2"]')).toHaveCount(3);
 for(const lang of ['TR','EN'])for(const theme of ['light','dark'])for(const width of [1440,390]){
  phase=`matrix ${lang} ${theme} ${width}`;await page.setViewportSize({width,height:900});await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
  await expect(page.locator(`[data-context-stage="risk"] [data-record-id="${risk}"]`)).toHaveAttribute('aria-current','true');
  for(const badge of await tree.locator('.relationship-status').all()){assert.notEqual(await badge.getAttribute('data-tone'),'positive');}
  const positions=await tree.evaluate(el=>[0,1,2].map(n=>el.querySelector(`[data-stage="${n}"]>.relationship-card`)?.getBoundingClientRect().x));assert.equal(positions[1]-positions[0],16);assert.equal(positions[2]-positions[1],16);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const overflow=await page.locator('.relationship-card,.relationship-empty,.relationship-status').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));assert.deepEqual(overflow,[]);
  await page.locator('.record-inspector').screenshot({path:`${out}/${lang}-${theme}-${width}.png`,animations:'disabled'});
 }
 checks.push('Nested control and evidence disclosure, exact 16px guides, current border, neutral draft badges; eight locale/theme/viewport combinations without overflow');
 phase='detail navigation';await page.setViewportSize({width:1440,height:900});await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await tree.locator(`button[data-record-id="${ctl}"]`).click();await expect(page.locator('.record-inspector>small')).toContainText('Control Library');await tree.locator('[data-stage="2"] .relationship-card').first().click();await expect(page.locator('.record-inspector>small')).toContainText('Evidence Library');
 phase='unavailable plan source';await page.route('**/api/continuity',r=>r.fulfill({status:503,json:{error:'Synthetic unavailable source'}}));await open('Business Impact Analysis (BIA)',`Chain BIA ${tag}`);await expect(page.locator('[data-context-stage="plan"]')).toContainText('Plan links could not be verified');await expect(page.locator('[data-context-stage="plan"] .relationship-empty')).not.toHaveJSProperty('tagName','BUTTON');await page.unroute('**/api/continuity');checks.push('Unavailable continuity source is not represented as a missing, writable plan');
 phase='viewer permissions';const viewerBrowser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});const viewer=await viewerBrowser.newContext();const email=`chain-viewer-${tag}@fornost.test`;await api('/api/users','POST',{name:'Chain viewer',email,role:'Viewer',password:qaPassword(),moduleAccess:{mode:'full'}},201);await api('/api/auth','POST',{action:'login',email,password:qaPassword()},200,viewer);assert.equal((await api('/api/auth','GET',undefined,200,viewer)).user.role,'Viewer');const vp=await viewer.newPage();await open('Business Impact Analysis (BIA)',`Other BIA ${tag}`,vp);await expect(vp.locator('.user small')).toContainText('Viewer');await expect(vp.locator('.business-context button.relationship-empty')).toHaveCount(0);await api('/api/connected-grc/links','POST',{sourceId:risk,targetId:ctl,field:'existingControls',kind:'core',action:'link',note:'forbidden viewer action'},403,viewer);await viewerBrowser.close();checks.push('Viewer sees statuses but no link action; server rejects direct writes');
 assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}catch(e){await writeFile(`${out}/failure.json`,JSON.stringify({phase,error:String(e),errors},null,2));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
