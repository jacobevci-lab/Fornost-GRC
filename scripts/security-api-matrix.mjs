import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.FORNOST_PROD_URL;
assert.equal(base,'https://127.0.0.1:4173','API matrix may only probe the disposable target');
const origin=new URL(base).origin, results=[];
async function routes(dir){const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await routes(file));else if(entry.name==='route.ts')out.push(file);}return out;}
const files=await routes('app/api');assert.ok(files.length>=80,'Inventory must cover the API tree');
const login=await fetch(`${base}/api/auth`,{method:'POST',headers:{origin,'content-type':'application/json',connection:'close'},body:JSON.stringify({action:'login',email:process.env.FORNOST_SMOKE_EMAIL,password:process.env.FORNOST_SMOKE_PASSWORD})});
assert.equal(login.status,200,'API matrix login');
const cookie=login.headers.getSetCookie().find(value=>value.startsWith('fornost_session='))?.split(';')[0];assert.ok(cookie);
for(const file of files){
 const endpoint='/'+file.replace(/^app\//,'').replace(/\/route\.ts$/,'');
 if(['/api/auth','/api/health'].includes(endpoint))continue;
 const retired=['/api/identity','/api/records','/api/security-lab'].includes(endpoint);
 const source=await fs.readFile(file,'utf8');
 const methods=[...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(match=>match[1]);
 assert.ok(methods.length,`Inventory parser must recognize ${file}`);
 for(const method of methods)for(const probe of ['anonymous','forged-platform-identity','hostile-origin']){
  const headers={origin:probe==='hostile-origin'?'https://attacker.invalid':origin,connection:'close'};
  if(probe==='forged-platform-identity')headers['oai-authenticated-user-email']=process.env.FORNOST_SMOKE_EMAIL;
  if(probe==='hostile-origin')headers.cookie=cookie;
  let body;if(method!=='GET'){headers['content-type']='application/json';body='{}';}
  const response=await fetch(`${base}${endpoint}`,{method,headers,body,redirect:'manual'});
  await response.arrayBuffer();
  const expected=retired?[410]:probe==='hostile-origin'?[403]:[401,403];
  results.push({endpoint,method,probe,status:response.status,passed:expected.includes(response.status)});
 }
}
const failed=results.filter(result=>!result.passed);
await fs.writeFile('security-artifacts/runtime/api-matrix.json',JSON.stringify({routesInventoried:files.length,checks:results.length,passed:results.length-failed.length,failed,results},null,2));
console.log('API_SECURITY_MATRIX',JSON.stringify({routesInventoried:files.length,checks:results.length,passed:results.length-failed.length,failed}));
if(failed.length)process.exitCode=2;
