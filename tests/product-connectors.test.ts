import assert from 'node:assert/strict';
import test from 'node:test';
import {connectorProfiles,newConnectorDraft,connectorProfile} from '../app/connectors/catalog';
import {collectProvider,providerConfiguration,providerCredentials,mayReuseProviderCredentials} from '../app/connectors/collector';
const guid='11111111-1111-4111-8111-111111111111';
const config=(id='microsoft-graph',extra:Record<string,string>={})=>providerConfiguration({...newConnectorDraft(id),providerConfig:{tenantId:guid,clientId:guid,subscriptionId:guid,resourceGroup:'rg',workspace:'sentinel',...extra}}).config;
const clientSecret=crypto.randomUUID(), ephemeralToken=crypto.randomUUID();
const secret=JSON.stringify({clientSecret});
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

test('product config rejects invalid identity, unknown datasets and attacker-defined origins',()=>{
 assert.throws(()=>config('microsoft-graph',{tenantId:'common'}),/GUID/);
 assert.throws(()=>providerConfiguration({...newConnectorDraft('microsoft-graph'),dataset:'arbitrary',providerConfig:{}}),/dataset/);
 const cfg=config('microsoft-graph',{baseUrl:'https://evil.example',tokenUrl:'https://evil.example',clientSecret:crypto.randomUUID()});
 assert.equal(cfg.baseUrl,'https://graph.microsoft.com/v1.0/security/secureScores');
 assert.equal(cfg.clientSecret,undefined);assert.equal(cfg.tokenUrl,undefined);
 assert.throws(()=>config('okta',{serviceUrl:'https://example.okta.com.evil.test'}),/Okta/);
 assert.throws(()=>config('sonarqube',{serviceUrl:'http://127.0.0.1',projectKey:'p'}),/HTTPS/);
 assert.throws(()=>config('sonarqube',{serviceUrl:'https://sonar.example/path',projectKey:'p'}),/origin/);
 assert.throws(()=>config('crowdstrike',{region:'elsewhere'}),/Region/);
});
test('dual keys are complete, encrypted as one bundle and never added to config',()=>{
 const p=connectorProfile('tenable')!;
 assert.throws(()=>providerCredentials(p,{accessKey:'a'}),/Secret key/);
 assert.deepEqual(JSON.parse(providerCredentials(p,{accessKey:'a',secretKey:'b',other:'not-stored'})),{accessKey:'a',secretKey:'b'});
 assert.throws(()=>providerCredentials(p,{accessKey:'a;bad',secretKey:'b'}),/format/);
 assert.equal(mayReuseProviderCredentials(config(),config('microsoft-graph',{clientId:'22222222-2222-4222-8222-222222222222'})),false);
});
test('Microsoft app-only credentials use correct audience, renew per run, and exhaust nextLink',async()=>{
 for(const id of ['microsoft-graph','defender-endpoint','sentinel','azure-resources']){
  const cfg=config(id),calls:Array<{url:string;init?:RequestInit}>=[];
  const run=()=>collectProvider(cfg,secret,{fetcher:async(url,init)=>{
   calls.push({url,init});
   assert.equal(init?.redirect,'error');assert.ok(init?.signal);
   if(url.includes('/token'))return json({access_token:ephemeralToken});
   const h=new Headers(init?.headers);assert.equal(h.get('authorization'),`Bearer ${ephemeralToken}`);
   return url.includes('next=2')?json({value:[{id:'two'}]}):json({value:[{id:'one'}],'@odata.nextLink':cfg.baseUrl+(cfg.baseUrl.includes('?')?'&':'?')+'next=2'});
  }});
  const result=await run();assert.equal((result.value as unknown[]).length,2);
  assert.deepEqual((result.fornostCollection as Record<string,unknown>).recordCount,2);
  const tokenCall=calls[0],form=new URLSearchParams(String(tokenCall.init?.body));
  assert.equal(form.get('grant_type'),'client_credentials');assert.equal(form.get('client_secret'),clientSecret);
  assert.equal(form.get('scope'),id==='defender-endpoint'?'https://api.securitycenter.microsoft.com/.default':id==='sentinel'||id==='azure-resources'?'https://management.azure.com/.default':'https://graph.microsoft.com/.default');
  assert.ok(!JSON.stringify(result).includes(ephemeralToken));
  await run();assert.equal(calls.filter(c=>c.url.includes('/token')).length,2);
 }
});
test('continuation cannot send a token to another host, endpoint, or repeating page',async()=>{
 for(const next of ['https://evil.example/value','https://graph.microsoft.com/v1.0/users',config().baseUrl]){
  let requests=0;await assert.rejects(collectProvider(config(),secret,{fetcher:async(url)=>{requests++;return url.includes('/token')?json({access_token:'token'}):json({value:[],'@odata.nextLink':next})}}),/UNSAFE_PAGINATION|COLLECTION_LIMIT/);
  assert.equal(requests,2);
 }
});
test('permissions, throttling and provider error bodies cannot appear as successful evidence or leak secrets',async()=>{
 for(const status of [206,401,403,429,500])await assert.rejects(collectProvider(config('cloudflare'),JSON.stringify({token:'secret'}),{fetcher:async()=>json({error:'raw secret'},status)}),e=>{assert.ok(e instanceof Error);assert.ok(!e.message.includes('raw secret'));return true;});
 await assert.rejects(collectProvider(config('cloudflare'),JSON.stringify({token:'secret'}),{fetcher:async()=>json({success:false,errors:[{message:'raw secret'}]})}),/UPSTREAM_ERROR/);
 await assert.rejects(collectProvider(config(),secret,{fetcher:async()=>json({error:'not-a-token'})}),/AUTH_FAILED/);
 await assert.rejects(collectProvider(config('cloudflare'),JSON.stringify({token:'secret'}),{fetcher:async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}})}),/INVALID_RESPONSE/);
});
test('collection limits fail closed instead of declaring partial results complete',async()=>{
 await assert.rejects(collectProvider(config('tenable'),JSON.stringify({accessKey:'a',secretKey:'b'}),{fetcher:async()=>json({scans:['x'.repeat(1_000_001)]})}),/COLLECTION_LIMIT/);
 let page=0;await assert.rejects(collectProvider(config(),secret,{fetcher:async(url)=>url.includes('/token')?json({access_token:'t'}):json({value:[],'@odata.nextLink':config().baseUrl+'?page='+ ++page})}),/COLLECTION_LIMIT/);assert.equal(page,20);
});
test('non-Microsoft products use their documented credentials and pagination',async()=>{
 const cases=[
  ['cloudflare',{}, {token:'token'},'authorization','Bearer token',{result:[{id:1}],result_info:{page:1,total_pages:2}},{result:[{id:2}],result_info:{page:2,total_pages:2}},'result'],
  ['github',{organization:'acme'},{token:'token'},'authorization','Bearer token',[{id:1}],[{id:2}],'items'],
  ['gitlab',{}, {token:'token'},'private-token','token',[{id:1}],[{id:2}],'items'],
  ['okta',{serviceUrl:'https://acme.okta.com'}, {token:'token'},'authorization','SSWS token',[{id:1}],[{id:2}],'items'],
 ] as const;
 for(const [id,extra,cred,header,expected,first,second,key] of cases){
  const cfg=config(id,extra);let n=0;
  const result=await collectProvider(cfg,JSON.stringify(cred),{fetcher:async(url,init)=>{assert.equal(new Headers(init?.headers).get(header),expected);n++;return json(n===1?first:second,200,n===1?(id==='gitlab'?{'x-next-page':'2'}:id==='cloudflare'?{}:{link:`<${cfg.baseUrl}&page=2>; rel="next"`}):{});}});
  assert.equal(n,2);assert.equal((result[key] as unknown[]).length,2);
 }
 const tenable=await collectProvider(config('tenable'),JSON.stringify({accessKey:'a',secretKey:'b'}),{fetcher:async(_,init)=>{assert.equal(new Headers(init?.headers).get('X-ApiKeys'),'accessKey=a;secretKey=b');return json({scans:[]});}});assert.deepEqual(tenable.scans,[]);
 let n=0;const crowd=await collectProvider(config('crowdstrike',{region:'eu-1'}),secret,{fetcher:async(url,init)=>{assert.ok(url.startsWith('https://api.eu-1.crowdstrike.com/'));if(url.endsWith('/token')){assert.equal(new URLSearchParams(String(init?.body)).get('client_id'),guid);return json({access_token:'t'});}n++;return json({resources:[String(n)],meta:{pagination:{total:2}}});}});assert.equal((crowd.resources as unknown[]).length,2);
});
test('all supported product dataset definitions resolve and keep secrets out of config',()=>{
 for(const p of connectorProfiles)for(const d of p.datasets){const extra=Object.fromEntries(p.fields.map(f=>[f.key,f.options?.[0]||(['tenantId','clientId','subscriptionId'].includes(f.key)?guid:f.key==='serviceUrl'?(p.id==='okta'?'https://acme.okta.com':'https://sonar.example'):'example')]));const {config:cfg}=providerConfiguration({...newConnectorDraft(p.id),dataset:d.id,providerConfig:extra});assert.ok(cfg.baseUrl.startsWith('https://'));assert.ok(!cfg.baseUrl.includes('{'));for(const f of p.secrets)assert.equal(cfg[f.key],undefined);}
});

