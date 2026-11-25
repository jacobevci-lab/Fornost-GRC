import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEnterpriseWork } from '../app/enterprise-work';
import { matchesWorkIdentity } from '../app/work-queue';
const policy = () => ({ documents: [{ id: 'p1', code: 'POL-1', title: 'Security', status: 'published', owner: 'owner@test.invalid', reviewer: 'review@test.invalid', nextReview: '2026-12-01' }], versions: [], campaigns: [], attestations: [], exceptions: [] }) as Record<string, Record<string, unknown>[]>;

test('approved versions still require release; published versions are complete', () => {
  const payload = policy();
  payload.versions = ['approved', 'published'].map(status => ({ id: status, policyId: 'p1', versionNumber: 1, status, updatedAt: '2026-10-04T10:00:00Z' }));
  const result = projectEnterpriseWork('policy', payload);
  assert.equal(result.complete, true);
  const approved = result.rows.find(row => row.nativeRef === 'approved')!;
  assert.equal(approved.data.workClosed, false);
  assert.equal(approved.data.reviewer, 'review@test.invalid');
  assert.equal(result.rows.find(row => row.nativeRef === 'published')?.data.workClosed, true);
  assert.equal(approved.updatedAt, '2026-10-04T10:00:00Z');
});

test('attestations are assigned exactly and closed campaigns do not create phantom tasks', () => {
  const payload = policy();
  payload.campaigns = [{ id: 'open', status: 'open' }, { id: 'closed', status: 'closed' }];
  payload.attestations = ['open', 'closed'].map(campaignId => ({ id: campaignId, campaignId, policyId: 'p1', status: 'pending', subjectEmail: 'owner@test.invalid', policyTitle: 'Security' }));
  const result = projectEnterpriseWork('policy', payload);
  const rows = result.rows.filter(row => row.workKind === 'policy-attestation');
  assert.equal(rows.length, 1);
  assert.equal(matchesWorkIdentity([String(rows[0].data.owner)], { email: 'owner@test.invalid.other' }), false);
  assert.equal(matchesWorkIdentity([String(rows[0].data.owner)], { email: 'owner@test.invalid' }), true);
});

test('approved and expired exceptions are active work; submitted exceptions include reviewer', () => {
  const payload = policy();
  payload.exceptions = ['approved', 'expired', 'submitted', 'closed'].map(status => ({ id: status, policyId: 'p1', status, owner: 'owner@test.invalid', reviewer: 'review@test.invalid', expiresAt: '2026-10-01' }));
  const result = projectEnterpriseWork('policy', payload);
  for (const row of result.rows.filter(row => row.workKind === 'policy-exception')) {
    assert.equal(row.data.workClosed, row.nativeRef === 'closed');
    assert.equal(row.data.dueDate, '2026-10-01');
  }
  assert.equal(result.rows.find(row => row.nativeRef === 'submitted')?.data.reviewer, 'review@test.invalid');
});

