import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedRecordOptions } from '../app/linked-record-options';
import { buildConnectedGrcGraph } from '../app/connected-grc-model';

test('same-name assets remain separately selectable and legacy values are not rewritten', () => {
  const assets = ['a', 'b'].map(id => ({ id, code: `AST-${id}`, module: 'Varlık Envanteri', data: { title: 'Shared' } }));
  const options = linkedRecordOptions(assets, 'title', ['Shared', 'deleted'], false);
  assert.deepEqual(options.map(o => o.value), ['AST-a', 'AST-b', 'Shared', 'deleted']);
  assert.match(options[2].label, /ambiguous link/);
  assert.match(options[3].label, /unavailable/);
  for (const option of options.slice(0, 2)) {
    const graph = buildConnectedGrcGraph([...assets, { id: 'risk', module: 'Risk Assessment', data: { asset: option.value } }]);
    assert.equal(graph.links.length, 1);
  }
});

test('duplicate codes and code-ID collisions use canonical IDs', () => {
  const assets = [
    { id: 'asset-a', code: 'DUP', module: 'Varlık Envanteri', data: { title: 'A' } },
    { id: 'asset-b', code: 'DUP', module: 'Varlık Envanteri', data: { title: 'B' } },
    { id: 'DUP', code: 'AST-C', module: 'Varlık Envanteri', data: { title: 'C' } },
  ];
  assert.deepEqual(linkedRecordOptions(assets, 'title', [], true).map(o => o.value), ['asset-a', 'asset-b', 'AST-C']);
});
