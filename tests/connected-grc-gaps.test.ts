import test from 'node:test';
import assert from 'node:assert/strict';
import { filterConnectedGrcGaps } from '../app/connected-grc-gaps';
import type { ConnectedGrcCoverageGap, UnresolvedGrcReference } from '../app/connected-grc-model';
const row={id:'internal-1',code:'RSK-001',module:'Risk Assessment',data:{title:'İŞ SÜREKLİLİĞİ'}};
const gap:ConnectedGrcCoverageGap={row,rule:'risk-context',severity:'high',expectedRelations:['asset'],missingRelations:['asset'],matchedRelations:[],percent:0};
const refs:UnresolvedGrcReference[]=[{source:row,field:'assetRef',value:'ASSET-MISSING',relation:'asset',reason:'missing',candidates:[]},{source:{...row,id:'two',module:'Kontroller'},field:'controlRef',value:'duplicate-code',relation:'control',reason:'ambiguous',candidates:[{id:'candidate-1',code:'CTL-ABC',module:'Kontroller',data:{title:'Candidate control'}}]}];
const opts={query:'',module:'all',lang:'en' as const,moduleLabel:(name:string)=>name==='Kontroller'?'Control Library':name};
test('gap search includes internal IDs, codes, reference values and ambiguous candidates',()=>{
 for(const query of ['internal-1','RSK-001'])assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,query}).gaps.length,1);
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,query:'ASSET-MISSING'}).unresolved.length,1);
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,query:'CTL-ABC'}).unresolved[0].reason,'ambiguous');
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,query:'Candidate control'}).unresolved.length,1);
});
test('module filtering applies to source records, independently of candidate modules',()=>{
 const result=filterConnectedGrcGaps([gap],refs,{...opts,module:'Kontroller'});
 assert.equal(result.gaps.length,0);assert.equal(result.unresolved.length,1);
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,query:'Control Library'}).unresolved.length,1);
});
test('Turkish folding and empty search preserve authoritative input and order',()=>{
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,query:'iş sürekliliği',lang:'tr'}).gaps.length,1);
 const result=filterConnectedGrcGaps([gap],refs,{...opts,query:'   '});
 assert.deepEqual(result.gaps,[gap]);assert.deepEqual(result.unresolved,refs);
 assert.equal(result.gaps[0],gap);
});
test('search reaches references beyond the initial render budget and never changes coverage',()=>{
 const many=Array.from({length:83},(_,i)=>({...refs[0],value:`target-${i}`}));
 const result=filterConnectedGrcGaps([gap],many,{...opts,query:'target-82'});
 assert.equal(result.unresolved.length,1);assert.equal(result.unresolved[0].value,'target-82');
 assert.equal(result.gaps.length,0);assert.equal(gap.percent,0);assert.equal(many.length,83);
});
test('issue categories combine with source and search without inventing severity for unresolved references',()=>{
 const medium={...gap,severity:'medium' as const};
 for(const type of ['high','medium'] as const){
  const result=filterConnectedGrcGaps([gap,medium],refs,{...opts,type});
  assert.equal(result.gaps.length,1);assert.equal(result.gaps[0].severity,type);assert.equal(result.unresolved.length,0);
 }
 for(const type of ['missing','ambiguous'] as const){
  const result=filterConnectedGrcGaps([gap,medium],refs,{...opts,type});
  assert.equal(result.gaps.length,0);assert.equal(result.unresolved.length,1);assert.equal(result.unresolved[0].reason,type);
 }
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,type:'ambiguous',module:'Kontroller',query:'CTL-ABC'}).unresolved.length,1);
 assert.equal(filterConnectedGrcGaps([gap],refs,{...opts,type:'missing',module:'Kontroller'}).unresolved.length,0);
});
