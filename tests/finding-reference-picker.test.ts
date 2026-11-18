import assert from 'node:assert/strict';
import test from 'node:test';
import { findingTargets, matchingFindingTargets, savedFindingTarget } from '../app/findings/record-references';

const rows = [
  {id:'risk-id',code:'RSK-001',module:'Risk Assessment',data:{title:'Yetki kaybı'}},
  {id:'control-id',code:'CTL-001',module:'Kontroller',data:{controlTitle:'İzin incelemesi',controlRef:'A.5.18',owner:'Emre'}},
  {id:'clause-id',code:'CMP-002',module:'Uyum',data:{controlTitle:'İzin incelemesi',controlRef:'A.5.18'}},
  {id:'asset-id',code:'AST-003',module:'Varlık Envanteri',data:{title:'İzin incelemesi'}},
];

test('title, Turkish case, clause, owner and code find only valid target modules',()=>{
  const controls=findingTargets(rows,'controlRef');
  for(const query of ['İZİN','izin','A.5.18']) assert.deepEqual(matchingFindingTargets(controls,query).map(r=>r.id),['control-id','clause-id']);
  assert.equal(matchingFindingTargets(controls,'emre')[0]?.id,'control-id');
  assert.equal(matchingFindingTargets(controls,'cmp-002')[0]?.id,'clause-id');
  assert.equal(matchingFindingTargets(findingTargets(rows,'riskRef'),'yetki')[0]?.id,'risk-id');
  assert.equal(matchingFindingTargets(controls,'RSK-001').length,0);
});

test('saved IDs and old public codes resolve exactly; free text, foreign and ambiguous identities do not open records',()=>{
  const controls=findingTargets(rows,'controlRef');
  assert.equal(savedFindingTarget(controls,'clause-id')?.module,'Uyum');
  assert.equal(savedFindingTarget(controls,' ctl-001 ')?.id,'control-id');
  for(const value of ['A.5.18','İzin incelemesi','risk-id','CTL-00','deleted']) assert.equal(savedFindingTarget(controls,value),undefined);
  assert.equal(savedFindingTarget([...controls,{...controls[1],code:controls[0].code}],controls[0].code),undefined);
});
