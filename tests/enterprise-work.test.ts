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
  const payload = { profiles: [{ vendorId: 'vendor', name: 'Supplier', status: 'in-review', riskOwner: 'owner', reviewer: 'reviewer' }], assessments: ['submitted','conditional','superseded'].map(status => ({ id: status, vendorId: 'vendor', status })), findings: [{ id: 'finding', vendorId: 'vendor', status: 'verification', owner: 'finder', dueDate: '2026-10-01' }] };
  const result = projectEnterpriseWork('vendor', payload);
  assert.equal(result.complete, true);
  assert.equal(result.rows.find(row => row.nativeRef === 'submitted')?.data.reviewer, 'reviewer');
  assert.equal(result.rows.find(row => row.nativeRef === 'conditional')?.data.workClosed, true);
  assert.equal(result.rows.find(row => row.nativeRef === 'finding')?.data.reviewer, 'reviewer');
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
