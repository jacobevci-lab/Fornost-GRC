import test from 'node:test';
import type { FornostNavigationRequest } from '../app/navigation-focus';
import assert from 'node:assert/strict';
import { resolveAiRecordFocus, aiRecordViews, validAiCollection } from '../app/ai-record-navigation';
import { connectedGrcNavigation } from '../app/connected-grc-navigation';
import { buildConnectedGrcEnterpriseRows } from '../app/connected-grc-sources';

test('each native AI projection navigates with its immutable ID and correct specialist view',()=>{
 const rows=buildConnectedGrcEnterpriseRows({aiModels:{models:[{id:'AIM-native',systemName:'Same title'}]},aiAlerts:{alerts:[{id:'AIA-native',title:'Same title'}]},aiFindings:{findings:[{id:'AIF-native',title:'Same title'}]}});
 for(const row of rows){
  const target=connectedGrcNavigation(row)!;
  assert.equal(target.ref,(row.data.canonicalRefs as string[])[0]);
  const focus=resolveAiRecordFocus({...target,source:'connected-grc-register',filter:{recordRef:target.ref}})!;
  assert.equal(focus.kind,row.data.kind);
  assert.ok(['models','assurance-alerts','findings'].includes(aiRecordViews[focus.kind]));
 }
});
test('AI focus rejects unsupported kinds, mismatched filters, sources, modules and invalid IDs',()=>{
 const request={module:'AI Yönetişimi',source:'connected-grc-register',kind:'ai-model',ref:'AIM-1',filter:{recordRef:'AIM-1'}};
 assert.deepEqual(resolveAiRecordFocus(request),{kind:'ai-model',ref:'AIM-1'});
 const changes:Partial<FornostNavigationRequest>[]=[{kind:'__proto__'},{kind:'governance'},{module:'Risk Assessment'},{source:'unknown'},{filter:{}},{filter:{recordRef:'different'}},{ref:''},{ref:'x'.repeat(101)}];
 for(const change of changes)assert.equal(resolveAiRecordFocus({...request,...change}),null);
 assert.equal(resolveAiRecordFocus(null),null);
});
test('AI navigation never substitutes display titles, projection IDs or ambiguous canonical identities',()=>{
 const row={module:'AI Yönetişimi',id:'enterprise:ai-model:AIM-1',code:'DISPLAY',data:{kind:'ai-model',title:'Title'}};
 assert.equal(connectedGrcNavigation(row),undefined);
 assert.equal(connectedGrcNavigation({...row,data:{...row.data,canonicalRefs:['AIM-1','AIM-2']}}),undefined);
});
test('malformed and duplicate AI collections fail closed while empty lists are valid',()=>{
 assert.equal(validAiCollection([]),true);
 assert.equal(validAiCollection([{id:'AIM-1'}]),true);
 for(const value of [null,{},[null],[[]],[{id:''}],[{id:1}],[{id:'a'},{id:'a'}]])assert.equal(validAiCollection(value),false);
});
