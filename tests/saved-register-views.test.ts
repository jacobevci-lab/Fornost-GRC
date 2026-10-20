import test from 'node:test';
import assert from 'node:assert/strict';
import { changeSavedViews, parseSavedViews, persistSavedViews, savedViewsKey, validateViewState, type SavedViewState } from '../app/saved-register-views';
const schema = { filters: ['owner', 'status'], columns: ['title', 'owner', 'status'] }, state: SavedViewState = { query: 'payment', filters: { owner: 'Finance', status: '' }, columns: ['title', 'owner'] };
const encode = (views: ReturnType<typeof parseSavedViews>) => JSON.stringify({ version: 1, views });
const create = () => changeSavedViews(null, { action: 'create', id: 'v1', name: ' My risks ', state }, schema);
test('named views preserve query, exact filters and ordered columns without record rows', () => {
 const rows = create(); assert.equal(rows[0].name, 'My risks'); assert.deepEqual(rows[0].filters, { owner: 'Finance' });
 assert.deepEqual(parseSavedViews(encode(rows)), rows); assert.deepEqual(Object.keys(rows[0]).sort(), ['columns','filters','id','name','query','updatedAt']);
 assert.deepEqual(validateViewState(rows[0],schema), {...state,filters:{owner:'Finance'}});
});
test('rename preserves criteria; replace changes them; delete removes only the selected view', () => {
 let rows=create(); rows=changeSavedViews(encode(rows), {action:'rename',id:'v1',name:'Renamed',expectedItem:JSON.stringify(rows[0])},schema);assert.equal(rows[0].query,'payment');
 rows=changeSavedViews(encode(rows),{action:'replace',id:'v1',name:'Renamed',expectedItem:JSON.stringify(rows[0]),state:{query:'new',filters:{status:'Open'},columns:['status']}},schema);assert.deepEqual(rows[0].columns,['status']);
 rows=changeSavedViews(encode(rows),{action:'create',id:'v2',name:'Second',state},schema);
 rows=changeSavedViews(encode(rows),{action:'delete',id:'v1',expectedItem:JSON.stringify(rows[0])},schema);assert.equal(rows.length,1);assert.equal(rows[0].id,'v2');
});
test('user and module keys are isolated, including delimiter collisions',()=>{
 const keys=[savedViewsKey('a','Risk'),savedViewsKey('b','Risk'),savedViewsKey('a','BIA'),savedViewsKey('a:b','c'),savedViewsKey('a','b:c')];assert.equal(new Set(keys).size,5);
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};
 persistSavedViews(storage,keys[0],null,{action:'create',id:'v1',name:'Personal',state},schema);
 for(const key of keys.slice(1))assert.deepEqual(parseSavedViews(storage.getItem(key)),[]);
});
test('stale tab or selected item cannot replace, rename or delete newer values',()=>{
 const raw=encode(create()), newer=encode(changeSavedViews(raw,{action:'create',id:'v2',name:'Second',state},schema));let writes=0;
 assert.throws(()=>persistSavedViews({getItem:()=>newer,setItem:()=>{writes++;}},'key',raw,{action:'create',id:'v3',name:'Third',state},schema),/conflict/);assert.equal(writes,0);
 for(const action of ['replace','rename','delete'] as const)assert.throws(()=>changeSavedViews(raw,{action,id:'v1',name:'Overwrite',state,expectedItem:'old'},schema),/conflict/);
});
test('duplicate normalized names and limits are rejected without dropping existing views',()=>{
 let rows=create();assert.throws(()=>changeSavedViews(encode(rows),{action:'create',id:'v2',name:'ｍｙ risks',state},schema),/duplicate/);
 for(let i=2;i<=10;i++)rows=changeSavedViews(encode(rows),{action:'create',id:`v${i}`,name:`View ${i}`,state},schema);
 assert.throws(()=>changeSavedViews(encode(rows),{action:'create',id:'v11',name:'Overflow',state},schema),/limit/);assert.equal(rows.length,10);
 for(const name of ['',' '.repeat(4),'x'.repeat(61)])assert.throws(()=>changeSavedViews(null,{action:'create',id:'new',name,state},schema),/name/);
});
test('malformed storage and obsolete schema fail explicitly; no partial criteria silently apply',()=>{
 for(const raw of ['{','null','{}','x'.repeat(250001),JSON.stringify({version:2,views:[]}),encode([...create(),...create()])])assert.throws(()=>parseSavedViews(raw),/invalid/);
 for(const invalid of [{...state,columns:[]},{...state,columns:['title','title']},{...state,query:'x'.repeat(1001)},{...state,filters:JSON.parse('{"__proto__":"bad"}') }])assert.throws(()=>validateViewState(invalid,schema),/invalid/);
 assert.throws(()=>validateViewState({...state,columns:['removed']},schema),/schema/);
 assert.throws(()=>validateViewState({...state,filters:{deleted:'value'}},schema),/schema/);
});
test('storage access or quota failures propagate, never report a successful save',()=>{
 assert.throws(()=>persistSavedViews({getItem:()=>{throw Error('blocked');},setItem:()=>{}},'key',null,{action:'create',id:'v1',name:'View',state},schema),/blocked/);
 assert.throws(()=>persistSavedViews({getItem:()=>null,setItem:()=>{throw Error('quota');}},'key',null,{action:'create',id:'v1',name:'View',state},schema),/quota/);
});
