// Temporary read-only production diagnosis: record request timing and cancellation
// origins without capturing credentials, headers, cookies or response bodies.
import { chromium } from '@playwright/test';
const launch=chromium.launch.bind(chromium);
let contextNumber=0;
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options),id=++contextNumber,close=context.close.bind(context);
  context.on('page',page=>{
   page.on('console',message=>{if(message.text().startsWith('SESSION_DIAGNOSTIC '))console.log(`SESSION_CONTEXT ${id} ${message.text()}`);});
   page.on('requestfailed',request=>{if(new URL(request.url()).pathname==='/api/auth')console.log('SESSION_REQUEST_FAILED',JSON.stringify({context:id,at:new Date().toISOString(),method:request.method(),failure:request.failure(),timing:request.timing()}));});
   page.on('close',()=>console.log('SESSION_PAGE_CLOSED',JSON.stringify({context:id,at:new Date().toISOString()})));
  });
  await context.addInitScript(()=>{
   const original=window.fetch.bind(window);
   const emit=(event,extra={})=>console.debug('SESSION_DIAGNOSTIC '+JSON.stringify({event,at:new Date().toISOString(),area:document.querySelector('main>header h1')?.textContent?.trim()||'login',...extra}));
   for(const event of ['focus','blur','beforeunload'])window.addEventListener(event,()=>emit(event));
   window.fetch=(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
    const method=init?.method||(input instanceof Request?input.method:'GET');
    if(url.pathname!=='/api/auth'||method.toUpperCase()!=='GET')return original(input,init);
    const start=performance.now(),signal=init?.signal||(input instanceof Request?input.signal:undefined);
    emit('auth-start');
    const aborted=()=>emit('auth-abort',{elapsedMs:Math.round(performance.now()-start),reason:signal?.reason?.name||String(signal?.reason),stack:new Error('Abort origin').stack});
    signal?.addEventListener('abort',aborted,{once:true});
    return original(input,init).then(response=>{emit('auth-response',{status:response.status,elapsedMs:Math.round(performance.now()-start)});return response;},error=>{emit('auth-failure',{name:error?.name,elapsedMs:Math.round(performance.now()-start)});throw error;}).finally(()=>signal?.removeEventListener('abort',aborted));
   };
  });
  context.close=async options=>{console.log('SESSION_CONTEXT_CLOSING',JSON.stringify({context:id,at:new Date().toISOString()}));return close(options);};
  return context;
 };
 return browser;
};
await import('./full-production-qa.mjs');
