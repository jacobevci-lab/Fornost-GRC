import test from 'node:test';
import assert from 'node:assert/strict';
import { completedInitialization } from '../app/completed-initialization';

test('only successfully completed initialization is cached and each binding is independent',async()=>{
 const initialize=completedInitialization(),one={},two={};let calls=0;
 const run=async()=>{calls++;};
 await initialize(one,run);await initialize(one,run);await initialize(two,run);
 assert.equal(calls,2);
});
test('an unfinished request never holds another request behind its pending promise',async()=>{
 const initialize=completedInitialization(),binding={};
 let release!:()=>void,secondRan=false;
 const first=initialize(binding,()=>new Promise<void>(resolve=>{release=resolve;}));
 await initialize(binding,async()=>{secondRan=true;});
 assert.equal(secondRan,true);
 release();await first;
 await initialize(binding,async()=>assert.fail('completed binding must not repeat I/O'));
});
test('failed initialization is retried and a late failure cannot clear another request success',async()=>{
 const initialize=completedInitialization(),binding={};const failure=new Error('database unavailable');
 await assert.rejects(initialize(binding,async()=>{throw failure;}),error=>error===failure);
 let reject!: (error:Error)=>void;
 const pending=initialize(binding,()=>new Promise<void>((_,no)=>{reject=no;}));
 const rejected=assert.rejects(pending,error=>error===failure);
 await initialize(binding,async()=>{});
 reject(failure);await rejected;
 await initialize(binding,async()=>assert.fail('late failure must not reset completed metadata'));
});
