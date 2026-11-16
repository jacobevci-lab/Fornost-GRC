import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {qaFailureSummary} from './qa-failure-summary.mjs';

export async function closeOwnedQaSessions(env, fetcher=fetch, progress=()=>{}) {
  const base='https://app.fornostsecurity.com',email=env.FORNOST_SMOKE_EMAIL,password=env.FORNOST_SMOKE_PASSWORD;
  assert.ok(email&&password&&/(?:^|[.+_-])(?:qa|smoke|test)(?:[.+_-]|@)/i.test(email),'Dedicated QA identity required');
  const headers={'content-type':'application/json',origin:base,'user-agent':'fornost-production-smoke-test/1.0',accept:'application/json'};
  if(env.CF_ACCESS_CLIENT_ID&&env.CF_ACCESS_CLIENT_SECRET){headers['CF-Access-Client-Id']=env.CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=env.CF_ACCESS_CLIENT_SECRET;}
  let cookie='';
  async function call(path,method='GET',body){
    const response=await fetcher(base+path,{method,headers:{...headers,...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
    progress({httpStatus:response.status});assert.equal(response.status,200,'QA session operation rejected');return response;
  }
  try{
    progress({phase:'login'});const login=await call('/api/auth','POST',{action:'login',email,password});
    progress({phase:'session-cookie'});
    cookie=(login.headers.getSetCookie?.()||[login.headers.get('set-cookie')]).find(v=>v?.startsWith('fornost_session='))?.split(';',1)[0]||'';
    assert.match(cookie,/^fornost_session=[a-f0-9]{64}$/);
    progress({phase:'identity-read'});const profile=await (await call('/api/auth')).json();
    progress({phase:'identity-match'});
    assert.ok(profile.authenticated&&profile.user?.source==='local'&&profile.user.role==='Admin'&&profile.user.email?.toLowerCase()===email.toLowerCase(),'Authenticated dedicated QA identity must match');
    progress({phase:'revoke-self'});const result=await (await call('/api/users/sessions','DELETE',{userId:profile.user.id})).json();
    progress({phase:'revocation-receipt'});
    assert.equal(result.ok,true);assert.equal(result.currentSessionRevoked,true);
    progress({phase:'verify-invalidated'});assert.equal((await (await call('/api/auth')).json()).authenticated,false);
    return {verified:true,revokedSessions:result.revokedSessions};
  }finally{
    if(cookie){progress({phase:'logout'});await call('/api/auth','POST',{action:'logout'}).catch(()=>{});}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log('OWNED_QA_SESSIONS_CLOSED',JSON.stringify(await closeOwnedQaSessions(process.env,fetch,event=>console.log('OWNED_QA_SESSION_STAGE',JSON.stringify(event)))));}
  catch(error){console.error('OWNED_QA_SESSION_CLEANUP_FAILED',qaFailureSummary(error));process.exitCode=1;}
}
