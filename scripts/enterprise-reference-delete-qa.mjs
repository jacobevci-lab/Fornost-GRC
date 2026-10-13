import {qaPassword} from './qa-credentials.mjs';
import {request} from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173';
const context=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base}});
async function api(path,method='GET',data){const response=await context.fetch(path,{method,data});assert.equal(response.ok(),true,`${method} ${path}: ${await response.text()}`);return response.json();}
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 for(const path of ['/api/continuity','/api/incidents','/api/policy-lifecycle','/api/third-party-risk','/api/findings','/api/regulatory-intelligence'])await api(path);
 const rows=(await api('/api/grc')).rows;
 for(const moduleName of ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Tedarikçiler','Kontroller','Kanıtlar','Denetim Yönetimi']){
  const seed=rows.find(row=>row.module===moduleName);assert.ok(seed,moduleName);
  const created=await api('/api/grc','POST',{module:moduleName,data:JSON.parse(seed.data_json)});
  await api(`/api/grc?id=${created.id}`,'DELETE');
 }
 console.log('ENTERPRISE_REFERENCE_DELETE_QA_PASS: unlinked deletion across eight core modules with optional enterprise schemas initialized');
}finally{await context.dispose();}
