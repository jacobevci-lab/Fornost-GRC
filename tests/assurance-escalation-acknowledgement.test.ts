import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {acknowledgeAssuranceEscalation} from "../app/assurance-escalation-store";
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE continuous_assurance_escalations(id TEXT PRIMARY KEY,status TEXT,last_seen_at TEXT,acknowledged_by TEXT,acknowledged_at TEXT,ack_note TEXT); INSERT INTO continuous_assurance_escalations(id,status,last_seen_at) VALUES('E-1','active','observed')");
 const db={prepare:(sql:string)=>({bind:(...values:unknown[])=>({run:async()=>{const result=sqlite.prepare(sql).run(...values as (string|number|null)[]);return {success:true,meta:{changes:Number(result.changes)}};}})})} as unknown as D1Database;
 return {sqlite,db};
}
const input={id:"E-1",expectedLastSeenAt:"observed",actor:"first@example.test",note:"Follow up with owner",stamp:"new"};
test("two acknowledgements of one observed row produce exactly one winner",async()=>{
 const {sqlite,db}=fixture();try{
  const results=await Promise.all([acknowledgeAssuranceEscalation(db,input),acknowledgeAssuranceEscalation(db,{...input,actor:"second@example.test",note:"Conflicting follow-up"})]);
  assert.deepEqual(results,[true,false]);
  const row=sqlite.prepare("SELECT status,acknowledged_by,ack_note FROM continuous_assurance_escalations").get();
  assert.equal(row?.acknowledged_by,input.actor);assert.equal(row?.ack_note,input.note);assert.equal(row?.status,"acknowledged");
 }finally{sqlite.close();}
});
test("resolved, refreshed and reactivated records reject a stale acknowledgement",async()=>{
 for(const [status,stamp] of [["resolved","observed"],["active","new-signal"]]){
  const {sqlite,db}=fixture();try{
   sqlite.prepare("UPDATE continuous_assurance_escalations SET status=?,last_seen_at=?").run(status,stamp);
   assert.equal(await acknowledgeAssuranceEscalation(db,input),false);
   assert.equal(sqlite.prepare("SELECT ack_note FROM continuous_assurance_escalations").get()?.ack_note,null);
  }finally{sqlite.close();}
 }
});
test("missing database confirmation cannot be reported as success",async()=>{
 const db={prepare:()=>({bind:()=>({run:async()=>({success:true,meta:{}})})})} as unknown as D1Database;
 assert.equal(await acknowledgeAssuranceEscalation(db,input),false);
});
