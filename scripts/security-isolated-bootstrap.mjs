import assert from 'node:assert/strict';
const base = process.env.FORNOST_PROD_URL;
assert.equal(base, 'https://127.0.0.1:4173', 'Bootstrap only the disposable loopback target');
const post = (data, cookie = '') => fetch(`${base}/api/auth`, {
  method: 'POST', headers: {origin: base, 'content-type': 'application/json', cookie}, body: JSON.stringify(data),
});
const authorize = await post({action:'authorize_bootstrap', token:process.env.SCAN_BOOTSTRAP_TOKEN});
assert.equal(authorize.status, 200, 'Authorize isolated bootstrap');
const cookie = authorize.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const create = await post({action:'bootstrap', name:'Security QA', email:process.env.FORNOST_SMOKE_EMAIL, password:process.env.FORNOST_SMOKE_PASSWORD}, cookie);
assert.equal(create.status, 200, 'Create synthetic administrator');
console.log('Isolated security account created');
