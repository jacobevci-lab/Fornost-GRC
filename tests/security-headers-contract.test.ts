import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync("worker/index.ts", "utf8");
const staticHeaders = readFileSync("public/_headers", "utf8");

test("worker CSP has an explicit restrictive baseline", () => {
  assert.match(worker, /default-src 'self'/);
  assert.match(worker, /object-src 'none'/);
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /base-uri 'self'/);
  assert.match(worker, /form-action 'self'/);
  assert.match(worker, /upgrade-insecure-requests/);
});

test("dynamic responses retain the enterprise security header contract", () => {
  for (const header of [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "X-Frame-Options",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "X-Permitted-Cross-Domain-Policies",
  ]) {
    assert.match(worker, new RegExp(`\\"${header}\\"`));
  }
});

test("static asset responses inherit critical security headers", () => {
  assert.match(staticHeaders, /^\/assets\/\*/m);
  assert.match(staticHeaders, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(staticHeaders, /X-Content-Type-Options: nosniff/);
  assert.match(staticHeaders, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(staticHeaders, /Permissions-Policy:/);
  assert.match(staticHeaders, /Cross-Origin-Resource-Policy: same-origin/);
  assert.match(staticHeaders, /X-Permitted-Cross-Domain-Policies: none/);
});
