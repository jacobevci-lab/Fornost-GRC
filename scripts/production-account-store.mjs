import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const testNames=['Entra QA lead','Entra QA reviewer','Test','Fornost Production Smoke Test'];
export async function query(batch){
 const token=process.env.INPUT_TOKEN||process.env.CLOUDFLARE_API_TOKEN,account=process.env.INPUT_ACCOUNT||process.env.CLOUDFLARE_ACCOUNT_ID;
 assert(token&&/^[a-f0-9]{32}$/.test(account||''),'Production D1 credentials are required');
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/e5c14f0d-9251-4e4c-91ec-7f8b2a1c77e4/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({batch}),signal:AbortSignal.timeout(30000)});
 const body=await response.json();assert(response.ok&&body.success&&body.result.every(r=>r.success!==false),`Production D1 operation failed (${response.status}); no credential or SQL payload is logged.`);return body.result;
}
export const realAdmin=`EXISTS(SELECT 1 FROM local_users a WHERE a.role='Admin' AND a.status='Active' AND a.name NOT IN (SELECT value FROM json_each(?)) AND a.id NOT LIKE 'ephemeral-qa:%' AND COALESCE((SELECT role FROM org_user_roles WHERE user_id=a.id),'group-admin')='group-admin')`;
export async function removeAccount(user,actor){
 const event='local-delete:'+randomUUID(),stamp=new Date().toISOString();
 const batch=[{sql:`INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at) SELECT ?,?,?,?,?,? FROM local_users WHERE id=? AND name=? AND email=? AND updated_at IS ? AND ${realAdmin}`,params:[event,user.id,actor,JSON.stringify(user),JSON.stringify({operation:'delete-local-account',name:user.name,email:user.email}),stamp,user.id,user.name,user.email,user.updated_at,JSON.stringify(testNames)]}];
 for(const table of ['local_sessions','user_module_access','org_memberships','org_user_roles','user_appearance'])batch.push({sql:`DELETE FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM user_access_events WHERE id=?)`,params:[user.id,event]});
 batch.push({sql:'DELETE FROM local_users WHERE id=? AND EXISTS(SELECT 1 FROM user_access_events WHERE id=?)',params:[user.id,event]});
 const result=await query(batch);assert.equal(Number(result[0].meta.changes),1,'Cleanup preconditions changed; account preserved');
}
export async function inventory(){return (await query([{sql:'SELECT id,name,email,role,status,created_at,updated_at FROM local_users ORDER BY created_at',params:[]}]))[0].results;}
