import assert from "node:assert/strict";
import test from "node:test";
import {validDirectory,modulePermission,scopeLabel,accountEvent,type LocalUser} from "../app/identity-access-model";
const user:LocalUser={id:"u",name:"User",email:"u@example.test",revision:"r",own:false,lastAdmin:false,role:"Viewer",status:"Active",moduleAccess:{mode:"scoped",modules:{BIA:"write"}}};
test("directory validation fails closed for malformed permissions and missing protection flags",()=>{
 assert.equal(validDirectory({users:[user],events:[]}),true);
 for(const patch of [{own:undefined},{lastAdmin:"false"},{role:"Owner"},{moduleAccess:{mode:"scoped",modules:{unknown:"write"}}}])assert.equal(validDirectory({users:[{...user,...patch}],events:[]}),false);
 assert.equal(validDirectory({users:[],events:undefined}),false);
 assert.equal(validDirectory({users:[],events:[{}]}),false);
});
test("permission summaries apply the role ceiling and scoped boundary",()=>{
 assert.equal(modulePermission(user,"BIA","en"),"Read");
 assert.equal(modulePermission({...user,role:"Editor"},"BIA","en"),"Read and edit");
 assert.equal(modulePermission(user,"Kontroller","en"),"No access");
 assert.equal(scopeLabel(user,"tr"),"1 modül");
 assert.equal(scopeLabel({...user,role:"Admin"},"en"),"Full workspace");
});
test("history distinguishes deleted accounts and local session revocation without parsing failures",()=>{
 assert.equal(accountEvent('{"operation":"delete-local-account"}',"en"),"Local account deleted");
 assert.equal(accountEvent('{"operation":"revoke-local-sessions"}',"en"),"Local sessions ended");
 assert.equal(accountEvent('invalid',"en"),"Account access updated");
});
