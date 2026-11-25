import assert from "node:assert/strict";
import test from "node:test";
import { connectionState, ticketConfigError, type Connection } from "../app/integrations/ticketing-config";
import { testTicketConnection } from "../app/integrations/ticketing-test";
import { createTicket } from "../app/integrations/ticketing";
const now = Date.parse("2026-11-11T19:00:00Z");
const row: Connection = {id:"a",provider:"jira",enabled:true,config:{},hasSecret:true,updated_at:"2026-11-11T18:00:00Z"};
const cfg = {baseUrl:"https://jira.example.com",username:"service@example.com",projectKey:"SEC",issueType:"Task"};

test("unknown, empty, paused and stale states do not claim verified access", () => {
 assert.equal(connectionState(undefined,undefined,false,now),"unknown");
 assert.equal(connectionState(undefined,undefined,true,now),"empty");
 assert.equal(connectionState({...row,enabled:false},{status:"success",testedAt:new Date(now).toISOString()},true,now),"paused");
 assert.equal(connectionState(row,undefined,true,now),"untested");
 for(const testedAt of ["bad","2027-01-01T00:00:00Z"])assert.equal(connectionState(row,{status:"success",testedAt},true,now),"untested");
 assert.equal(connectionState(row,{status:"success",testedAt:"2026-11-01T00:00:00Z"},true,now),"stale");
 assert.equal(connectionState(row,{status:"success",testedAt:new Date(now).toISOString()},true,now),"verified");
 assert.equal(connectionState(row,{status:"error"},true,now),"error");
});
test("active configurations require a safe target, required fields and credentials", () => {
 assert.equal(ticketConfigError("jira",cfg,true),"");
 assert.ok(ticketConfigError("jira",cfg,false));
 assert.ok(ticketConfigError("jira",{...cfg,baseUrl:"http://localhost"},true));
 assert.ok(ticketConfigError("jira",{...cfg,projectKey:""},true));
 assert.ok(ticketConfigError("github-issues",{repository:"bad/../../repo"},true));
 assert.equal(ticketConfigError("github-issues",{repository:"org/repo"},true),"");
 assert.equal(ticketConfigError("azure-devops",{organization:"org",project:"proj",workItemType:"Task"},true),"");
});
test("Jira test checks project write permission without posting any work", async () => {
 const calls: {url:string;init?:RequestInit}[]=[];
 const fetcher: typeof fetch = async (url,init) => {calls.push({url:String(url),init});return Response.json(calls.length===1?{accountId:"service"}:{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:true}}});};
 const result=await testTicketConnection("jira",cfg,"synthetic",false,fetcher);
 assert.equal(result.checks.filter(c=>c.status==="passed").length,2);
 assert.ok(result.checks.some(c=>c.status==="limited"));
 assert.ok(calls[0].url.endsWith("/rest/api/3/myself"));
 assert.ok(calls[1].url.includes("projectKey=SEC"));
 assert.ok(calls.every(c=>!c.init?.method));
 assert.ok(calls.every(c=>c.init?.redirect==="error"));
});
test("account access without create permission fails the Jira target check", async () => {
 let count=0;
 await assert.rejects(testTicketConnection("jira",cfg,"synthetic",false,async()=>Response.json(++count===1?{accountId:"service"}:{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:false}}})),/Create Issues/);
});
test("Data Center uses API v2 and PAT, independently of Cloud credentials", async () => {
 const urls:string[]=[];
 const fetcher:typeof fetch=async(url,init)=>{urls.push(String(url));assert.equal(new Headers(init?.headers).get("authorization"),"Bearer synthetic");return Response.json(urls.length===1?{name:"service"}:{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:true}}});};
 await testTicketConnection("jira-dc",cfg,"synthetic",false,fetcher);
 assert.ok(urls.every(u=>u.includes("/rest/api/2/")));
});
test("GitHub checks target repository and does not invent write assurance", async()=>{
 const result=await testTicketConnection("github-issues",{repository:"org/repo"},"synthetic",false,async url=>{assert.equal(String(url),"https://api.github.com/repos/org/repo");return Response.json({has_issues:true,archived:false});});
 assert.equal(result.checks.find(c=>c.name==="write")?.status,"limited");
 await assert.rejects(testTicketConnection("github-issues",{repository:"org/repo"},"synthetic",false,async()=>Response.json({has_issues:false})),/Issues/);
});
test("read tests reject provider errors and malformed responses",async()=>{
 await assert.rejects(testTicketConnection("jira",cfg,"synthetic",false,async()=>new Response("denied",{status:403})),/403/);
 await assert.rejects(testTicketConnection("jira",cfg,"synthetic",false,async()=>new Response("not-json")),/Provider response/);
});
test("webhook check only uses HEAD and does not replay a write",async()=>{
 const result=await testTicketConnection("webhook",{endpoint:"https://hooks.example.com/events"},"synthetic",false,async(_,init)=>{assert.equal(init?.method,"HEAD");return new Response(null,{status:200});});
 assert.equal(result.checks[0].status,"limited");
});
test("ticket creation uses separate Cloud and Data Center payloads and preserves target link",async()=>{
 const original=globalThis.fetch;
 try{
  for(const provider of ["jira","jira-dc"] as const){
   globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),cfg.baseUrl+`/rest/api/${provider==="jira"?3:2}/issue`);
    assert.equal(init?.method,"POST");const body=JSON.parse(String(init?.body));
    assert.equal(typeof body.fields.description,provider==="jira"?"object":"string");
    return Response.json({key:"SEC-101"});
   };
   const ticket=await createTicket(provider,cfg,"synthetic",false,{title:"QA work",description:"QA description"});
   assert.equal(ticket.url,"https://jira.example.com/browse/SEC-101");
  }
 }finally{globalThis.fetch=original;}
});

test('ServiceNow and Azure DevOps return navigable target-specific work item links', async () => {
 const original = globalThis.fetch;
 try {
  globalThis.fetch = async () => Response.json({ result: { sys_id: 'sys-123', number: 'TASK001' } });
  const sn = await createTicket('servicenow', { baseUrl: 'https://example.service-now.com', table: 'sc_task', username: 'qa' }, 'synthetic-key', false, { title: 'QA' });
  assert.equal(sn.id, 'TASK001'); assert.equal(new URL(sn.url).searchParams.get('uri'), 'sc_task.do?sys_id=sys-123');
  globalThis.fetch = async () => Response.json({ id: 42 });
  const az = await createTicket('azure-devops', { organization: 'qa-org', project: 'Security Work' }, 'synthetic-key', false, { title: 'QA' });
  assert.equal(az.url, 'https://dev.azure.com/qa-org/Security%20Work/_workitems/edit/42');
 } finally { globalThis.fetch = original; }
});
