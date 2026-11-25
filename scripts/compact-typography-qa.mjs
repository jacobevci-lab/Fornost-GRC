// Read-only UI matrix against disposable local D1. Public portal payloads are
// deterministic presentation fixtures; portal authorization has its own suite.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {qaPassword} from './qa-credentials.mjs';
import {createQaContext,openQaModule,switchQaLocale,waitForQaIdle} from './qa-browser-harness.mjs';

const base='http://127.0.0.1:4173',out='typography-qa-artifacts';
const modules=['Gösterge Paneli','Benim İşlerim','Risk Değerlendirmesi','Risk İştahı ve KRI','İş Etki Analizi (BIA)','İş Sürekliliği ve Dayanıklılık','Varlık Envanteri','Uyum Yönetimi','Politika Merkezi','Tedarikçi Yönetimi','Kontrol Kütüphanesi','Kanıt Kütüphanesi','Kanıt Otomasyonu','Regülasyon Merkezi','Güvenlik Olayları ve Kriz','Bulgular ve CAPA','Denetim Yönetimi','Bağlantılı GRC Haritası','Raporlama','AI Yönetişimi','Ask Fornost','Sistem Ayarları','AI Yapılandırması','Ana Veri Yönetimi','Entegrasyonlar','E-posta ve Bildirimler','Kimlik ve Erişim','Trust Center Yönetimi','Güvenlik Anketi Copilot','Denetim İzi'];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1440,height:900}});
const page=await context.newPage();page.setDefaultTimeout(20000);
const report={checks:[],errors:[],failures:[],dialogs:[]};let phase='login';
page.on('pageerror',e=>report.errors.push(e.message));
const slug=s=>s.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();
async function theme(p,t){if(await p.locator('html').getAttribute('data-theme')!==t)await p.locator('.theme-toggle:visible').click();}
async function check(p,name,{screenshot=true}={}){
 phase=name;await p.evaluate(()=>document.fonts.ready);
 const result=await p.locator('body').evaluate(root=>{
  const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden=true],.sr-only,.visually-hidden');
  const body=getComputedStyle(root),scale=parseFloat(getComputedStyle(document.documentElement).fontSize)/16;
  const elements=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,th,td,p,small,label,input,select,textarea,button,summary,code,pre,dt,dd,b,strong,span')].filter(visible);
  const describe=el=>`${el.tagName}.${String(el.className).slice(0,70)} ${(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,65)}`;
  const fonts=[],sizes=[],controls=[],headings=[],metrics=[],lineHeights=[],clipped=[],density=[];
  for(const el of elements){
   const s=getComputedStyle(el),size=parseFloat(s.fontSize)/scale;
   if(s.fontFamily!==body.fontFamily&&!el.closest('code,pre,samp,.code,.font-mono,[data-typography=code]'))fonts.push({element:describe(el),font:s.fontFamily});
   if(![10,10.5,11,12,13,15,17].some(expected=>Math.abs(expected-size)<.1))sizes.push({element:describe(el),size});
   if(el.matches('.ex-tag,.ag-tag,.tag,.badge,.status-pill,.state-pill')&&Math.abs(size-10)>.1)sizes.push({element:describe(el),size,reason:'badge must use the ten-pixel role'});
   if(el.closest('th,td')&&size>13)sizes.push({element:describe(el),size,reason:'oversized table text'});
   if(el.closest('form,.form')&&!el.closest('h1,h2,h3,h4,h5,h6')&&size>13)sizes.push({element:describe(el),size,reason:'oversized form text'});
   // A clickable record code or card heading retains its text role. Ordinary
   // fields/actions still have an exact twelve-pixel contract.
   const controlSize=el.matches('button.domain-link')?13
    :el.matches('button.code')&&el.closest('td')?10.5
    :el.matches('button.nav-group-trigger')?10.5
    :el.matches('button.tag,button.risk')||(el.matches('button')&&/(badge|pill|state|status)/.test(el.className))?10:12;
   if(el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea,button')&&Math.abs(size-controlSize)>.1)controls.push({element:describe(el),size,expected:controlSize});
   if(el.matches('h1,h2,h3,h4,h5,h6')&&(size>15||s.fontWeight!=='600'))headings.push({element:describe(el),size,weight:s.fontWeight});
   if(el.matches('h1,h2,h3,h4,h5,h6,th,td,label,input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea,button')){
    const expected=size*(el.matches('h1,h2,h3,h4,h5,h6')?(size===15?1.3:1.35):1.35);
    // Chromium reports native select line-height as normal even with an author
    // line-height; check its usable height instead of silently accepting NaN.
    if(el.matches('select')&&s.lineHeight==='normal'){
     if(el.clientHeight/scale<expected)clipped.push({element:describe(el),height:el.clientHeight,expected});
    }else if(!Number.isFinite(parseFloat(s.lineHeight))||Math.abs(parseFloat(s.lineHeight)/scale-expected)>.15)lineHeights.push({element:describe(el),actual:s.lineHeight,expected});
   }
   // Long tables intentionally scroll. Detect vertical clipping of actual text
   // in buttons/labels/headings, without flagging ellipsis or hidden file inputs.
   if(el.matches('button,label,h1,h2,h3,h4')&&el.clientHeight>2&&['hidden','clip'].includes(s.overflowY)&&el.scrollHeight>el.clientHeight+2)clipped.push({element:describe(el),height:el.clientHeight,content:el.scrollHeight});
  }
  for(const el of root.querySelectorAll('.risk-metrics b,.executive-kpi>strong,.ag-kpis strong,.policy-kpis b,.audit-portfolio-kpis strong,.ic-kpis strong,.ec-kpis b,.mw2-metrics strong')){
   if(!visible(el))continue;const s=getComputedStyle(el);
   if(parseFloat(s.fontSize)/scale!==17||s.fontWeight!=='600'||s.fontVariantNumeric!=='tabular-nums')metrics.push({element:describe(el),size:s.fontSize,weight:s.fontWeight,numerals:s.fontVariantNumeric});
  }
  // Density is observable geometry, independent of the token implementation.
  for(const el of elements){
   const s=getComputedStyle(el),height=el.getBoundingClientRect().height/scale;
   if(el.matches('th,td')&&(Math.abs(parseFloat(s.paddingTop)/scale-6)>.1||Math.abs(parseFloat(s.paddingBottom)/scale-6)>.1||Math.abs(parseFloat(s.paddingLeft)/scale-10)>.1||Math.abs(parseFloat(s.paddingRight)/scale-10)>.1))density.push({element:describe(el),padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft]});
   if(el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file]):not([type=color]),select:not([multiple]):not([size])')&&(el.matches('.register-search input,.mw2-search input')?(height<28||height>32.2):Math.abs(height-32)>.2))density.push({element:describe(el),height,expected:el.matches('.register-search input,.mw2-search input')?'28–32 inside a 32px field':32});
   if(el.matches('.nav-group-items>button')&&!el.closest('.sidebar-compact,.sidebar-collapsed')&&(Math.abs(parseFloat(s.paddingTop)/scale-6)>.1||Math.abs(parseFloat(s.fontSize)/scale-12)>.1))density.push({element:describe(el),padding:s.paddingTop,font:s.fontSize});
  }
  for(const el of root.querySelectorAll('.risk-metrics>article,.executive-kpi,.ag-kpis>button,.policy-kpis>article,.audit-portfolio-kpis>section,.ic-kpis>div,.ec-kpis>button,.mw2-metrics>button')){
   if(!visible(el))continue;const s=getComputedStyle(el);
   if([s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].some(v=>Math.abs(parseFloat(v)/scale-12)>.1))density.push({element:describe(el),padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft]});
  }
  const toolbar=root.querySelector('.risk-register .register-toolbar');
  if(toolbar&&visible(toolbar)&&toolbar.getBoundingClientRect().width>=1000){
   const boxes=[...toolbar.querySelectorAll('.register-search,.register-sort-controls select,.register-view-actions>button,.column-picker-wrap>button')].filter(visible).map(el=>el.getBoundingClientRect());
   const spread=Math.max(...boxes.map(r=>r.top))-Math.min(...boxes.map(r=>r.top));
   if(spread>2||toolbar.getBoundingClientRect().height/scale>64)density.push({element:'register toolbar alignment',spread,height:toolbar.getBoundingClientRect().height});
  }
  const brand=root.querySelector('.brand small');
  if(brand&&visible(brand)){
   const range=document.createRange();range.selectNodeContents(brand);
   const text=range.getBoundingClientRect(),bounds=brand.closest('aside').getBoundingClientRect();
   if(text.right>bounds.right-4)clipped.push({element:'brand caption',right:text.right,boundary:bounds.right});
  }
  return {font:body.fontFamily,fontCount:elements.length,fonts,sizes,controls,headings,metrics,lineHeights,clipped,density,viewport:{width:innerWidth,height:innerHeight,zoom:visualViewport?.scale},pageOverflow:document.documentElement.scrollWidth>innerWidth+2};
 });
 report.checks.push({name,...result});
 for(const key of ['fonts','sizes','controls','headings','metrics','lineHeights','clipped','density'])if(result[key].length)report.failures.push({name,kind:key,items:result[key]});
 if(result.pageOverflow)report.failures.push({name,kind:'page overflow'});
 if(result.viewport.zoom!==1)report.failures.push({name,kind:'browser zoom is not 100%',scale:result.viewport.zoom});
 if(screenshot)await p.screenshot({path:`${out}/${slug(name)}.png`,fullPage:true,animations:'disabled'});
}
async function closeSurface(){
 await page.keyboard.press('Escape');
 const dialogs=page.locator('dialog:visible,[role=dialog]:visible');
 if(await dialogs.count()){
  const cancel=dialogs.getByRole('button',{name:/^(Vazgeç|İptal|Kapat|Cancel|Close|×)$/}).last();
  if(await cancel.isVisible())await cancel.click();
 }
}
try{
 const response=await context.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});assert.equal(response.status(),200);
 await page.goto(base);await switchQaLocale(page,'tr');await openQaModule(page,'Risk Değerlendirmesi');
 // These assertions are the user-facing contract, not a mirror of selectors.
 await expect(page.locator('body')).toHaveCSS('font-size','12px');
 await expect(page.locator('body')).toHaveCSS('line-height','16.2px');
 await expect(page.locator('.risk-table tbody td').first()).toHaveCSS('font-size','12px');
 await expect(page.locator('.risk-table thead th').first()).toHaveCSS('font-size','10px');
 await expect(page.locator('.header-context h1')).toHaveCSS('font-size','15px');
 await expect(page.locator('.risk-metrics article b').first()).toHaveCSS('font-size','17px');
 await expect(page.locator('.risk-metrics article b').first()).toHaveCSS('font-variant-numeric','tabular-nums');
 for(const lang of ['tr','en'])for(const t of ['light','dark'])for(const label of modules){
  await page.setViewportSize({width:1440,height:900});await switchQaLocale(page,'tr');await openQaModule(page,label);await switchQaLocale(page,lang);await theme(page,t);await waitForQaIdle(page);
  await check(page,`${label}-${lang}-${t}`);
  // All destinations also receive a narrow layout pass, including long EN labels.
  await page.setViewportSize({width:390,height:844});await check(page,`${label}-${lang}-${t}-mobile`,{screenshot:lang==='en'&&t==='dark'});
 }
 // Open real creation dialogs without saving any record. Navigation starts fresh
 // per module so a workspace-specific tab cannot leak into the next check.
 for(const label of modules){
  await page.setViewportSize({width:1440,height:900});await switchQaLocale(page,'tr');await openQaModule(page,label);
  let trigger=page.locator('button.workspace-create:visible,.module-head button.primary:visible').first();
  if(label==='Kimlik ve Erişim')trigger=page.locator('.iad-detail-header>button');
  if(!await trigger.isVisible()||!await trigger.isEnabled())continue;
  await trigger.click();await waitForQaIdle(page);
  if(!await page.locator('dialog:visible,[role=dialog]:visible,.modal:visible').count())continue;
  report.dialogs.push(label);
  for(const lang of ['tr','en'])for(const t of ['light','dark']){
   // Top-layer dialogs make the header inert: use the same persisted locale
   // via the app's language controls after closing/reopening the unsaved form.
   await closeSurface();await switchQaLocale(page,lang);await theme(page,t);await trigger.click();
   await check(page,`${label}-form-${lang}-${t}`);
   await page.setViewportSize({width:390,height:844});await check(page,`${label}-form-${lang}-${t}-mobile`);await page.setViewportSize({width:1440,height:900});
  }
  await closeSurface();
 }
 // Persistent record detail and global Ask Fornost drawer use different mounts.
 for(const lang of ['tr','en'])for(const t of ['light','dark']){
  await switchQaLocale(page,'tr');await openQaModule(page,'Risk Değerlendirmesi');await switchQaLocale(page,lang);await theme(page,t);
  await page.locator('.risk-table tbody .code').first().click();await waitForQaIdle(page);await check(page,`risk-detail-${lang}-${t}`);await closeSurface();
  await page.locator('.context-ai-trigger').click();await page.locator('#fornost-ai-panel').waitFor({state:'visible'});await check(page,`ask-drawer-${lang}-${t}`);await closeSurface();
 }
 // Admin settings have independent in-page surfaces without a modal boundary.
 await switchQaLocale(page,'tr');await openQaModule(page,'Sistem Ayarları');
 for(const tab of ['Kuruluş','HTTPS / TLS','Oturum ve saklama','Risk hatırlatmaları','Örnek veriler','Sistem Durumu','Değişiklik Geçmişi']){
  await page.getByRole('button',{name:tab,exact:true}).click();await check(page,`settings-${tab}`);
 }
 // Native portal forms: same React routes, deterministic public read payloads.
 const guest=await createQaContext(browser,base,{}, {viewport:{width:1440,height:900}}),portal=await guest.newPage();
 portal.on('pageerror',e=>report.errors.push(e.message));
 await portal.route('**/api/public-exchange/vendor',route=>route.fulfill({json:{name:'İştirak Güvenlik Hizmetleri — International Supplier',scope:'Erişim, şifreleme, süreklilik ve kişisel verilerin korunması / Access, encryption, continuity and personal data protection'}}));
 await portal.route('**/api/public-exchange/trust',route=>route.fulfill({json:{titleTr:'Kurumsal Müşteri Güven Merkezi',titleEn:'Enterprise Customer Trust Center',tr:'Bağımsız incelemeyle desteklenen güvenlik mimarisi özeti.',en:'Security architecture supported by independent review.',policies:[{code:'POL-001',title:'Bilgi Güvenliği / Information Security',version:1,content:'İzin, şeffaflık ve güvenli veri işleme. Access, transparency and secure processing.'}],documents:[{id:'typography-document',title:'SOC 2 Type II — Restricted assurance report',ndaRequired:true}],frameworks:['ISO 27001','SOC 2 Type II','KVKK','DORA']}}));
 for(const route of ['/vendor-portal/'+'a'.repeat(64),'/trust-center']){
  await portal.goto(base+route);await portal.locator('.ex-public h1').waitFor({state:'visible'});
  for(const lang of ['tr','en'])for(const t of ['light','dark']){
   if(await portal.locator('html').getAttribute('lang')!==lang)await portal.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
   if(await portal.locator('html').getAttribute('data-theme')!==t)await portal.getByRole('button',{name:/^(Koyu tema|Açık tema|Dark mode|Light mode)$/}).click();
   if(route==='/trust-center'&&!await portal.locator('input[name=name]').isVisible())await portal.getByRole('button',{name:/NDA (ve|&)/}).click();
   for(const width of [1440,390]){await portal.setViewportSize({width,height:width===1440?900:844});await check(portal,`${route.includes('vendor')?'vendor':'trust-nda'}-${lang}-${t}-${width}`);}
  }
 }
 await guest.close();
 // Relative typography must follow a user's larger default text setting.
 await page.setViewportSize({width:1440,height:900});await switchQaLocale(page,'tr');await openQaModule(page,'Risk Değerlendirmesi');
 await page.addStyleTag({content:'@layer fornost-typography {html {font-size:125%!important}}'});
 await expect(page.locator('.risk-table tbody td').first()).toHaveCSS('font-size','15px');await check(page,'risk-text-scale-125');
 assert.deepEqual(report.errors,[]);assert.equal(report.failures.length,0,JSON.stringify(report.failures.slice(0,3)));assert.ok(report.dialogs.includes('Risk Değerlendirmesi'));
 console.log(`COMPACT_TYPOGRAPHY_QA_PASS: ${report.checks.length} views, ${report.dialogs.length} dialog types`);
}catch(error){report.failures.push({phase,error:error.message});await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await writeFile(`${out}/matrix.json`,JSON.stringify(report,null,2));await browser.close();}
