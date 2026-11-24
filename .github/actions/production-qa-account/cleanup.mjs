import assert from 'node:assert/strict';
import {inventory,removeAccount} from '../../../scripts/production-account-store.mjs';
const id=process.env.STATE_account_id;
if(id){assert(id.startsWith('ephemeral-qa:'));const user=(await inventory()).find(u=>u.id===id);if(user)await removeAccount(user,'GitHub QA cleanup '+process.env.GITHUB_RUN_ID);console.log('Temporary QA identity and sessions removed; audit history retained.');}
