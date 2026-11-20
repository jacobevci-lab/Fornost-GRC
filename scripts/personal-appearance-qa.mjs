// Disposable installation only. Verify the normal settings entry, account scope and actual rendered surfaces.
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {qaPassword} from './qa-credentials.mjs';

const base='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH || undefined});
const admin=await browser.newContext({viewport:{width:1440,height:960}});
const page=await admin.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const out=await mkdtemp(path.join(tmpdir(),'fornost-appearance-'));
const read=(context)=>context.request.get(base+'/api/appearance');
const login=(context,email)=>context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email,password:qaPassword()}});
const dialog=page.locator('.appearance-dialog');
const select=(id)=>dialog.locator('label').filter({has:page.locator('input[value="'+id+'"]')}).click();
const open=()=>page.locator('.appearance-launcher').click();
const root=page.locator('html');
async function painted(p) {
  return p.evaluate(()=>{
    const bg=s=>getComputedStyle(document.querySelector(s)).backgroundColor;
    return [bg('.shell>main>header'),bg('.shell>aside'),bg('.nav-group-items button[aria-current="page"]'),
      getComputedStyle(document.documentElement).getPropertyValue('--ws-brand').trim()];
  });
}
try {
  assert.equal((await read(admin)).status(),401);
  const adminMail='qa-admin@fornost.test';
  assert.equal((await login(admin,adminMail)).status(),200);
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('nav button[aria-label="System Settings"]').evaluate(el=>el.click());
  const settings=page.locator('.settings-subnav').getByRole('button',{name:'Appearance',exact:true});
  await expect(settings).toBeVisible();
  const original=await painted(page);
  await settings.click();
  await expect(dialog.locator('input:checked')).toHaveValue('default');
  const expectedLight={nar:['rgb(81, 22, 38)','rgb(255, 250, 247)','rgb(155, 39, 70)'],
    'carbon-saffron':['rgb(250, 249, 243)','rgb(36, 37, 34)','rgb(255, 211, 74)'],
    traverten:['rgb(255, 252, 247)','rgb(235, 227, 213)','rgb(161, 70, 44)']};
  for(const [id,colors] of Object.entries(expectedLight)){
    await select(id);await expect(root).toHaveAttribute('data-palette',id);
    await expect.poll(async()=>(await painted(page)).slice(0,3),{message:id+' palette chrome'}).toEqual(colors);
    assert.deepEqual(await (await read(admin)).json(),{palette:'default'});
  }
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(settings).toBeFocused();
  await expect.poll(()=>painted(page)).toEqual(original);
  await settings.click();await select('nar');await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();await expect(root).toHaveAttribute('data-palette','nar');
  const second=await browser.newContext();
  assert.equal((await login(second,adminMail)).status(),200);
  assert.deepEqual(await (await read(second)).json(),{palette:'nar'});
  const viewerMail='appearance-'+Date.now()+'@fornost.test';
  const created=await admin.request.post(base+'/api/users',{headers:{origin:base},data:{name:'QA Viewer',email:viewerMail,password:qaPassword(),role:'Viewer',moduleAccess:{mode:'scoped',modules:{'Risk Assessment':'read'}}}});
  assert.equal(created.status(),201);
  assert.equal((await login(second,viewerMail)).status(),200);
  await expect.poll(async()=>await (await read(second)).json()).toEqual({palette:'default'});
  const restricted=await second.newPage();await restricted.goto(base);await expect(restricted.locator('.shell')).toBeVisible();
  await restricted.locator('.appearance-launcher').click();
  const vd=restricted.locator('.appearance-dialog');
  await vd.locator('label').filter({has:restricted.locator('input[value="carbon-saffron"]')}).click();
  await vd.getByRole('button',{name:/^(Kaydet|Save)$/}).click();await expect(vd).toHaveCount(0);
  assert.deepEqual(await (await read(second)).json(),{palette:'carbon-saffron'});
  assert.deepEqual(await (await read(admin)).json(),{palette:'nar'});
  for(const data of [{palette:'unknown'},{palette:'nar',user_id:'another'}]){
    assert.equal((await second.request.put(base+'/api/appearance',{headers:{origin:base},data})).status(),400);
  }
  await second.close();
  // Failed writes allow retry and cancellation returns to the last confirmed palette.
  await open();await select('traverten');
  await page.route('**/api/appearance',route=>route.request().method()==='PUT'?route.fulfill({status:503,json:{}}):route.continue());
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(root).toHaveAttribute('data-palette','nar');await page.unroute('**/api/appearance');
  for(const mode of ['light','dark']){
    if(await root.getAttribute('data-theme')!==mode)await page.locator('.theme-toggle:visible').click();
    await open();
    for(const id of ['nar','carbon-saffron','traverten']){
      await select(id);await expect(root).toHaveAttribute('data-palette',id);
      const report=await new AxeBuilder({page}).include('.appearance-dialog').withTags(['wcag2a','wcag2aa']).analyze();
      assert.deepEqual(report.violations.map(v=>v.id),[],mode+' '+id+' picker accessibility');
      await page.screenshot({path:path.join(out,mode+'-'+id+'.png')});
    }
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  for(const mode of ['light','dark']){
    if(await root.getAttribute('data-theme')!==mode)await page.locator('.theme-toggle:visible').click();
    for(const id of ['traverten','carbon-saffron','nar']){
      await open(); await select(id);
      await dialog.getByRole('button',{name:'Save',exact:true}).click(); await expect(dialog).toHaveCount(0);
      await page.screenshot({path:path.join(out,mode+'-'+id+'-workspace.png'),animations:'disabled'});
      const a11y=await new AxeBuilder({page}).include('.shell>aside').include('.shell>main>header').withRules(['color-contrast']).analyze();
      assert.deepEqual(a11y.violations.flatMap(v=>v.nodes.map(n=>[n.target,n.failureSummary])),[],mode+' '+id+' navigation contrast');
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.mobile-nav-toggle:visible').click();await open();await select('default');
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().right<=innerWidth));
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.reload();assert.deepEqual(await (await read(admin)).json(),{palette:'default'});
  await expect(root).not.toHaveAttribute('data-palette',/.+/);await expect(root).toHaveAttribute('data-theme','dark');
  assert.deepEqual(errors,[]);console.log('PASS appearance: four choices, preview/cancel/save, dark/light, mobile, account isolation and persistence',out);
} finally {await browser.close();}
