import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkAssuranceActions, validWorkAssuranceSnapshot } from '../app/my-work-assurance';
import { buildConnectedGrcEnterpriseRows } from '../app/connected-grc-sources';
import { controlAssuranceRecordTarget, type ControlAssuranceSnapshot } from '../app/control-assurance-state';
import type { AssuranceRow } from '../app/control-assurance';
import { paginateWork } from '../app/work-queue';

const user = {name:'Test',email:'test@example.com',role:'Admin'};
const snapshot = (rows: AssuranceRow[], verified = true): ControlAssuranceSnapshot => ({rows,verified,issues:verified?[]:['integrity-unavailable'],generatedAt:'2026-10-03T12:00:00.000Z'});
const evidence = (id: string, data = {}): AssuranceRow => ({id,module:'Kanıtlar',data:{owner:user.email,evidenceTitle:id,status:'Approved',evidenceIntegrity:'verified',...data}});

test('actions use complete identities and restrict organization view to Admin', () => {
  const rows = [evidence('mine',{status:'Draft'}), evidence('other',{owner:'Test <other@example.com>',status:'Draft'}), evidence('substring',{owner:'Tester',status:'Draft'})];
  assert.deepEqual(buildWorkAssuranceActions(snapshot(rows),user,'mine').map(a=>a.row.id),['mine']);
  assert.equal(buildWorkAssuranceActions(snapshot(rows),user,'organization').length,3);
  assert.equal(buildWorkAssuranceActions(snapshot(rows),{...user,role:'Editor'},'organization').length,1);
  assert.deepEqual(buildWorkAssuranceActions(snapshot(rows),{},'mine'),[]);
});
test('evidence uses both validity fields, exact timestamps, review and validation state', () => {
  const rows = [evidence('good',{expiresAt:'2026-10-03'}),evidence('expired',{expiresAt:'2027-01-01',freshUntil:'2026-10-03T11:59:59Z'}),evidence('failed',{validationStatus:'fail'}),evidence('review',{reviewStatus:'pending-review'}),evidence('broken',{evidenceIntegrity:'broken'}),evidence('bad-date',{freshUntil:'2026-02-30'})];
  const actions = buildWorkAssuranceActions(snapshot(rows),user,'mine');
  assert.equal(actions.length,5); assert.ok(!actions.some(a=>a.row.id==='good'));
  assert.equal(actions.find(a=>a.row.id==='broken')?.critical,true);
});
test('audit gaps retain separate record owners even when controls repeat', () => {
  const rows: AssuranceRow[] = [
    {id:'audit-other',module:'Denetim Yönetimi',data:{owner:'other@example.com',controlRef:'CTL-1'}},
    {id:'audit-mine',module:'Denetim Yönetimi',data:{owner:user.email,controlRef:'CTL-1'}},
    {id:'audit-unmapped',module:'Denetim Yönetimi',data:{owner:user.email}},
  ];
  const actions = buildWorkAssuranceActions(snapshot(rows),user,'mine');
  assert.deepEqual(actions.map(a=>a.row.id),['audit-mine','audit-unmapped']);
  assert.equal(controlAssuranceRecordTarget(actions[0].row)?.ref,'audit-mine');
});
test('canonical CAPA preserves reviewer assignment, accepted expiry and excludes duplicate remediation', () => {
  const rows = buildConnectedGrcEnterpriseRows({findings:{findings:[
    {id:'f1',code:'FND-1',title:'Expired acceptance',owner:'other@example.com',reviewer:user.email,status:'accepted',accept_until:'2026-10-02',severity:'high'},
    {id:'f2',code:'FND-2',owner:user.email,status:'accepted',acceptUntil:'2026-10-03'},
    {id:'f3',code:'FND-3',owner:user.email,status:'closed'},
  ]}});
  const actions=buildWorkAssuranceActions(snapshot(rows),user,'mine');
  assert.equal(actions.length,1); assert.deepEqual(actions[0].reasons,['acceptance-expired']);
  assert.equal(controlAssuranceRecordTarget(actions[0].row)?.ref,'FND-1');
});
test('unavailable and malformed snapshots cannot certify an empty action list', () => {
  assert.equal(validWorkAssuranceSnapshot(snapshot([])),true);
  assert.equal(validWorkAssuranceSnapshot({...snapshot([]),rows:[{id:'x',module:'Kanıtlar',data:null}]}),false);
  assert.equal(validWorkAssuranceSnapshot({...snapshot([]),issues:['records-incomplete']}),false);
  assert.equal(validWorkAssuranceSnapshot({...snapshot([]),generatedAt:'invalid'}),false);
  assert.deepEqual(buildWorkAssuranceActions(snapshot([evidence('draft',{status:'Draft'})],false),user,'mine'),[]);
});
test('all assigned actions remain reachable beyond the first page', () => {
  const actions=buildWorkAssuranceActions(snapshot(Array.from({length:19},(_,i)=>evidence(`E${i}`,{status:'Draft'}))),user,'mine');
  assert.equal(new Set([0,1,2].flatMap(p=>paginateWork(actions,p,8).items.map(a=>a.row.id))).size,19);
});
