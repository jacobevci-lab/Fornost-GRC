import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPeriod,inAuditPeriod,validateAuditTeam} from '../app/audit-engagement';

test('engagement dates and normalized identities reject impossible dates and shared audit ownership',()=>{
  assert.equal(auditPeriod('2024-02-29','2024-03-01',''),'2024-02-29..2024-03-01');
  for(const [start,end] of [['2025-02-29','2025-03-01'],['','2026-01-01'],['2026-01-02','2026-01-01']])assert.throws(()=>auditPeriod(start,end,''));
  assert.throws(()=>validateAuditTeam('Owner@org.test','peer@other.test; OWNER@org.test',true));
  assert.throws(()=>validateAuditTeam('owner@org.test','peer@other.test; PEER@other.test',true));
  validateAuditTeam('owner@org.test','first@org.test; external@other.test',true);
});
test('period selection respects exact named periods and includes only evidence in the observation window',()=>{
  const range='2026-07-01..2026-09-30';
  for(const period of ['2026-Q3','Q3 2026','2026-07','2026-09-30',range])assert.ok(inAuditPeriod(period,'',range));
  assert.equal(inAuditPeriod('2026-Q2','2026-07-01',range),false);
  assert.equal(inAuditPeriod('rollout','2026-08-12',range),true);
  assert.equal(inAuditPeriod('rollout','',range),false);
  assert.equal(inAuditPeriod('FY24','','FY24'),true);
});
