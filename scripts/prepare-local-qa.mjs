import { randomBytes } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';

if (!process.env.GITHUB_ENV) throw new Error('Run locally with your own FORNOST_QA_PASSWORD; this generator is for isolated CI jobs');
const password = randomBytes(32).toString('base64url') + 'aA1!';
console.log(`::add-mask::${password}`);
appendFileSync(process.env.GITHUB_ENV, `FORNOST_QA_PASSWORD=${password}\nFORNOST_SMOKE_PASSWORD=${password}\n`);
writeFileSync('/tmp/fornost-qa-bootstrap.json', JSON.stringify({action:'bootstrap',name:'QA Admin',email:'qa-admin@fornost.test',password}), {mode:0o600});
