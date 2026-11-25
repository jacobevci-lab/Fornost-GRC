import assert from 'node:assert/strict';
import test from 'node:test';
import { incidentDescription, sessionOwner, verifyIncidentIdentity } from '../scripts/entra-qa/resume.mjs';
import { verifyDeployedIncident } from '../scripts/entra-qa/deployed-incident.mjs';
import { title } from '../scripts/entra-qa/records.mjs';

const owner = 'qa@example.invalid';
const context = {
  people: { owner, lead: 'lead@example.invalid', reviewer: 'reviewer@example.invalid' },
  ids: { asset: 'asset-id', risk: 'risk-id', bia: 'bia-id' },
  codes: { asset: 'AST-726', risk: 'RSK-698', bia: 'BIA-011' },
};
const incident = {
  title: title.incident, description: incidentDescription, declaredBy: owner, owner,
  commander: context.people.lead, reviewer: context.people.reviewer, personalData: true,
  assetRefs: 'asset-id', riskRef: 'RSK-698', biaRef: 'bia-id',
};

test('replay binds the normalized login to the same active admin session', () => {
  assert.equal(sessionOwner(' QA@Example.Invalid\r\n', { role: 'Admin', email: owner }), owner);
  for (const user of [{ role: 'Editor', email: owner }, { role: 'Admin', email: 'other@example.invalid' }, {}])
    assert.throws(() => sessionOwner(owner,user), /identity\.session-owner/);
  assert.throws(() => sessionOwner('', { role: 'Admin', email: '' }), /identity\.session-owner/);
});

test('an incident replay requires every actor, reference and exercise marker', () => {
  verifyIncidentIdentity(incident, context);
  for (const [field,value,label] of [
    ['declaredBy','other@example.invalid','declaredBy'], ['owner','', 'owner'],
    ['commander',owner,'commander'], ['reviewer',owner,'reviewer'],
    ['assetRefs','AST-999','assetRefs'], ['riskRef',null,'riskRef'], ['biaRef','unrelated','biaRef'],
    ['personalData',false,'personal-data'], ['description','different exercise','exercise-marker'],
  ]) {
    assert.throws(() => verifyIncidentIdentity({...incident, [field]:value},context),
      error => error.qaCheck === 'incident.' + label);
  }
});

test('the deploy read check skips an absent exercise without loading other collections', async () => {
  const calls = [];
  const result = await verifyDeployedIncident(async path => { calls.push(path); return {incidents: []}; },owner);
  assert.deepEqual(calls, ['/api/incidents']);
  assert.match(result, /No existing/);
});
