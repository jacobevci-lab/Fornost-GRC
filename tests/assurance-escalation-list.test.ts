import assert from "node:assert/strict";
import test from "node:test";
import { escalationListPage,canAcknowledgeEscalation } from "../app/assurance-escalation-list";
const records=Array.from({length:65},(_,index)=>({id:`E-${index+1}`,status:index===64?"resolved":"active",severity:index===1?"critical":"high",kind:"risk-review",title:`Risk ${index+1}`,detail:"Review required",owner:index===50?"İREM":"owner",subjectRef:`RSK-${index+1}`}));
test("all returned escalations remain reachable beyond the old 40 record cutoff",()=>{
 const ids=new Set<string>();
 for(let page=1;page<=4;page++)for(const row of escalationListPage(records,"all","",page,"en").rows)ids.add(row.id);
 assert.equal(ids.size,65);
 const last=escalationListPage(records,"all","",100,"en");
 assert.equal(last.page,4);assert.equal(last.start,61);assert.equal(last.end,65);
});
test("search covers the full filtered dataset and handles Turkish owner names",()=>{
 const match=escalationListPage(records,"open","irem",4,"tr");
 assert.equal(match.total,1);assert.equal(match.page,1);assert.equal(match.rows[0].id,"E-51");
 assert.equal(escalationListPage(records,"open","RSK-65",1,"en").total,0);
 assert.equal(escalationListPage(records,"all","RSK-65",1,"en").total,1);
 assert.equal(escalationListPage(records,"critical","",1,"en").rows[0].id,"E-2");
});
test("empty results and invalid page inputs produce usable page boundaries",()=>{
 const empty=escalationListPage([],"all","",NaN,"en");
 assert.deepEqual([empty.page,empty.pages,empty.start,empty.end],[1,1,0,0]);
 assert.equal(escalationListPage(records,"all","",-5,"en").page,1);
});
test("follow-up permissions fail closed and enforce trimmed note limits",()=>{
 for(const role of ["Viewer","Auditor","unknown",""])assert.equal(canAcknowledgeEscalation(role,"active","Valid follow-up note"),false);
 for(const role of ["Admin","Editor"]){
  assert.equal(canAcknowledgeEscalation(role,"active","Valid follow-up note"),true);
  assert.equal(canAcknowledgeEscalation(role,"resolved","Valid follow-up note"),false);
  assert.equal(canAcknowledgeEscalation(role,"active","   short   "),false);
  assert.equal(canAcknowledgeEscalation(role,"active","x".repeat(1201)),false);
 }
});
