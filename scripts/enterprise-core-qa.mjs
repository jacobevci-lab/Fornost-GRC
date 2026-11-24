// Isolated development D1 only. All organizations, identities and tokens are disposable.
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const origin=process.env.ENTERPRISE_QA_ORIGIN||'http://127.0.0.1:4184';
if(new URL(origin).hostname!=='127.0.0.1')throw Error('Local QA instance required');
const browser=await chromium.launch({headless:!process.env.DISPLAY,executablePath:process.env.QA_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},extraHTTPHeaders:{Origin:origin}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('response',r=>{if(r.url().startsWith(origin+'/api/')&&r.status()>=400)errors.push(r.status()+' '+new URL(r.url()).pathname)});
 const name='Enterprise QA',email='qa-core@fornost.test',password=process.env.ENTERPRISE_QA_PASSWORD||randomBytes(28).toString('hex')+'Aa1!';
 const session=await context.request.post(origin+'/api/auth',{data:{action:'bootstrap',name,email,password}});
 assert.equal(session.ok(),true,'fresh local D1 bootstrap '+session.status());
 const user=(await (await context.request.get(origin+'/api/auth')).json()).user;assert(user?.id);
 await page.addInitScript(id=>{sessionStorage.setItem('fornost-grc-page:v1:'+encodeURIComponent(id),'Kimlik ve Erişim')},user.id);
 await page.goto(origin);await page.getByRole('button',{name:'Kurum kapsamları',exact:true}).click({timeout:120000});
 await page.getByLabel('Kurum adı',{exact:true}).fill('Enterprise QA Subsidiary');
 await page.getByRole('button',{name:'Kurum ekle',exact:true}).click();
 await page.getByRole('listitem').filter({hasText:'Enterprise QA Subsidiary'}).first().waitFor();
 await page.getByRole('button',{name:'Kurumsal SSO ve SCIM',exact:true}).click();
 await page.getByRole('button',{name:'Anahtar üret',exact:true}).click();
 const token=page.getByLabel(/Oturuma özel anahtar/);await page.waitForFunction(()=>document.querySelector('input[type=password][required]')?.value?.startsWith('fscim_'));
 await page.getByRole('button',{name:'+ Eşleme kuralı',exact:true}).click();
 await page.getByLabel('Dizin değeri',{exact:true}).fill('risk-team');
 await page.getByRole('button',{name:'Kuralları kaydet'}).click();
 await token.waitFor();await page.getByLabel('Örnek kullanıcı').fill('simulated@fornost.test');await page.getByLabel('Gruplar (virgülle)').fill('risk-team');
 await page.getByRole('button',{name:'Bağlantıyı Test Et',exact:true}).click();await page.getByText(/Önizleme · Katılımcı · Holding/).waitFor();
 await page.reload();const select=page.getByLabel('Kurumsal çalışma alanı').first();await select.selectOption({label:'Enterprise QA Subsidiary'});
 await page.getByRole('heading',{name:'Kapsam kayıtları'}).waitFor();await page.getByRole('button',{name:'EN',exact:true}).click();
 await page.getByRole('button',{name:'Dark theme',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.getByRole('heading',{name:'Scoped records'}).waitFor();
 assert.equal((await context.request.get(origin+'/api/grc')).status(),403);
 await page.getByLabel('Enterprise workspace').selectOption('');await page.getByRole('button',{name:'Entity scopes',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS · hierarchy, SCIM token and mapped preview, scope switch, denied native API, EN and dark theme, consolidation');
}finally{await browser.close()}
