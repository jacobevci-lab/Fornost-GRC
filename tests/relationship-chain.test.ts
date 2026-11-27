import test from 'node:test';
import assert from 'node:assert/strict';
import {relationshipStatus,assuranceBranches,chainLinkChoice} from '../app/relationship-chain-model';
import {buildConnectedGrcGraph,type ConnectedGrcRow as Row} from '../app/connected-grc-model';
const row=(id:string,module:string,data:Record<string,unknown>={}):Row=>({id,code:id,module,data});
test('status badges translate states and do not equate pending evidence with approval',()=>{
  for(const [raw,tr,en,tone] of [['Taslak','Taslak','Draft','neutral'],['draft','Taslak','Draft','neutral'],['İncelemede','İncelemede','In Review','warning'],['pending-review','İncelemede','In Review','warning'],['In Review','İncelemede','In Review','warning'],['Reddedildi','Reddedildi','Rejected','warning'],['Bakımda','Bakımda','Maintenance','neutral'],['active','Aktif','Active','positive'],['approved','Onaylandı','Approved','positive'],['effective','Etkin','Effective','positive']]){
    assert.deepEqual(relationshipStatus(row('CTL-001','Kontroller',{status:raw}),'tr'),{label:tr,tone});
    assert.deepEqual(relationshipStatus(row('CTL-001','Kontroller',{status:raw}),'en'),{label:en,tone});
  }
  const approved=row('EVD-001','Kanıtlar',{status:'Onaylandı',expiresAt:'2026-11-26'});
  assert.deepEqual(relationshipStatus(approved,'tr',Date.parse('2026-11-27T00:00:00Z')),{label:'Süresi Doldu',tone:'warning'});
  approved.data={status:'Onaylandı',pendingVersion:{status:'İncelemede'}};
  assert.equal(relationshipStatus(approved,'en').tone,'warning');
  assert.equal(relationshipStatus(row('RSK-001','Risk Assessment',{status:'custom'}),'en').tone,'neutral');
});
test('a risk tree keeps each evidence under its actual control and never walks sibling risks',()=>{
  const risk=row('RSK-001','Risk Assessment',{existingControls:['CTL-001','CTL-002','CTL-003']}),other=row('RSK-002','Risk Assessment',{existingControls:['CTL-001','CTL-004']});
  const controls=[1,2,3,4].map(n=>row(`CTL-00${n}`,'Kontroller'));
  const docs=[1,2,3,4].map(n=>row(`EVD-00${n}`,'Kanıtlar',{controlRefs:[`CTL-00${n}`]}));
  const graph=buildConnectedGrcGraph([risk,other,...controls,...docs]);
  const tree=assuranceBranches(risk,graph.links);
  assert.equal(tree.length,1);assert.equal(tree[0].children.length,3);
  tree[0].children.forEach((ctl,i)=>assert.deepEqual(ctl.children.map(x=>x.row?.id),[docs[i].id]));
  const docTree=assuranceBranches(docs[0],graph.links);
  assert.equal(docTree.length,2);
  for(const r of docTree){assert.deepEqual(r.children.map(x=>x.row?.id),['CTL-001']);assert.deepEqual(r.children[0].children.map(x=>x.row?.id),['EVD-001']);}
});
test('missing edges target the actual writable source and preserve read-only/scoped boundaries',()=>{
  const risk=row('RSK-001','Risk Assessment'),bia=row('BIA-001','BIA'),admin={role:'Admin',email:'admin@example.test'};
  const empty=assuranceBranches(risk,[])[0].children[0];assert.equal(empty.source,risk);assert.equal(empty.module,'Kontroller');
  assert.equal(chainLinkChoice(risk,'Kontroller',admin)?.field,'existingControls');
  assert.equal(chainLinkChoice(bia,'İş Sürekliliği',admin)?.plan,true);
  assert.equal(chainLinkChoice(risk,'Kontroller',{role:'Viewer'}),undefined);
  assert.equal(chainLinkChoice(risk,'Kontroller',{role:'Editor',moduleAccess:{mode:'scoped',modules:{'Risk Assessment':'write',Kontroller:'write'}}}),undefined);
  assert.equal(chainLinkChoice(row('BCP-001','İş Sürekliliği',{kind:'continuity-plan',status:'approved'}),'BIA',admin),undefined);
});
