import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedGrcGapExport } from '../app/connected-grc-export';
import { filterConnectedGrcGaps } from '../app/connected-grc-gaps';
import type { ConnectedGrcCoverageGap, UnresolvedGrcReference } from '../app/connected-grc-model';
const scope={ready:8,total:8,loading:false,generatedAt:'2026-10-07T20:00:00Z'};
const filters={query:'',module:'all',type:'all' as const};
const row={id:'canonical-1',code:'RISK-1',module:'Risk Assessment',data:{title:'Risk one'}};
const gap:ConnectedGrcCoverageGap={row,rule:'risk-context',severity:'high',expectedRelations:['asset'],missingRelations:['asset'],matchedRelations:[],percent:0};
const ref:UnresolvedGrcReference={source:row,field:'assetRef',value:'duplicate',relation:'asset',reason:'ambiguous',candidates:[{...row,id:'candidate-1',code:'ASSET-1',module:'Varlık Envanteri'}]};
test('gap export blocks loading and labels partial source coverage even with zero matches',()=>{
 assert.equal(connectedGrcGapExport([gap],[ref],{...scope,loading:true},filters),null);
 const result=connectedGrcGapExport([],[],{...scope,ready:7},{...filters,query:'no match'})!;
 assert.equal(result.filename,'fornost-connected-grc-gaps-partial.csv');
 assert.match(result.content,/"partial";"7";"8"/);
 assert.match(result.content,/"no match";"all";"all";"0"/);
 assert.equal(result.content.split('\n').length,2);
});
test('gap export retains exact IDs, rule, reference fields and ambiguous candidate identities',()=>{
 const result=connectedGrcGapExport([gap],[ref],scope,filters)!;
 assert.match(result.content,/"connection-gap";"high";"Risk Assessment";"canonical-1";"RISK-1"/);
 assert.match(result.content,/"risk-context";"asset"/);
 assert.match(result.content,/"ambiguous";""/);
 assert.match(result.content,/"assetRef";"duplicate"/);
 assert.ok(result.content.includes('""id"":""candidate-1""'));
 assert.equal(result.filename,'fornost-connected-grc-gaps.csv');
 assert.equal(result.content.split('\n').length,3);
});
test('export includes every filtered reference beyond render limits and records filters',()=>{
 const refs=Array.from({length:83},(_,i)=>({...ref,value:`target-${i}`}));
 const selected=filterConnectedGrcGaps([gap],refs,{...filters,type:'ambiguous',lang:'en',moduleLabel:n=>n});
 const result=connectedGrcGapExport(selected.gaps,selected.unresolved,scope,{...filters,type:'ambiguous'})!;
 assert.equal(result.content.split('\n').length,84);assert.match(result.content,/target-82/);
 assert.match(result.content,/"all";"ambiguous";"83"/);
 assert.ok(!result.content.includes('"connection-gap";'));
});
test('all spreadsheet cells including references and filters neutralize formulas and quote delimiters',()=>{
 const result=connectedGrcGapExport([{...gap,row:{...row,code:'=SUM(1)',data:{title:'line;"quote"\nnext'}}}],[{...ref,value:' \t@formula'}],scope,{...filters,query:'+formula'})!;
 assert.ok(result.content.startsWith('\uFEFF'));
 assert.ok(result.content.includes('"\'=SUM(1)"'));
 assert.ok(result.content.includes('"\' \t@formula"'));
 assert.ok(result.content.includes('"\'+formula"'));
 assert.ok(result.content.includes('"line;""quote""\nnext"'));
});
