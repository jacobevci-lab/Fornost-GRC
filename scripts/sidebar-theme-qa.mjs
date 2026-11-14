import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { qaPassword } from './qa-credentials.mjs';

// Isolated browser only. No application preferences or records are written
// to production. Compare rendered colors, not declarations in one CSS file.
const base='http://127.0.0.1:4173',out='layout-qa-artifacts/sidebar-theme';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage(),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function capture(name){
  await page.mouse.move(1400,940);
  await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});
}
async function colors(){
  return page.locator('.shell>aside').evaluate(aside=>{
    const style=selector=>{
      const el=selector?aside.querySelector(selector):aside;
      if(!el)throw new Error(`Missing navigation surface ${selector}`);
      const s=getComputedStyle(el);
      return {background:s.backgroundColor,color:s.color,border:s.borderBottomColor};
    };
    return {rail:style(),brand:style('.brand'),footer:style('.sidebar-view-controls'),
      selected:style('.nav-group-items button[aria-current="page"]'),
      selectedIcon:style('.nav-group-items button[aria-current="page"] i'),
      inactiveIcon:style('.nav-group-items button:not([aria-current="page"]) i'),
      mode:style('.sidebar-view-controls button.active')};
  });
}
try{
  const login=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});
  assert.equal(login.status(),200);
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  for(const lang of ['TR','EN']){
    const tr=lang==='TR';
    await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
    const title=tr?'Risk Değerlendirmesi':'Risk Assessment';
    const nav=page.locator('#fornost-navigation');
    const risk=nav.getByRole('button',{name:title,exact:true,includeHidden:true});
    if(!await risk.isVisible()){
      for(const group of await nav.locator('.nav-group').all()){
        if(await group.getByRole('button',{name:title,exact:true,includeHidden:true}).count()){
          await group.locator('.nav-group-trigger').click();break;
        }
      }
    }
    await risk.click();await expect(page.locator('main>header h1')).toHaveText(title);
    for(const theme of ['light','dark']){
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
      await page.getByRole('button',{name:tr?'Geniş menü':'Expanded navigation',exact:true}).click();
      await capture(`${lang}-${theme}-expanded`);
      const expanded=await colors();
      await page.getByRole('button',{name:tr?'İkon menüsü':'Icon navigation',exact:true}).click();
      await expect(page.locator('.shell')).toHaveClass(/sidebar-compact/);
      await capture(`${lang}-${theme}-compact`);
      assert.deepEqual(await colors(),expanded,`${lang}/${theme}: compact mode must preserve the expanded theme colors`);
      await page.reload();await expect(page.locator('.shell')).toHaveClass(/sidebar-compact/);
      await capture(`${lang}-${theme}-compact-reloaded`);
      assert.deepEqual(await colors(),expanded,`${lang}/${theme}: compact colors persist after reload`);
      await page.getByRole('button',{name:tr?'Menüyü gizle':'Hide navigation',exact:true}).click();
      await expect(page.locator('.shell')).toHaveClass(/sidebar-hidden/);
      const restore=page.getByRole('button',{name:tr?'Ana menüyü aç':'Open main navigation',exact:true});
      await expect(restore).toBeVisible();
      await capture(`${lang}-${theme}-hidden`);
      assert.equal(await nav.isVisible(),false,`${lang}/${theme}: hidden navigation is not exposed visually`);
      await restore.click();
      await expect(page.locator('.shell')).toHaveClass(/sidebar-expanded/);
      await capture(`${lang}-${theme}-restored`);
      assert.deepEqual(await colors(),expanded,`${lang}/${theme}: restored colors must match`);
      await expect(page.locator('main>header h1')).toHaveText(title);
      checks.push(`${lang}/${theme}: expanded, compact, reload, hidden and restored colors/selection`);
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/result.json`,JSON.stringify({checks,errors},null,2));
  console.log('SIDEBAR_THEME_QA_PASS',checks.length);
}catch(error){await capture('failure').catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
