import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveBuildRevision} from '../scripts/build-revision';
import {waitForProductionRevision} from '../scripts/wait-for-production-revision.mjs';
const revision='a'.repeat(40),other='b'.repeat(40);
test('build revision comes from explicit immutable input or the checked-out source, never malformed metadata',()=>{
 assert.equal(resolveBuildRevision({FORNOST_BUILD_REVISION:revision},()=>other),revision);
 assert.equal(resolveBuildRevision({GITHUB_SHA:other},()=>revision),revision);
 assert.equal(resolveBuildRevision({GITHUB_SHA:other},()=>{throw Error('no git');}),other);
 assert.equal(resolveBuildRevision({},()=>{throw Error('no git');}),'unknown');
 for(const value of ['','main','abc123','secret-value'])assert.throws(()=>resolveBuildRevision({FORNOST_BUILD_REVISION:value},()=>revision));
});
test('healthy old or legacy deployments cannot satisfy a new release gate',async()=>{
 let clock=0,calls=0;const logs:string[]=[];
 const fetchImpl=async()=>{calls++;return Response.json(calls===1?{status:'ok'}:calls===2?{status:'ok',revision:other}:{status:'ok',revision});};
 await waitForProductionRevision({baseUrl:'https://example.test/grc',revision,fetchImpl,now:()=>clock,sleep:async(ms:number)=>{clock+=ms;},pollMs:5,timeoutMs:30,log:(x:string)=>logs.push(x)});
 assert.equal(calls,3);assert.equal(clock,10);assert.match(logs.at(-1)!,/Verified production revision/);
});
test('release wait fails closed on redirects, unhealthy service and absent or invalid revisions without leaking provider bodies',async()=>{
 for(const response of [new Response('',{status:302,headers:{location:'https://login.invalid'}}),Response.json({status:'degraded',revision}),Response.json({status:'ok',revision:'provider-secret'}),new Response('private diagnostic',{status:503})]){
  let clock=0;const logs:string[]=[];
  await assert.rejects(waitForProductionRevision({baseUrl:'https://example.test',revision,fetchImpl:async()=>response.clone(),now:()=>clock,sleep:async(ms:number)=>{clock+=ms;},pollMs:5,timeoutMs:10,log:(x:string)=>logs.push(x)}),/within the wait budget/);
  assert.doesNotMatch(logs.join(' '),/provider-secret|private diagnostic/);
 }
});
test('post-QA revision check never waits through a mismatched release',async()=>{
 let calls=0;
 await assert.rejects(waitForProductionRevision({baseUrl:'https://example.test',revision,once:true,fetchImpl:async()=>{calls++;return Response.json({status:'ok',revision:other});},sleep:async()=>{throw Error('must not sleep');},log:()=>{}}),/within the wait budget/);
 assert.equal(calls,1);
});
test('revision gate validates expected SHA before network and preserves deployment access headers without redirects',async()=>{
 let calls=0;
 await assert.rejects(waitForProductionRevision({baseUrl:'https://example.test',revision:'main',fetchImpl:async()=>{calls++;return Response.json({});}}),/full lowercase/);assert.equal(calls,0);
 await waitForProductionRevision({baseUrl:'https://example.test/grc/',revision,headers:{'CF-Access-Client-Secret':'test-only'},fetchImpl:async(url,options)=>{
  assert.equal(String(url),'https://example.test/grc/api/health');assert.equal(options?.redirect,'manual');assert.equal((options?.headers as Record<string,string>)['CF-Access-Client-Secret'],'test-only');assert.ok(options?.signal);return Response.json({status:'ok',revision});
 },log:()=>{}});
});

test('a healthy response arriving after the verification deadline cannot pass',async()=>{
 let clock=0;
 await assert.rejects(waitForProductionRevision({baseUrl:'https://example.test',revision,timeoutMs:10,now:()=>clock,fetchImpl:async()=>{clock=11;return Response.json({status:'ok',revision});},log:()=>{}}),/within the wait budget/);
});
