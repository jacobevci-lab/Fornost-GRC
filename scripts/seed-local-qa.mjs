import assert from 'node:assert/strict';
import {qaPassword} from './qa-credentials.mjs';

// Isolated browser suites deliberately opt into demo fixtures. Never infer a
// production URL or restore samples as a side effect of listing records.
const base = 'http://127.0.0.1:4173';
const login = await fetch(`${base}/api/auth`, {
  method: 'POST', headers: {origin: base, 'content-type': 'application/json'},
  body: JSON.stringify({action: 'login', email: 'qa-admin@fornost.test', password: qaPassword()}),
});
assert.equal(login.status, 200, 'Isolated QA admin login failed');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.ok(cookie.includes('fornost_session='), 'Missing isolated QA session');
const restored = await fetch(`${base}/api/grc/demo`, {
  method: 'POST', headers: {origin: base, cookie},
});
assert.ok(restored.status === 200 || restored.status === 201, 'Explicit QA fixture restore failed');
const result = await restored.json();
assert.equal(result.inventory?.present, 32, 'Incomplete core QA fixtures');
console.log('Explicit local core QA fixtures ready: 32 records.');
