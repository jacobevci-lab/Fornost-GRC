import assert from "node:assert/strict";
import test from "node:test";
import { isSessionRevocationEvent, sessionRevocationTarget } from "../app/user-session-actions";
test("session revocation accepts one bounded explicit target",()=>{
 for(const userId of ["bootstrap-admin","demo-editor","ae239fc4-acc7-4b63-9042-123456789012"])assert.equal(sessionRevocationTarget({userId}),userId);
 for(const body of [{},{userId:""},{userId:"all" ,all:true},{userId:[]},{userId:"x".repeat(101)},{userId:"../admin"},{userId:"a' OR 1=1"},{userId:" admin "}])assert.equal(sessionRevocationTarget(body),null);
});
test("audit display distinguishes session revocation and tolerates old or corrupt events",()=>{
 assert.equal(isSessionRevocationEvent('{"operation":"revoke-local-sessions"}'),true);
 for(const value of [undefined,'{','null','{"role":"Editor"}','[]'])assert.equal(isSessionRevocationEvent(value),false);
});
