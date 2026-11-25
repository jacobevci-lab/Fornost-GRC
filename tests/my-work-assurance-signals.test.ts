import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkAssuranceActions } from '../app/my-work-assurance';
import { buildControlAssurance, type AssuranceRow } from '../app/control-assurance';
import { controlAssuranceRecordTarget } from '../app/control-assurance-state';

test('My Work uses the same critical control decision and integrity reasons as Control Library', () => {
  const rows: AssuranceRow[] = [
    {id:'c1',code:'CTL-1',module:'Kontroller',data:{controlRef:'CTL-1',controlTitle:'Access control',owner:'owner@example.com',testOwner:'tester@example.com',nextTestDate:'2027-01-01'}},
    {id:'e1',module:'Kanıtlar',data:{controlRef:'CTL-1',status:'Approved',evidenceIntegrity:'broken',owner:'owner@example.com'}},
  ];
  const snapshot={rows,verified:true,issues:[],generatedAt:'2026-10-03T12:00:00Z'};
  const reference=buildControlAssurance(rows,snapshot.generatedAt).items[0];
  assert.equal(reference.state,'critical');
  const action=buildWorkAssuranceActions(snapshot,{email:'tester@example.com',role:'Viewer'},'mine')[0];
  assert.equal(action.group,'control');assert.deepEqual(action.reasons,reference.reasons);
  assert.ok(action.reasons.includes('evidence-integrity-broken'));
  const target=controlAssuranceRecordTarget(action.row);
  assert.equal(target?.ref,'CTL-1');assert.equal(target?.module,'Kontroller');
});
