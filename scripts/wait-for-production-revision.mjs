import {pathToFileURL} from 'node:url';
const validRevision=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
export async function waitForProductionRevision({baseUrl,revision,headers={},once=false,timeoutMs=480_000,pollMs=5000,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,log=console.log}){
 if(!validRevision(revision))throw new Error('Expected production revision must be a full lowercase Git commit SHA');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>600_000||!Number.isFinite(pollMs)||pollMs<=0)throw new Error('Invalid revision wait budget');
 const url=new URL(baseUrl.replace(/\/$/,'')+'/api/health');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid production URL');
 const deadline=now()+timeoutMs;
 let last='unavailable';
 while(now()<deadline){
  try{
   const response=await fetchImpl(url,{headers:{...headers,accept:'application/json','cache-control':'no-cache'},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10_000,Math.ceil(deadline-now()))))});
   if(response.status===200){
    const body=await response.json();
    last=validRevision(body?.revision)?body.revision:'missing revision';
    if(body?.status==='ok'&&body.revision===revision&&now()<deadline){log(`Verified production revision ${revision}`);return;}
    if(body?.status!=='ok')last='unhealthy';
   }else last=`HTTP ${response.status}`;
  }catch{last='unavailable';}
  if(once||now()>=deadline)break;
  log(`Waiting for production revision ${revision}; observed ${last}`);
  await sleep(Math.min(pollMs,deadline-now()));
 }
 throw new Error(`Production did not serve healthy revision ${revision} within the wait budget; last observed ${last}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const headers={};
 if(process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET){headers['CF-Access-Client-Id']=process.env.CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=process.env.CF_ACCESS_CLIENT_SECRET;}
 await waitForProductionRevision({baseUrl:process.env.FORNOST_PROD_URL||'https://fornost-grc.ykpevci.workers.dev',revision:process.env.FORNOST_EXPECTED_REVISION,headers,once:process.argv.includes('--once')}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
