import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDraftTemplate, builtInDraftTemplates, exportDraftTemplate, parseDraftTemplate } from '../app/audit-draft-templates';

test('all bilingual built-in templates satisfy their strict kind and field bounds', () => {
  for (const kind of ['plan','milestone'] as const) for (const tr of [true,false]) {
    for (const template of builtInDraftTemplates(kind,tr)) assert.deepEqual(parseDraftTemplate(JSON.stringify(template),kind), template);
  }
});
test('template export omits audit identity, people, dates, states and approvals', () => {
  const draft = {title:'Test',description:'Review <script> literally',owner:'person@example.com',dueDate:'2026-11-01',timeZone:'UTC',status:'completed',auditId:'private',revision:'revision'};
  const template = parseDraftTemplate(exportDraftTemplate('milestone','Reusable',draft),'milestone');
  assert.deepEqual(template.fields,{title:draft.title,description:draft.description});
  const result = applyDraftTemplate(draft,{...template,fields:{title:'New title',description:'New description'}},['description']);
  assert.deepEqual(result,{...draft,description:'New description'});
  assert.equal(draft.description,'Review <script> literally');
});
test('wrong kind, versions, unknown fields and oversized values reject as a whole', () => {
  const valid={version:1,kind:'milestone',name:'Reusable',fields:{title:'Allowed'}};
  for (const value of [null,[],{...valid,version:2},{...valid,kind:'plan'},{...valid,name:''},{...valid,fields:{}},{...valid,fields:{title:'Allowed',owner:'other'}},{...valid,fields:{title:'x'.repeat(201)}},{...valid,fields:{description:3}},{...valid,auditId:'private'}]) {
    assert.throws(()=>parseDraftTemplate(JSON.stringify(value),'milestone'),/invalid/);
  }
  assert.throws(()=>parseDraftTemplate('x'.repeat(50001),'plan'),/invalid/);
  assert.throws(()=>parseDraftTemplate('{','plan'),/invalid/);
});
test('plan templates preserve dates, assignments and unselected draft text, including partial dates', () => {
  const draft={objective:'Local objective',scope:'Local scope',lead:'Lead',team:'Team',periodStart:'2026-11-01',periodEnd:''};
  const template=builtInDraftTemplates('plan',false)[0];
  const result=applyDraftTemplate(draft,template,['objective']);
  assert.deepEqual(result,{...draft,objective:template.fields.objective});
  assert.throws(()=>applyDraftTemplate(draft,template,['lead']),/invalid/);
  assert.throws(()=>applyDraftTemplate(draft,template,[]),/invalid/);
});
