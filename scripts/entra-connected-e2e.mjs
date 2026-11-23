import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createQaContext,waitForQaIdle} from './qa-browser-harness.mjs';
import {monitor,scanViews} from './entra-qa/observe.mjs';
import {clean,title} from './entra-qa/records.mjs';
import {journey} from './entra-qa/journey.mjs';

const base=process.env.ENTRA_BASE_URL||'http://127.0.0.1:4173',isolated=base==='http://127.0.0.1:4173';
assert.ok(isolated||base==='https://app.fornostsecurity.com','Unsupported QA destination');
const out=process.env.ENTRA_OUTPUT||'entra-qa-artifacts';
const report={origin:base,started:new Date().toISOString(),browser:{headless:false,slowMo:120,width:1440,height:900},steps:[],screens:[],events:[],codes:{}};
await mkdir(out,{recursive:true});let current='start',browser;
async function step(name,fn){current=name;try{await fn();report.steps.push({name,status:'passed'});console.log('PASS',name);return true;}catch(e){const reason=String(e.message).split('\n').slice(0,4).join(' ').slice(0,390);report.steps.push({name,status:'failed',reason});console.error('FAIL',name,isolated?reason:'See stage and status');return false;}}
try{
  browser=await chromium.launch({headless:false,slowMo:120,executablePath:process.env.QA_CHROMIUM_PATH||undefined});
  const headers={};if(!isolated&&process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET){
    headers['CF-Access-Client-Id']=process.env.CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=process.env.CF_ACCESS_CLIENT_SECRET;
  }
  const ctx=await createQaContext(browser,base,headers,{viewport:{width:1440,height:900}});
  monitor(ctx,report,base,()=>current);const page=await ctx.newPage();page.setDefaultTimeout(7500);
  const api=async(path,{method='GET',data,multipart,expected=[200]}={})=>{
    if(!path.startsWith('/api/')||path.includes('://'))throw Error('Invalid API path');
    const r=await ctx.request.fetch(base+path,{method,headers:{...headers,origin:base},data,multipart,maxRedirects:0});
    if(r.status()>=400)report.events.push({step:current,kind:'api',path:path.split('?')[0],status:r.status(),expected:expected.includes(r.status())});
    const b=await r.json().catch(()=>({}));assert.ok(expected.includes(r.status()),method+' '+path.split('?')[0]+' HTTP '+r.status()+' '+(b.code||b.error||''));return b;
  };
  const owner=isolated?'qa-admin@fornost.test':process.env.FORNOST_SMOKE_EMAIL;
  const password=isolated?process.env.FORNOST_QA_PASSWORD:process.env.FORNOST_SMOKE_PASSWORD;
  if(!(await step('Authenticated preflight',async()=>{
    await page.goto(base);await waitForQaIdle(page);assert.ok(owner&&password,'Dedicated application QA credentials are required');
    await api('/api/auth',{method:'POST',data:{action:'login',email:owner,password}});const a=await api('/api/auth');assert.equal(a.user.role,'Admin');
    const h=await api('/api/health');report.revision=h.revision;await page.reload();await page.locator('.shell').waitFor();
  }))) throw Error('Authentication required before reading or changing records');
  let existing=[];
  const listed=await step('Inventory and safe cleanup',async()=>{existing=await clean(api,report,isolated||process.env.ENTRA_CLEAN==='true');});
  const people={owner};
  const roles=await step('Independent directory identities',async()=>{
    const users=(await api('/api/users')).users;
    for(const [key,role,email] of [['reviewer','Admin',process.env.ENTRA_REVIEWER_EMAIL||'entra-qa-reviewer@fornost.test'],['lead','Editor',process.env.ENTRA_LEAD_EMAIL||'entra-qa-lead@fornost.test']]){
      const u=users.find(x=>x.email===email);
      if(u)assert.ok(u.status==='Active'&&['Admin',...(key==='lead'?['Editor']:[])].includes(u.role),'Invalid directory participant '+key);
      else{
        assert.ok(isolated||process.env.ENTRA_WRITE==='true','Write mode required to provision a participant');
        const synthetic=key==='reviewer'?'entra-qa-reviewer@fornost.test':'entra-qa-lead@fornost.test';
        assert.equal(email,synthetic,'Explicit external assignee must already exist');
        const pass=randomBytes(32).toString('base64url')+'aA9!';
        await api('/api/users',{method:'POST',expected:[201],data:{name:'Entra QA '+key,email,role,password:pass}});
      }
      people[key]=email;
    }
    assert.equal(new Set(Object.values(people)).size,3);
  });
  if(listed&&roles&&(isolated||process.env.ENTRA_WRITE==='true')){
    const matches=existing.filter(r=>Object.values(title).includes(r.name));
    if(matches.length)report.steps.push({name:'Create scenario',status:'blocked',reason:'Matching records already exist; review lineage before resuming.'});
    else await journey({api,page,people,step,isolated,report});
  }else report.steps.push({name:'Create scenario',status:'blocked',reason:'Complete inventory, roles and authorized write mode required'});
  if(process.env.ENTRA_SCOPE!=='journey')await scanViews(page,report,step);
  await ctx.close();
}catch(e){report.steps.push({name:'Execution',status:'blocked',reason:String(e.message).split('\n')[0]});}
finally{if(browser)await browser.close();report.finished=new Date().toISOString();// Production artifacts may be visible to repository readers. Keep business record
  // titles, DOM selectors and raw console messages inside the application environment.
  const saved=isolated?report:{...report,events:report.events.map(({kind,step,status,expected,path})=>({kind,step,status,expected,path})),
    screens:report.screens.map(({label,lang,theme,rawUuid,translationKey,untranslated,contrast})=>({label,lang,theme,rawUuid,translationKey,untranslated:Boolean(untranslated),contrast:contrast.length})),
    steps:report.steps.map(({name,status})=>({name,status})),cleanup:report.cleanup&&{inspected:report.cleanup.inspected,candidates:report.cleanup.candidates,deleted:report.cleanup.deleted.length,retained:report.cleanup.retained.length}};
  await writeFile(out+'/report.json',JSON.stringify(saved,null,2));}
if(report.steps.some(s=>s.status!=='passed')||report.events.some(e=>!e.expected))process.exitCode=1;
