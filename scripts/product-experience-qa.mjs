import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { qaPassword } from './qa-credentials.mjs';

// Isolated CI only. Read-response fixtures exercise UI states; they are not
// server authorization tests and never replace the independent API regressions.
const base='http://127.0.0.1:4173',out='product-experience-qa-artifacts';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1363,height:960}}),page=await context.newPage();
page.setDefaultTimeout(15000);
const checks=[],errors=[],mutations=[];let source='real',reader=false,releaseLoad;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().startsWith(`${base}/api/`)&&!['GET','HEAD'].includes(r.method()))mutations.push({method:r.method(),path:new URL(r.url()).pathname});});
await page.route('**/api/auth',async route=>{
  if(route.request().method()!=='GET'||!reader)return route.continue();
  const response=await route.fetch(),body=await response.json();
  await route.fulfill({response,json:{...body,user:{...body.user,role:'Viewer'}}});
});
await page.route('**/api/grc',async route=>{
  if(route.request().method()!=='GET'||source==='real')return route.continue();
  if(source==='loading')await new Promise(resolve=>{releaseLoad=resolve;});
  if(source==='error')return route.fulfill({status:503,json:{error:'QA temporary source failure'}});
  await route.fulfill({json:{rows:[],nextCursor:null}});
});
async function open(name){
  await expect(page.locator('.shell')).toBeVisible();
  const mobile=page.locator('.mobile-nav-toggle');
  if(await mobile.isVisible()&&await mobile.getAttribute('aria-expanded')!=='true')await mobile.click();
  const nav=page.locator('#fornost-navigation'),button=nav.getByRole('button',{name,exact:true,includeHidden:true});
  await expect(button).toBeAttached();
  if(!await button.isVisible())for(const group of await nav.locator('.nav-group').all()){
    if(await group.getByRole('button',{name,exact:true,includeHidden:true}).count()){await group.locator('.nav-group-trigger').click();break;}
  }
  await button.click();await expect(page.locator('main>header h1')).toHaveText(name);
}
async function screenshot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true,animations:'disabled'});}
const modules=[
  ['Risk Değerlendirmesi','Risk Assessment','İlk riski ekle','Add your first risk'],
  ['Varlık Envanteri','Asset Inventory','İlk varlığı ekle','Add your first asset'],
  ['İş Etki Analizi (BIA)','Business Impact Analysis (BIA)','İlk iş etki analizini ekle','Add your first impact assessment'],
  ['Uyum Yönetimi','Compliance Management','İlk uyum kaydını ekle','Add your first compliance record'],
  ['Kontrol Kütüphanesi','Control Library','İlk kontrolü ekle','Add your first control'],
  ['Kanıt Kütüphanesi','Evidence Library','İlk kanıtı yükle','Upload your first evidence'],
];
try{
  const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(login.status(),200);
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  for(const lang of ['tr','en']){
    const tr=lang==='tr';await page.locator('.language-switch:visible').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
    source='real';await page.reload();await open(modules[0][tr?0:1]);
    const search=page.getByRole('textbox',{name:tr?'Kayıtlarda ara':'Search records',exact:true});
    await expect(page.locator('.risk-table tbody tr').first()).toBeVisible();
    const columns=await page.locator('.risk-table th').allTextContents();
    await search.fill('QA no matching record 20261026');
    const state=page.locator('.register-empty-state');await expect(state).toHaveAttribute('data-state','filtered');
    await expect(state.locator('button')).toHaveCount(1);
    await state.getByRole('button',{name:tr?'Arama ve filtreleri temizle':'Clear search and filters',exact:true}).click();
    await expect(search).toHaveValue('');await expect(search).toBeFocused();
    assert.deepEqual(await page.locator('.risk-table th').allTextContents(),columns);
    checks.push(`${lang}: filtered-empty recovery preserves columns and keyboard focus`);

    for(const theme of ['light','dark']){
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
      const nav=page.locator('.shell>aside');await expect(nav).toBeVisible();
      const diagnostics=await nav.evaluate(el=>{const s=getComputedStyle(el);return {opacity:s.opacity,background:s.backgroundColor,color:s.color,buttons:[...el.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>({name:b.innerText,color:getComputedStyle(b).color,opacity:getComputedStyle(b).opacity}))};});
      await writeFile(`${out}/${lang}-${theme}-navigation.json`,JSON.stringify(diagnostics,null,2));
      const audit=await new AxeBuilder({page}).include('.shell>aside').withRules(['color-contrast']).analyze();
      await writeFile(`${out}/${lang}-${theme}-contrast.json`,JSON.stringify(audit.violations,null,2));
      assert.deepEqual(audit.violations,[],`${lang}/${theme}: navigation contrast`);
      checks.push(`${lang}/${theme}: sidebar contrast`);
    }

    source='empty';await page.reload();
    for(const [trName,enName,trCreate,enCreate] of modules){
      await open(tr?trName:enName);await expect(state).toHaveAttribute('data-state','empty');
      await state.getByRole('button',{name:tr?trCreate:enCreate,exact:true}).click();
      const form=page.locator('.record-dialog');await expect(form).toBeVisible();
      await expect(form).toHaveAttribute('aria-describedby','record-form-guide');await expect(form.locator('.record-form-guide')).toBeVisible();
      if(enName==='Risk Assessment'){
        const control=form.locator('.fornost-progressive-controls');await expect(control).toBeVisible();
        assert.ok((await control.boundingBox()).y<(await form.locator('form>label').first().boundingBox()).y,'Progressive controls precede fields');
        const firstField=form.locator('form>label input').first();await firstField.focus();
        await page.keyboard.press('Shift+Tab');await expect(control.locator('button')).toBeFocused();
        await page.keyboard.press('Tab');await expect(firstField).toBeFocused();
        await expect(form.locator('.fornost-progressive-hidden').first()).toBeHidden();
        await control.getByRole('button',{name:/gelişmiş alanları göster|show advanced/i}).click();
        await expect(form.locator('.fornost-advanced-field').first()).toBeVisible();
        await control.getByRole('button',{name:/gelişmiş alanları gizle|hide advanced/i}).click();
      }
      await page.keyboard.press('Escape');await expect(form).toHaveCount(0);await expect(state.locator('button')).toBeFocused();
      checks.push(`${lang}: ${enName} empty-state action, form guidance and cancel`);
    }
    await open(modules[0][tr?0:1]);
    for(const width of [1363,390]){
      await page.setViewportSize({width,height:960});
      await screenshot(`${lang}-empty-${width}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,'Empty state fits viewport');
      await state.locator('button').click();
      await expect(page.locator('.record-dialog')).toBeVisible();
      for(const selector of ['.record-dialog','.record-dialog form','.record-dialog .cia-calculation']){
        assert.ok(await page.locator(selector).evaluate(el=>el.scrollWidth-el.clientWidth)<=2,`${lang}/${width}: ${selector} fits without internal horizontal overflow`);
      }
      await screenshot(`${lang}-form-${width}`);await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:1363,height:960});
    source='error';await page.reload();await expect(state).toHaveAttribute('data-state','error');
    await expect(page.locator('.module-head button.primary')).toBeDisabled();
    await expect(page.locator('.risk-overview')).toHaveCount(0);
    await expect(page.locator('.register-result-count')).toHaveText(tr?'Kayıt sayısı doğrulanamadı':'Record count unavailable');
    await open(modules[1][tr?0:1]);await expect(state).toHaveAttribute('data-state','error');
    await expect(page.locator('.module-overview')).toHaveCount(0);
    await expect(page.locator('.register-result-count')).toHaveText(tr?'Kayıt sayısı doğrulanamadı':'Record count unavailable');
    source='empty';await state.getByRole('button',{name:tr?'Yeniden yükle':'Reload records',exact:true}).click();
    await expect(state).toHaveAttribute('data-state','empty');await expect(page.locator('.module-overview')).toBeVisible();
    await open(modules[0][tr?0:1]);await expect(page.locator('.risk-overview')).toBeVisible();
    checks.push(`${lang}: failed source hides unverified metrics and count; retry restores summaries`);
  }
  source='loading';await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.register-empty-state')).toHaveAttribute('data-state','loading');
  await expect(page.locator('.risk-overview')).toHaveCount(0);await expect(page.locator('.register-result-count')).toHaveText('Loading…');
  await expect(page.locator('.module-head button.primary')).toBeDisabled();source='empty';releaseLoad();await expect(page.locator('.register-empty-state')).toHaveAttribute('data-state','empty');
  reader=true;await page.reload();await expect(page.locator('.register-empty-state')).toHaveAttribute('data-state','empty');await expect(page.locator('.register-empty-state button')).toHaveCount(0);await expect(page.locator('.module-head button.primary')).toHaveCount(0);
  await screenshot('reader-empty');checks.push('Loading and read-only UI never offer create actions; read-only role is a UI fixture');
  assert.deepEqual(mutations,[],'No business record writes or external actions');assert.deepEqual(errors,[]);
  await writeFile(`${out}/result.json`,JSON.stringify({checks,mutations,errors},null,2));console.log('PRODUCT_EXPERIENCE_QA_PASS',checks.length);
}catch(error){await writeFile(`${out}/failure.txt`,String(error));await screenshot('failure').catch(()=>{});throw error;}
finally{releaseLoad?.();await context.close();await browser.close();}
