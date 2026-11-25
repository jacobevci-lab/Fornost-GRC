import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRegisterRows, sortViewItems, sortValue, type ViewSort } from '../app/register-sort';
import { validateViewState, changeSavedViews, parseSavedViews } from '../app/saved-register-views';
import { registerViewSchema } from '../app/register-view-schema';
import { accountViewState } from '../app/account-views';
import { readWorkView } from '../app/work-queue-views';
import { readRegisterView, writeRegisterView, registerViewKey } from '../app/register-view';

const row = (id: string, data: Record<string, unknown>) => ({ id, data });
test('risk sorting uses assessed numeric scores, including CIA impact; unknown scores stay last both ways', () => {
  const rows = [row('unknown', {title:'Unknown'}), row('ten', {inherentLikelihood:2,inherentImpact:5}), row('two', {inherentLikelihood:2,inherentImpact:1}), row('cia', {inherentLikelihood:4,inherentImpact:1,confidentialityImpact:5})];
  assert.deepEqual(sortRegisterRows(rows,'Risk Assessment',{key:'inherentRisk',direction:'desc'},'en').map(r=>r.id),['cia','ten','two','unknown']);
  assert.deepEqual(sortRegisterRows(rows,'Risk Assessment',{key:'inherentRisk',direction:'asc'},'en').map(r=>r.id),['two','ten','cia','unknown']);
  assert.equal(rows[0].id,'unknown');
});
test('dates reject impossible values and sort the entire collection before a page is taken', () => {
  const rows = [row('empty',{}), row('invalid',{dueDate:'2026-02-31'}), ...Array.from({length:60},(_,i)=>row(String(i).padStart(3,'0'),{dueDate:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10)}))];
  const sorted = sortRegisterRows(rows,'Denetim Yönetimi',{key:'dueDate',direction:'desc'},'tr');
  assert.equal(sorted[0].id,'059'); assert.equal(sorted.slice(0,50).at(-1)?.id,'010');
  assert.deepEqual(sorted.slice(-2).map(r=>r.id),['empty','invalid']);
  for(const value of ['',null,{},'invalid','2026-02-29','2026-13-01'])assert.equal(sortValue(value,'date'),null);
});
test('text is locale aware and naturally ordered, with stable identity ties and legacy/default order', () => {
  const rows = [row('z',{process:'Service 10'}),row('b',{process:'Service 2'}),row('a',{process:'Service 2'})];
  assert.deepEqual(sortRegisterRows(rows,'BIA',{key:'title',direction:'asc'},'en').map(r=>r.id),['a','b','z']);
  assert.equal(sortRegisterRows(rows,'BIA',undefined,'en'),rows);
  assert.equal(sortRegisterRows(rows,'BIA',{key:'unsupported',direction:'asc'},'en'),rows);
  const numeric=[row('ten',{rto:'10'}),row('two',{rto:'2'}),row('none',{rto:''})];
  assert.deepEqual(sortRegisterRows(numeric,'BIA',{key:'rto',direction:'asc'},'en').map(r=>r.id),['two','ten','none']);
});
test('local and account schemas retain supported sorts and reject malformed or cross-module keys atomically', () => {
  const state={query:'review',filters:{owner:'Finance'},columns:['title'],sort:{key:'inherentRisk',direction:'desc'} as ViewSort};
  const schema=registerViewSchema('Risk Assessment');
  const saved=changeSavedViews(null,{action:'create',id:'view',name:'Risk priority',state},schema);
  assert.deepEqual(parseSavedViews(JSON.stringify({version:1,views:saved}))[0].sort,state.sort);
  assert.deepEqual(accountViewState('Risk Assessment',state),state);
  assert.throws(()=>accountViewState('BIA',state),/schema/);
  for(const sort of [null,[],{},'title',{key:'title',direction:'sideways'},{key:'__proto__',direction:'asc'},{key:'title',direction:'asc',scope:'organization'}]){
    assert.throws(()=>validateViewState({...state,sort},schema));
    assert.throws(()=>accountViewState('Risk Assessment',{...state,sort}),/schema/);
  }
  const {sort:_,...legacy}=state;void _;assert.deepEqual(accountViewState('Risk Assessment',legacy),legacy);
});
test('session order is per user/module and survives filter updates, while work views never carry ownership scope', () => {
  const values=new Map<string,string>(), storage=()=>({getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}});
  const key=registerViewKey('alice','Risk Assessment'), view={query:'',filters:{},sort:{key:'inherentRisk',direction:'desc'} as ViewSort};
  writeRegisterView(storage,key,view);writeRegisterView(storage,key,{...readRegisterView(storage,key),query:'Finance'});
  assert.deepEqual(readRegisterView(storage,key).sort,view.sort);
  assert.equal(readRegisterView(storage,registerViewKey('bob','Risk Assessment')).sort,undefined);
  assert.equal(readRegisterView(storage,registerViewKey('alice','BIA')).sort,undefined);
  const work=readWorkView({query:'',filters:{status:'all'},columns:['title'],sort:{key:'due',direction:'asc'}},[]);
  assert.deepEqual(work,{query:'',module:'',status:'all',sort:{key:'due',direction:'asc'}});assert.equal(Object.hasOwn(work,'scope'),false);
  const tasks=[{id:'later',due:20},{id:'missing',due:null},{id:'earlier',due:10}];
  assert.deepEqual(sortViewItems(tasks,work.sort,'en',task=>task.due,task=>task.id).map(task=>task.id),['earlier','later','missing']);
});
