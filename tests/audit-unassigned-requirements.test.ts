import test from 'node:test';
import assert from 'node:assert/strict';
import { unassignedAuditRequirements } from '../app/audit-unassigned-requirements';

test('unassigned requirements use the readiness identity without inventing or changing an assignment', () => {
  const audits = [{ name: 'İç Denetim' }, { name: 'SOC 2' }];
  const rows = [
    { id: 'exact', data: { auditName: 'SOC 2' } },
    { id: 'normalized', data: { auditName: '  iç denetim  ' } },
    { id: 'fullwidth', data: { auditName: 'ＳＯＣ ２' } },
    { id: 'prefix', data: { auditName: 'SOC 2 extra' } },
    { id: 'missing', data: { auditName: 'Removed audit' } },
    { id: 'empty', data: { auditName: '' } },
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(unassignedAuditRequirements(rows, audits).map(row => row.id), ['prefix', 'missing', 'empty']);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(unassignedAuditRequirements(rows, []).length, rows.length);
  assert.deepEqual(unassignedAuditRequirements(rows, [...audits, { name: 'Removed audit' }]).map(row => row.id), ['prefix', 'empty']);
});
