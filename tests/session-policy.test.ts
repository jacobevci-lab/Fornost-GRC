import assert from "node:assert/strict";
import test from "node:test";
import { sessionExpired, sessionTimeoutMinutes } from "../app/session-policy";
const start="2026-10-04T10:00:00Z", now=Date.parse(start), expiry="2026-10-04T18:00:00Z";
test("session lifetime defaults for fresh and legacy installations, honors bounds",()=>{
  for(const value of [null,undefined,"{}",'{"organizationName":"Company"}'])assert.equal(sessionTimeoutMinutes(value),30);
  for(const minutes of [5,30,720])for(const value of [minutes,String(minutes)])assert.equal(sessionTimeoutMinutes(JSON.stringify({sessionTimeoutMinutes:value})),minutes);
});
test("corrupt policy falls to the minimum lifetime rather than extending access",()=>{
  for(const value of ['{','null','[]','"30"',...[-1,4,721,30.5,true,null,{},"eight"].map(sessionTimeoutMinutes=>JSON.stringify({sessionTimeoutMinutes}))])assert.equal(sessionTimeoutMinutes(value),5);
});
test("policy is absolute and expires precisely at the boundary",()=>{
  assert.equal(sessionExpired(start,expiry,30,now+30*60000-1),false);
  assert.equal(sessionExpired(start,expiry,30,now+30*60000),true);
});
test("shortening affects existing sessions but increasing never extends issued expiry",()=>{
  assert.equal(sessionExpired(start,expiry,5,now+6*60000),true);
  assert.equal(sessionExpired(start,"2026-10-04T10:30:00Z",720,now+31*60000),true);
});
test("malformed, future or inconsistent session timestamps fail closed",()=>{
  for(const [created,expires] of [["bad",expiry],[start,"bad"],[expiry,start],[expiry,"2026-10-05T10:00:00Z"],[start,start]])assert.equal(sessionExpired(created,expires,30,now),true);
  assert.equal(sessionExpired(start,expiry,NaN,now),true);
});
