import {qaPassword} from './qa-credentials.mjs';
import {request} from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173';
const context=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base}});
async function api(path,method='GET',data){const response=await context.fetch(path,{method,data});assert.equal(response.ok(),true,`${method} ${path}: ${await response.text()}`);return response.json();}
try{
 await api('/api/auth','POST',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
 for(const path of ['/api/continuity','/api/incidents','/api/policy-lifecycle','/api/third-party-risk','/api/findings','/api/regulatory-intelligence','/api/evidence-automation','/api/continuous-assurance/governance'])await api(path);
 const rows=(await api('/api/grc')).rows;
 for(const moduleName of ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Tedarikçiler','Kontroller','Kanıtlar','Denetim Yönetimi']){
  const seed=rows.find(row=>row.module===moduleName);assert.ok(seed,moduleName);
  const created=await api('/api/grc','POST',{module:moduleName,data:JSON.parse(seed.data_json)});
  await api(`/api/grc?id=${created.id}`,'DELETE');
 }
 const seed=rows.find(row=>row.module==='Kontroller');
 const target=await api('/api/grc','POST',{module:'Kontroller',data:JSON.parse(seed.data_json)});
 const {sourceId}=await api('/api/evidence-automation','POST',{action:'save-source',name:'QA protected control source',vendor:'Generic REST',category:'Security',driver:'rest-json',baseUrl:'https://example.com',path:'/qa',authType:'none'});
 const ruleInput={action:'save-rule',name:'QA retained control reference',sourceId,controlRefs:target.id,jsonPath:'status',operator:'exists',expected:'',schedule:'monthly',freshnessHours:24,failureThreshold:1,remediationDueDays:7,autoFinding:false,remediationOwner:'qa-admin@fornost.test'};
 const invalid=await context.post('/api/evidence-automation',{data:{...ruleInput,controlRefs:'CTL-999999999'}});
 assert.equal(invalid.status(),422,await invalid.text());assert.equal((await invalid.json()).code,'REFERENCE_UNAVAILABLE');
 const {ruleId}=await api('/api/evidence-automation','POST',ruleInput);
 // Never execute the source; disabling collection must not erase its reference history.
 await api('/api/evidence-automation','POST',{action:'toggle-rule',ruleId,enabled:false});
 const blocked=await context.delete(`/api/grc?id=${target.id}`);
 assert.equal(blocked.status(),409,await blocked.text());
 assert.equal((await blocked.json()).code,'RECORD_LINKED');
 assert.ok((await api('/api/grc')).rows.some(row=>row.id===target.id));
 console.log('ENTERPRISE_REFERENCE_DELETE_QA_PASS: unlinked deletion across eight core modules and disabled automation rule preserving its control');
}finally{await context.dispose();}
