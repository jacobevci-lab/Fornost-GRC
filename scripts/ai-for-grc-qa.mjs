import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
const {chromium}=await import(process.env.AI_QA_PLAYWRIGHT||'playwright');
const origin=process.env.AI_QA_ORIGIN||'http://127.0.0.1:4184';
if(new URL(origin).hostname!=='127.0.0.1')throw new Error('Isolated localhost QA required');
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const out='ai-grc-qa-artifacts';await mkdir(out,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{Origin:origin}}),errors=[];
 const auth=await context.request.post(origin+'/api/auth',{data:{action:'authorize_bootstrap',token:process.env.ENTERPRISE_BOOTSTRAP_KEY}});assert(auth.ok());
 const setup=await context.request.post(origin+'/api/auth',{data:{action:'bootstrap',name:'AI QA',email:'ai@fornost.test',password:randomBytes(24).toString('hex')+'Aa1!'}});assert(setup.ok(),await setup.text());
 const user=(await (await context.request.get(origin+'/api/auth')).json()).user;
 async function post(path,data){const r=await context.request.post(origin+path,{data});assert(r.ok(),`${path}: ${await r.text()}`);return r.json();}
 const cfg=await (await context.request.get(origin+'/api/ai/grc?kind=config')).json();await post('/api/ai/grc',{...cfg,action:'config',mode:'offline'});
 const control=await post('/api/grc',{module:'Kontroller',data:{controlTitle:'MFA access enforced',owner:'AI QA',ownerEmail:'ai@fornost.test',ownerSource:'directory',frequency:'Aylık',status:'Aktif',implementation:'Uygulanıyor'}});
 const bytes=Buffer.from('2026-11-24 MFA access Enforced. Production tenant. All employee accounts within the documented scope.');
 const upload=await context.request.post(origin+'/api/evidence',{multipart:{file:{name:'mfa.txt',mimeType:'text/plain',buffer:bytes},evidenceTitle:'MFA access proof',controlRef:control.id,owner:'ai@fornost.test',period:'2026-11',lang:'en'}});assert(upload.ok(),await upload.text());const ev=await upload.json();assert.equal(ev.aiReview,'completed');
 const review=await (await context.request.get(origin+'/api/ai/grc?kind=evidence&id='+ev.id)).json();assert.equal(review.analysis.result.dimensions.length,4);assert.equal(review.analysis.result.decision,'human-review');
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(id=>sessionStorage.setItem('fornost-grc-page:v1:'+encodeURIComponent(id),'Güvenlik Anketi Copilot'),user.id);await p.goto(origin);await p.locator('.grc-ai-workspace h2').waitFor({timeout:120000});
 await p.getByLabel('Başlık',{exact:true}).fill('Customer questionnaire');await p.getByLabel('CSV / Excel yükle',{exact:true}).setInputFiles({name:'questions.csv',mimeType:'text/csv',buffer:Buffer.from('Question,ID\n"Is MFA access enforced?",1')});
 await p.getByRole('button',{name:'Kaynaklarla taslak hazırla',exact:true}).click();await p.locator('.grc-ai-answer').waitFor({timeout:120000});
 await p.getByRole('button',{name:'Düzenle',exact:true}).click();await p.getByLabel('Kurumsal yanıt',{exact:true}).fill('MFA is governed by the cited control; independent evidence review is pending.');await p.getByRole('button',{name:'Taslağı kaydet',exact:true}).click();await p.getByRole('button',{name:'İnceledim, onayla',exact:true}).click();await p.getByText('Onaylı: ai@fornost.test',{exact:true}).waitFor();
 for(const name of ['CSV','Excel']){const download=p.waitForEvent('download');await p.getByRole('button',{name,exact:true}).click();const d=await download;assert.equal(await d.failure(),null);await d.saveAs(out+'/'+d.suggestedFilename());}
 for(const lang of ['tr','en']){await p.evaluate(lang=>{localStorage.setItem('fornost-grc-lang',lang);},lang);if(lang==='en')await p.getByRole('button',{name:'EN',exact:true}).click();for(const theme of ['light','dark']){await p.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await p.screenshot({path:`${out}/rfp-${lang}-${theme}-${width}.png`,fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);}}}
 await p.setViewportSize({width:1440,height:1000});await p.evaluate(id=>sessionStorage.setItem('fornost-grc-page:v1:'+encodeURIComponent(id),'AI Ayarları'),user.id);await p.reload();await p.locator('.grc-ai h3').first().waitFor();await p.screenshot({path:out+'/privacy.png',fullPage:true});
 // Exercise the exact same-origin OCR worker and WASM assets used by the UI.
 const external=[];p.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
 const ocrAsset=(await readdir('dist/client/assets')).find(name=>/^ocr-[^/]+\.js$/.test(name));assert(ocrAsset);
 const ocr=await p.evaluate(async({asset})=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,240);ctx.fillStyle='black';ctx.font='38px Arial';ctx.fillText('MFA Enforced 2026-11-24',30,90);const ocrModule=await import('/assets/'+asset),recognize=Object.values(ocrModule).find(value=>typeof value==='function');const text=await recognize(await new Promise(resolve=>canvas.toBlob(resolve)));return {image:canvas.toDataURL('image/png'),text};},{asset:ocrAsset});assert.match(ocr.text,/Enforced/i);
 const image=Buffer.from(ocr.image.split(',')[1],'base64');await writeFile(out+'/ocr-fixture.png',image);
 const report=await context.request.post(origin+'/api/ai/grc',{multipart:{file:{name:'soc2.txt',mimeType:'text/plain',buffer:Buffer.from('Unqualified opinion. Period 2026-01-01 to 2026-10-31. Exception: privileged access was not reviewed. CUEC: Customer responsibility for MFA access. Subprocessor: Example Cloud.')},vendorId:'ai-vendor-qa',lang:'en'}});assert(report.ok(),await report.text());const analyzed=await report.json();assert.equal(analyzed.result.opinion,'unqualified');
 const converted=await post('/api/ai/grc',{action:'convert',id:analyzed.id,item:1,target:'control',title:'Customer MFA enforcement',owner:'ai@fornost.test',frequency:'Aylık'});assert.match(converted.code,/^CTL-/);
 const repeated=await post('/api/ai/grc',{action:'convert',id:analyzed.id,item:1,target:'control',title:'Customer MFA enforcement',owner:'ai@fornost.test',frequency:'Aylık'});assert.equal(repeated.id,converted.id);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,evidence:ev.id,questionnaire:true,exports:['csv','xlsx'],vendor:analyzed.id,conversion:converted.code,views:8,ocr:true,consoleErrors:errors}));
}finally{await browser.close();}
