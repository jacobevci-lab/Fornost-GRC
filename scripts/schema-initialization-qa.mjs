import assert from 'node:assert/strict';
import { request } from '@playwright/test';
import { qaPassword } from './qa-credentials.mjs';

// Isolated local runtime only. Run before feature QA warms the module schemas.
const base='http://127.0.0.1:4173';
const client=await request.newContext({baseURL:base,extraHTTPHeaders:{origin:base},timeout:30000});
const paths=['/api/ai/models','/api/ai/assurance-alerts','/api/grc','/api/findings','/api/integrations','/api/evidence/history'];
try{
 const login=await client.post('/api/auth',{data:{action:'login',email:'qa-admin@fornost.test',password:qaPassword()}});
 assert.equal(login.status(),200);
 for(const wave of ['cold','warm']){
  const results=await Promise.all([...paths,...paths].map(async path=>{
   try{
    const response=await client.get(path);
    const body=await response.json();
    return {path,status:response.status(),ok:response.ok()&&body!==null&&typeof body==='object'};
   }catch{return {path,ok:false,reason:'request-failed'};}
  }));
  assert.deepEqual(results.filter(result=>!result.ok),[],`${wave} concurrent schema reads failed`);
  console.log(`SCHEMA_INITIALIZATION_QA_PASS ${wave}: ${results.length} concurrent authenticated reads across ${paths.length} endpoints`);
 }
}finally{
 await client.post('/api/auth',{data:{action:'logout'}}).catch(()=>{});
 await client.dispose();
}