test('MDE exhausts documented top/skip pages when no OData continuation is supplied',async()=>{
 let count=0;
 const result=await collectProvider(config('defender-endpoint'),secret,{fetcher:async(url)=>{
  if(url.includes('/token'))return json({access_token:'t'});
  const u=new URL(url);assert.equal(u.searchParams.get('$top'),'1000');assert.equal(u.searchParams.get('$skip'),String(count*1000));count++;
  return json({value:count===1?Array.from({length:1000},(_,id)=>({id})):[]});
 }});assert.equal(count,2);assert.equal((result.value as unknown[]).length,1000);
});
test('custom origins survive persisted config and malformed dataset metadata fails closed',async()=>{
 const result=await collectProvider(config('sonarqube',{serviceUrl:'https://sonar.example',projectKey:'test'}),JSON.stringify({token:'t'}),{fetcher:async(url)=>{assert.equal(url,'https://sonar.example/api/qualitygates/project_status?projectKey=test');return json({projectStatus:{status:'OK'}});}});
 assert.deepEqual(result.projectStatus,{status:'OK'});
 for(const body of [{result:[],result_info:{}},{result:[],result_info:{total_pages:3}}])await assert.rejects(collectProvider(config('cloudflare'),JSON.stringify({token:'t'}),{fetcher:async()=>json(body)}),/INVALID_RESPONSE/);
 await assert.rejects(collectProvider(config('tenable'),JSON.stringify({accessKey:'a',secretKey:'b'}),{fetcher:async()=>json({scans:'invalid'})}),/INVALID_RESPONSE/);
});
