import test from 'node:test';
import assert from 'node:assert/strict';
import {closeOwnedQaSessions} from '../scripts/qa-close-owned-sessions.mjs';
const env={FORNOST_SMOKE_EMAIL:'qa-smoke@example.test',FORNOST_SMOKE_PASSWORD:'synthetic-only'};
function fixture(patch={}){
 const requests=[];let revoked=false;
 const fetcher=async(url,options)=>{
  requests.push({url,...options});assert.ok(url.startsWith('https://app.fornostsecurity.com/'));assert.equal(options.redirect,'error');
  const body=options.body&&JSON.parse(options.body);
  if(body?.action==='login')return Response.json({ok:true},{headers:{'set-cookie':'fornost_session='+'a'.repeat(64)+'; HttpOnly'}});
  if(url.endsWith('/api/users/sessions')){assert.deepEqual(body,{userId:'owned-test-user'});revoked=true;return Response.json({ok:true,currentSessionRevoked:true,revokedSessions:3});}
  if(body?.action==='logout')return Response.json({ok:true});
  return Response.json({authenticated:!revoked,user:{id:'owned-test-user',email:env.FORNOST_SMOKE_EMAIL,role:'Admin',source:'local',...patch}});
 };return {requests,fetcher};
}
test('revocation targets only the authenticated configured QA identity and verifies session closure',async()=>{
 const f=fixture(),events=[];assert.deepEqual(await closeOwnedQaSessions(env,f.fetcher,e=>events.push(e)),{verified:true,revokedSessions:3});assert.equal(f.requests.filter(r=>r.method==='DELETE').length,1);
 assert.deepEqual(events.filter(e=>e.phase).map(e=>e.phase),['login','session-cookie','identity-read','identity-match','revoke-self','revocation-receipt','verify-invalidated','logout']);
 assert.ok(events.every(e=>Object.keys(e).length===1&&(typeof e.phase==='string'||e.httpStatus===200||Object.values(e.identity||{}).length===4&&Object.values(e.identity).every(v=>typeof v==='boolean'))));
 assert.ok(!JSON.stringify(events).includes(env.FORNOST_SMOKE_EMAIL)&&!JSON.stringify(events).includes(env.FORNOST_SMOKE_PASSWORD));
});
test('configured identity uses the same whitespace and casing normalization as login',async()=>{
 const f=fixture();assert.deepEqual(await closeOwnedQaSessions({...env,FORNOST_SMOKE_EMAIL:'  QA-SMOKE@example.test\n'},f.fetcher),{verified:true,revokedSessions:3});
 assert.equal(JSON.parse(f.requests[0].body).email,env.FORNOST_SMOKE_EMAIL);
});
test('mismatched identity, nonlocal user, role or non-QA account never revoke sessions',async()=>{
 for(const patch of [{email:'other@example.test'},{source:'entra'},{role:'Viewer'}]){
  const f=fixture(patch);await assert.rejects(closeOwnedQaSessions(env,f.fetcher));assert.equal(f.requests.filter(r=>r.method==='DELETE').length,0);
 }
 const f=fixture();await assert.rejects(closeOwnedQaSessions({...env,FORNOST_SMOKE_EMAIL:'owner@example.test'},f.fetcher));assert.equal(f.requests.length,0);
});
