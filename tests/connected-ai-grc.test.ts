import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConnectedGrcEnterpriseRows, connectedAiSourceComplete, connectedGrcEndpoints } from '../app/connected-grc-sources';
import { buildConnectedGrcGraph, assessConnectedGrcCoverage } from '../app/connected-grc-model';

const payloads = {
  aiModels: { models: [{ id: 'AIM-1', systemName: 'Assistant', controls: 'CTL-1' }] },
  aiAlerts: { alerts: [{ id: 'AIA-1', modelId: 'AIM-1', findingId: 'AIF-1', title: 'Drift' }] },
  aiFindings: { findings: [{ id: 'AIF-1', modelId: 'AIM-1', title: 'Remediate drift', evidenceReference: 'EVD-1' }] },
};
test('AI model, alert and CAPA form three native-ID edges without inventing evidence or control links', () => {
  const rows = buildConnectedGrcEnterpriseRows(payloads);
  const { links, unresolved } = buildConnectedGrcGraph(rows);
  assert.equal(rows.length, 3);
  assert.deepEqual(links.map(link => link.relation).sort(), ['ai-finding', 'ai-model', 'ai-model']);
  assert.equal(unresolved.length, 0);
  assert.equal(assessConnectedGrcCoverage(rows, links).eligible, 0);
});
test('AI references never resolve by display names, codes or wrong record kinds', () => {
  const rows = buildConnectedGrcEnterpriseRows({ ...payloads, aiModels: { models: [{ id: 'other', systemName: 'AIM-1', code: 'AIM-1' }] } });
  const graph = buildConnectedGrcGraph(rows);
  assert.equal(graph.unresolved.length, 2);
  assert.equal(graph.links.length, 1);
  const wrong = buildConnectedGrcEnterpriseRows({ aiFindings: { findings: [{ id: 'AIM-1', modelId: 'AIM-2' }] }, aiAlerts: payloads.aiAlerts });
  assert.equal(buildConnectedGrcGraph(wrong).links.length, 0);
});
test('missing AI targets remain visible and duplicate canonical targets are ambiguous', () => {
  const rows = buildConnectedGrcEnterpriseRows(payloads);
  const model = rows.find(row => row.data.kind === 'ai-model')!;
  const graph = buildConnectedGrcGraph([...rows, { ...model, id: 'duplicate' }]);
  assert.equal(graph.unresolved.filter(item => item.reason === 'ambiguous').length, 2);
  const missing = buildConnectedGrcGraph(buildConnectedGrcEnterpriseRows({ aiAlerts: payloads.aiAlerts }));
  assert.equal(missing.unresolved.length, 2);
});
test('AI source completeness rejects malformed, duplicate and capped payloads', () => {
  assert.equal(connectedAiSourceComplete('aiModels', { models: [] }), true);
  for (const body of [{}, { models: [null] }, { models: [{ id: '' }] }, { models: [{id:'a'}, {id:'a'}] }, { models: Array.from({length:500}, (_,id)=>({id:String(id)})) }])
    assert.equal(connectedAiSourceComplete('aiModels', body), false);
  assert.equal(connectedAiSourceComplete('aiAlerts', payloads.aiAlerts), true);
  assert.equal(connectedAiSourceComplete('aiFindings', payloads.aiFindings), true);
});
test('non-admin graph endpoint set never requests restricted AI APIs', () => {
  assert.equal(connectedGrcEndpoints(false).some(endpoint => endpoint.path.startsWith('/api/ai/')), false);
  assert.equal(connectedGrcEndpoints(true).length, 11);
});