test('vendor lifecycle retains native targets, review assignments and terminal decisions', () => {
  const dates = {createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z'};
  const payload = { complete:true, profiles: [{...dates, vendorId: 'vendor', name: 'Supplier', status: 'in-review', criticality:'high',businessOwner:'business@example.com', riskOwner: 'owner@example.com', reviewer: 'reviewer@example.com',nextReview:'2026-12-01',contractEnd:'2027-12-01' }], assessments: ['submitted','conditional','superseded'].map(status => ({...dates, id: status, vendorId: 'vendor', status,cycleNumber:1,riskTier:'high',decidedBy:status==='submitted'?null:'reviewer@example.com' })), findings: [{...dates, id: 'finding', vendorId: 'vendor',assessmentId:'conditional',title:'Remediate finding',severity:'high', status: 'verification', owner: 'finder@example.com', dueDate: '2026-10-01' }] };
  const result = projectEnterpriseWork('vendor', payload);
  assert.equal(result.complete, true);
  assert.equal(result.rows.find(row => row.nativeRef === 'submitted')?.data.reviewer, 'reviewer@example.com');
  assert.equal(result.rows.find(row => row.nativeRef === 'conditional')?.data.workClosed, true);
  assert.equal(result.rows.find(row => row.nativeRef === 'finding')?.data.reviewer, 'reviewer@example.com');
  assert.equal(new Set(result.rows.map(row => row.id)).size, result.rows.length);
});

test('regulatory verification is assigned to parent reviewer; completed impacts stay completed', () => {
  const result = projectEnterpriseWork('regulatory', { changes: [{ id: 'change', title: 'Change', status: 'verification', owner: 'owner', reviewer: 'reviewer' }], impacts: ['verification','completed'].map(status => ({ id: status, changeId: 'change', status, actionOwner: 'action-owner', requiredAction: 'Remediate' })) });
  assert.equal(result.complete, true);
  assert.equal(result.rows.find(row => row.nativeRef === 'verification')?.data.reviewer, 'reviewer');
  assert.equal(result.rows.find(row => row.nativeRef === 'completed')?.data.workClosed, true);
});

test('malformed, duplicate, orphaned and bounded sources cannot establish completeness', () => {
  assert.equal(projectEnterpriseWork('policy', {}).complete, false);
  const payload = policy(); payload.versions = [{ id: 'orphan', status: 'draft', policyId: 'absent' }];
  const orphan = projectEnterpriseWork('policy', payload);
  assert.equal(orphan.complete, false); assert.equal(orphan.rows.some(row => row.nativeRef === 'orphan'), false);
  payload.versions = [{ id: 'bad' }]; assert.equal(projectEnterpriseWork('policy', payload).complete, false);
  payload.versions = []; payload.documents.push(payload.documents[0]); assert.equal(projectEnterpriseWork('policy', payload).complete, false);
  const bounded = { profiles: Array.from({ length: 1000 }, (_, i) => ({ vendorId: String(i), status: 'active' })), assessments: [], findings: [] };
  assert.equal(projectEnterpriseWork('vendor', bounded).complete, false);
});


test('audit closure tasks retain native package targets and never imply completed or scheduled work',()=>{
 const task={id:'ACL-1',auditId:'audit-a',title:'Access audit',owner:'preparer@example.com',reviewer:'reviewer@example.com',status:'submitted'};
 const result=projectEnterpriseWork('audit',{requests:[],closures:[task],complete:true});
 assert.equal(result.complete,true);assert.equal(result.rows[0].workKind,'audit-closure');assert.equal(result.rows[0].nativeRef,'ACL-1');assert.equal(result.rows[0].data.auditId,'audit-a');assert.equal(result.rows[0].data.workClosed,false);assert.equal(result.rows[0].data.dueDate,undefined);
 assert.equal(projectEnterpriseWork('audit',{requests:[],closures:[{...task,reviewer:''}],complete:true}).complete,false);
});


test('workpaper tasks follow owner preparation, reviewer handoff, completion and exact native links without invented deadlines', () => {
 const paper={id:'AWP-1',auditId:'audit-a',title:'Sample testing',owner:'owner@example.com',reviewer:'reviewer@example.com'};
 for(const status of ['draft','submitted','approved','cancelled']) {
  const result=projectEnterpriseWork('audit',{requests:[],workpapers:[{...paper,status}],complete:true});
  assert.equal(result.complete,true);assert.equal(result.rows.length,1);
  const row=result.rows[0];assert.equal(row.workKind,'audit-workpaper');assert.equal(row.nativeRef,paper.id);assert.equal(row.data.auditId,paper.auditId);
  assert.equal(row.data.owner,paper.owner);assert.equal(row.data.reviewer,status==='submitted'?paper.reviewer:'');
  assert.equal(row.data.workClosed,['approved','cancelled'].includes(status));assert.equal(row.data.dueDate,undefined);
  assert.equal(matchesWorkIdentity([String(row.data.owner)],{email:'owner@example.com.other'}),false);
 }
 for(const papers of [[{...paper,status:'unknown'}],[{...paper,status:'draft',auditId:''}],[{...paper,status:'draft'},{...paper,status:'draft'}]]) {
  const result=projectEnterpriseWork('audit',{requests:[],workpapers:papers,complete:true});assert.equal(result.complete,false);assert.deepEqual(result.rows,[]);
 }
 assert.equal(projectEnterpriseWork('audit',{requests:[],workpapers:[],complete:false}).complete,false);
});

test('workpaper queue uses server phase deadline and refuses malformed dates; terminal work is undated', () => {
 const p={id:'AWP-schedule',auditId:'audit-a',title:'Scheduled samples',owner:'owner@example.com',reviewer:'reviewer@example.com',status:'draft',dueAt:'2026-10-21T20:59:59.999Z'};
 const project=(patch={})=>projectEnterpriseWork('audit',{requests:[],workpapers:[{...p,...patch}],complete:true});
 assert.equal(project().rows[0].data.dueDate,p.dueAt);
 assert.equal(project({status:'submitted',dueAt:'2026-10-24T20:59:59.999Z'}).rows[0].data.dueDate,'2026-10-24T20:59:59.999Z');
 for (const status of ['approved','cancelled']) assert.equal(project({status}).rows[0].data.dueDate,undefined);
 assert.equal(project({dueAt:''}).rows[0].data.dueDate,undefined);
 for (const dueAt of ['invalid',42,null]) {assert.equal(project({dueAt}).complete,false);assert.equal(project({dueAt}).rows.length,0);}
});
