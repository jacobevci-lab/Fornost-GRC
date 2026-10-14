// Isolated component/browser regression: no live database or customer writes.
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import RiskAppetite from './app/risk-appetite';import PlatformEscape from './app/platform-escape';createRoot(document.getElementById('root')).render(<><PlatformEscape/><RiskAppetite lang={location.search.includes('tr')?'tr':'en'} currentUser={{role:'Admin',email:'qa@example.test'}}/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'harness.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_BASE_PATH':'""'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
try{
 for(const lang of ['en','tr']){
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  let posts=0,mode='reject',release;
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('KRI harness page error:',e.message);});
  await page.route('http://kri.test/**',async route=>{
   const req=route.request();
   if(req.url().includes('/api/risk-appetite')){
    if(req.method()==='POST'){
     posts++;await new Promise(resolve=>{release=resolve});
     if(mode==='reject')await route.fulfill({status:422,json:{error:'Correct this test field'}});
     else if(mode==='uncertain')await route.abort();
     else await route.fulfill({json:{message:'Saved'}});
    }else await route.fulfill({json:{appetites:[{id:'qa',code:'QA',category:'cyber',kriName:'Availability',statement:'QA statement',metricUnit:'%',direction:'upper',appetiteTarget:0,warningThreshold:5,breachThreshold:10,owner:'qa@example.test',reviewer:'reviewer@example.test',frequencyDays:30,status:'approved',latestValue:0,latestBand:'green',openBreaches:0,measurementCount:0,attention:'approved'}]}});
   }else await route.fulfill({contentType:'text/html',body:`<html><head><style>:root{--cc-line:#777;--cc-ink:#222;--cc-muted:#444;--cc-surface-2:#eee;--cc-elevated:white}.overlay{position:fixed;inset:0;background:#bbb;display:grid;place-items:center}.modal{background:white}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`});
  });
  await page.goto(`http://kri.test/?${lang}`);
  await page.getByRole('button',{name:lang==='tr'?'Stres Senaryoları':'Stress Scenarios',exact:true}).click();
  await page.getByRole('button',{name:lang==='tr'?'+ Senaryo':'+ Scenario',exact:true}).click();
  let dialog=page.getByRole('dialog');
  const slider=dialog.getByRole('slider');await expect(slider).toHaveValue('70');
  await slider.focus();await page.keyboard.press('End');await expect(slider).toHaveValue('100');
  await page.keyboard.press('Home');await expect(slider).toHaveValue('0');
  await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('1');
  await expect(dialog.locator('output')).toHaveText('1%');
  for(const width of [390,1440]){await page.setViewportSize({width,height:960});assert.ok(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)<=4,'No dialog overflow');}
  // Dispatch two submissions before React can render the disabled button.
  await dialog.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await expect.poll(()=>posts).toBe(1);
  await expect(dialog.getByRole('button',{name:'Close dialog'})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:lang==='tr'?'Vazgeç':'Cancel'})).toBeDisabled();
  await page.keyboard.press('Escape');await page.locator('.overlay').dispatchEvent('mousedown');await expect(dialog).toBeVisible();
  release();await expect(dialog.getByRole('alert')).toHaveText('Correct this test field');await expect(slider).toHaveValue('1');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  // Zero is a valid measurement and must remain visible; clearing is distinct.
  await page.getByRole('button',{name:lang==='tr'?'İştah ve Eşikler':'Appetite & Thresholds',exact:true}).click();
  await page.getByRole('button',{name:'+ KRI',exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const value=dialog.getByLabel(lang==='tr'?'Değer':'Value',{exact:true});await value.fill('0');await expect(value).toHaveValue('0');await value.fill('');await expect(value).toHaveValue('');await value.fill('0');
  mode='uncertain';await dialog.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect.poll(()=>posts).toBe(2);release();await expect(dialog).toHaveCount(0);await expect(page.locator('.rap-notice')).toContainText(lang==='tr'?'doğrulanamadı':'could not be confirmed');
  await page.getByRole('button',{name:'+ KRI',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  mode='success';await page.getByRole('dialog').locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect.poll(()=>posts).toBe(3);release();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.rap-notice')).toContainText('Saved');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('KRI_FORM_QA_PASS: TR/EN, slider keyboard limits, zero/empty measurement, duplicate submit, busy Escape/backdrop/cancel, inline validation, uncertain outcome, success, mobile/desktop overflow');
}finally{await browser.close()}
