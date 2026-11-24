import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeConnectorRegister} from '../app/integrations/connector-register';
test('legacy Jira transport belongs to exactly one enterprise connector and keeps independent health semantics',()=>{
 const transport={provider:'jira',enabled:1,updated_at:'2026-11-24',updated_by:'admin'};
 const rows=mergeConnectorRegister([{kind:'tickets',enabled:0},{kind:'entra',enabled:1}],transport);
 assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.kind)).size,4);
 assert.equal(rows.find(r=>r.kind==='tickets')!.transport,transport);
 assert.equal(rows.find(r=>r.kind==='tickets')!.enabled,0);
 assert.equal(rows.some(r=>r.kind==='jira'),false);
 assert.equal(mergeConnectorRegister([],null).find(r=>r.kind==='tickets')!.transport,null);
});
