import test from 'node:test';
import assert from 'node:assert/strict';
import {filterAuditRequirements,requirementWork,type AuditDeskRequirement} from '../app/audit-workspace-model';
import type {AuditWorkpaper} from '../app/audit-workpapers';
import type {AuditRequest} from '../app/audit-requests';
const row:AuditDeskRequirement={id:'req-a',data:{requirementRef:'A.5.15',requirementTitle:'Erişim kontrolü',owner:'IAM',dueDate:'2026-01-01',status:'Başlanmadı'}};
const paper=(requirementId:string,status:string)=>({requirementId,status} as AuditWorkpaper);
const request=(requirementId:string,status:string)=>({requirementId,status} as AuditRequest);
test('work views use exact requirement IDs, never same control title or reference',()=>{
 assert.equal(requirementWork(row,[],[paper('req-b','submitted')]).lane,'evidence');
 assert.equal(requirementWork(row,[request('req-a','submitted')],[]).lane,'review');
 assert.equal(requirementWork(row,[],[paper('req-a','draft')]).lane,'preparing');
 assert.equal(requirementWork(row,[],[paper('req-a','cancelled')]).papers.length,0);
});
test('pending independent review takes precedence over manually closed requirement',()=>{
 const closed={...row,data:{...row.data,status:'Tamamlandı'}};
 assert.equal(requirementWork(closed,[],[paper('req-a','submitted')]).lane,'review');
 assert.equal(requirementWork(closed,[],[paper('req-a','draft')]).lane,'preparing');
 assert.equal(requirementWork(closed,[],[]).lane,'complete');
 assert.equal(requirementWork(closed,[],[]).approvedTests,0);
 assert.equal(requirementWork(row,[],[paper('req-a','approved')]).lane,'preparing');
});
test('search, exact owner and overdue filters intersect without cross-audit assumptions',()=>{
 const rows=[row,{id:'other',data:{...row.data,owner:'SOC',dueDate:'2099-01-01'}}];
 assert.equal(filterAuditRequirements(rows,'erişim','IAM',true,Date.parse('2026-11-16')).length,1);
 assert.equal(filterAuditRequirements(rows,'erişim','SOC',true,Date.parse('2026-11-16')).length,0);
 assert.equal(filterAuditRequirements(rows,'no match','',false,Date.now()).length,0);
});
