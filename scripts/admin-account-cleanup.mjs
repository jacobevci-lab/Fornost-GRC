import assert from 'node:assert/strict';
import {inventory,removeAccount,testNames} from './production-account-store.mjs';
const apply=process.argv.includes('--apply');
if(apply){assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.CONFIRMATION,'remove-four-named-test-accounts');}
let users=await inventory();
const targets=users.filter(u=>testNames.includes(u.name));
console.log(JSON.stringify({operation:apply?'cleanup':'plan',targetAccounts:targets.map(({id,name,role,status})=>({id,name,role,status})),otherAccounts:users.filter(u=>!testNames.includes(u.name)&&!u.id.startsWith('ephemeral-qa:')).map(({name,role,status})=>({name,role,status}))},null,2));
if(apply){for(const user of targets)await removeAccount(user,'Administration cleanup (user authorized)');users=await inventory();assert(!users.some(u=>testNames.includes(u.name)));console.log(JSON.stringify({result:'CLEANUP_VERIFIED',remainingPermanentAccounts:users.filter(u=>!u.id.startsWith('ephemeral-qa:')).map(({name,role,status})=>({name,role,status}))}));}
