import test from 'node:test';
import assert from 'node:assert/strict';
import { buildControlAssurance, buildControlAssuranceDetail, type AssuranceRow } from '../app/control-assurance';
const row = (id: string, module: string, data: Record<string, unknown>): AssuranceRow => ({ id, module, data });
const fixture = () => [
  row('control', 'Kontroller', { controlTitle: 'Access control', processLink: 'process-direct' }),
  row('audit', 'Denetim Yönetimi', { requirementRef: 'control', riskRef: 'risk' }),
  row('risk', 'Risk Assessment', { title: 'Service outage', asset: 'asset-a' }),
  row('asset-a', 'Varlık Envanteri', { title: 'Identity', criticality: 'Kritik' }),
  row('asset-b', 'Varlık Envanteri', { title: 'Unrelated asset' }),
  row('asset-x', 'Varlık Envanteri', { title: 'Direct process asset' }),
  row('process-direct', 'BIA', { process: 'Direct service', asset: 'asset-x', rto: '4', rpo: 0, mtpd: '12' }),
  row('process-shared', 'BIA', { process: 'Payments', asset: ['asset-a', 'asset-b'], criticality: 'critical', owner: 'Payments owner', rto: 2, rpo: 0, mtpd: 8 }),
  row('process-unrelated', 'BIA', { process: 'Unrelated service', asset: 'asset-b' }),
];

test('explains risk-to-asset-to-process and direct process dependencies without recursively spreading exposure', () => {
  const detail = buildControlAssuranceDetail(fixture(), 'control')!;
  assert.deepEqual(detail.businessImpact.assets.map(x => x.row.id), ['asset-a', 'asset-x']);
  assert.deepEqual(detail.businessImpact.processes.map(x => x.row.id), ['process-shared', 'process-direct']);
  const shared = detail.businessImpact.processes[0];
  assert.equal(shared.origin, 'linked-risk');
  assert.deepEqual(shared.path.map(row => row.id), ['risk', 'asset-a', 'process-shared']);
  assert.equal(shared.critical, true);
  assert.deepEqual(shared.recovery, { rto: 2, rpo: 0, mtpd: 8 });
});

test('ambiguous references never create business exposure and remain explicit gaps', () => {
  const rows = fixture();
  rows.find(row => row.id === 'risk')!.data.asset = 'Duplicate';
  rows.find(row => row.id === 'asset-a')!.data.title = 'Duplicate';
  rows.find(row => row.id === 'asset-b')!.data.title = 'Duplicate';
  const detail = buildControlAssuranceDetail(rows, 'control')!;
  assert.deepEqual(detail.businessImpact.assets.map(x => x.row.id), ['asset-x']);
  assert.equal(detail.businessImpact.unresolved[0].reason, 'ambiguous');
  assert.ok(detail.unresolved.some(gap => gap.sourceId === 'risk' && gap.value === 'Duplicate'));
});

test('zero recovery is preserved and absent, invalid or negative targets stay unknown', () => {
  const rows = fixture();
  Object.assign(rows.find(row => row.id === 'process-direct')!.data, { rto: '', rpo: -1, mtpd: 'broken' });
  const detail = buildControlAssuranceDetail(rows, 'control')!;
  assert.deepEqual(detail.businessImpact.processes.find(x => x.row.id === 'process-direct')?.recovery, { rto: null, rpo: null, mtpd: null });
  assert.equal(detail.businessImpact.processes[0].recovery.rpo, 0);
});

test('multiple paths count targets once and choose a stable shortest explanation', () => {
  const rows = fixture();
  rows.find(row => row.id === 'risk')!.data.processLink = 'process-shared';
  const impact = buildControlAssuranceDetail(rows, 'control')!.businessImpact;
  assert.equal(impact.processes.filter(x => x.row.id === 'process-shared').length, 1);
  assert.deepEqual(impact.processes[0].path.map(row => row.id), ['risk', 'process-shared']);
  const reversed = buildControlAssuranceDetail([...rows].reverse(), 'control')!.businessImpact;
  assert.deepEqual(reversed.processes.map(x => x.path.map(row => row.id)), impact.processes.map(x => x.path.map(row => row.id)));
});

test('business impact enrichment does not change scores or persisted risk data', () => {
  const rows = fixture(), before = JSON.stringify(rows);
  const score = buildControlAssurance(rows).score;
  buildControlAssuranceDetail(rows, 'control');
  assert.equal(buildControlAssurance(rows).score, score);
  assert.equal(JSON.stringify(rows), before);
});
