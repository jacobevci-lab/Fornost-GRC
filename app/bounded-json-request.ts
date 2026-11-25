/** Bound headers and JSON parsing, even when a transport ignores abort. Never retries writes. */
export async function requestJsonWithDeadline(url:string, init:RequestInit={}, fetcher:typeof fetch=fetch, timeoutMs=15_000) {
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let cancel=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{
  cancel=()=>{controller.abort();reject(new Error('Request interrupted'));};
  init.signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(cancel,timeoutMs);
  if(init.signal?.aborted)cancel();
 });
 try {
  return await Promise.race([interrupted,(async()=>{
   if(controller.signal.aborted)throw new Error('Request interrupted');
   const response=await fetcher(url,{...init,signal:controller.signal});
   const body:unknown=await response.json();
   if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid response');
   return {response,body:body as Record<string,unknown>};
  })()]);
 } finally {clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);}
}
