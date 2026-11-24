import assert from 'node:assert/strict';
import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {query,realAdmin,testNames,inventory,removeAccount} from '../../../scripts/production-account-store.mjs';
assert.equal(process.env.GITHUB_REF,'refs/heads/main','Production QA identities require main');
assert.equal(process.env.GITHUB_REPOSITORY,'jacobevci-lab/Fornost-GRC');
// Recover abandoned identities from cancelled runners; active concurrent runs remain untouched.
for(const user of await inventory())if(user.id.startsWith('ephemeral-qa:')&&Date.parse(user.created_at)<Date.now()-6*3100000)await removeAccount(user,'Expired QA cleanup');
const id='ephemeral-qa:'+randomUUID(),email=id.replace(':','-')+'@qa.fornost.test',name='Temporary production QA '+process.env.GITHUB_RUN_ID;
const password=randomBytes(32).toString('base64url')+'aA1!',salt=randomBytes(16),hash=pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),now=new Date().toISOString();
console.log('::add-mask::'+password);appendFileSync(process.env.GITHUB_STATE,`account_id=${id}\n`);
const result=await query([{sql:`INSERT INTO local_users(id,name,email,password_hash,password_salt,password_iterations,role,status,created_at,updated_at) SELECT ?,?,?,?,?, '100000','Admin','Active',?,? WHERE ${realAdmin}`,params:[id,name,email,hash,salt.toString('hex'),now,now,JSON.stringify(testNames)]},{sql:"INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at) SELECT ?,?,?,'null',?,? WHERE changes()=1",params:[randomUUID(),id,'GitHub QA '+process.env.GITHUB_RUN_ID,JSON.stringify({operation:'create-local-account',name,email,role:'Admin',temporary:true}),now]}]);
assert.equal(Number(result[0].meta.changes),1,'A real active group administrator must remain');
appendFileSync(process.env.GITHUB_ENV,`FORNOST_SMOKE_EMAIL=${email}\nFORNOST_SMOKE_PASSWORD=${password}\n`);
console.log('Temporary production QA account prepared; post-run cleanup registered.');
