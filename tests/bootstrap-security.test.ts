import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authRoute = readFileSync("app/api/auth/route.ts", "utf8");
const setupPage = readFileSync("app/setup/page.tsx", "utf8");
const bootstrapGate = readFileSync("app/bootstrap-security-gate.tsx", "utf8");
const setupTokenScript = readFileSync("scripts/linux/setup-token.sh", "utf8");
const identityMigration = readFileSync("drizzle/0077_identity_security.sql", "utf8");
const identitySchema = readFileSync("db/identity-schema.ts", "utf8");
const drizzleConfig = readFileSync("drizzle.config.ts", "utf8");
const migrationValidator = readFileSync("scripts/validate-d1-migrations.mjs", "utf8");

test("first-admin bootstrap requires a protected authorization step", () => {
  assert.match(authRoute, /action === "authorize_bootstrap"/);
  assert.match(authRoute, /bootstrapAuthorized\(req\)/);
  assert.match(authRoute, /fornost_bootstrap_auth/);
  assert.match(authRoute, /maxAge: 15 \* 60/);
  assert.match(authRoute, /httpOnly: true/);
  assert.match(authRoute, /sameSite: "strict"/);
  assert.match(authRoute, /bootstrapCookieName, "", \{ \.\.\.bootstrapCookie\(req\), maxAge: 0 \}/);
});

test("first-run UI redirects unauthorized bootstrap attempts to the secure setup route", () => {
  assert.match(bootstrapGate, /bootstrapAuthorizationRequired === true/);
  assert.match(bootstrapGate, /withBasePath\("\/setup"\)/);
  assert.match(setupPage, /action: "authorize_bootstrap"/);
  assert.match(setupPage, /type="password"/);
  assert.match(setupPage, /minLength=\{32\}/);
  assert.match(setupPage, /autoComplete="off"/);
  assert.match(setupPage, /role="alert"/);
});

test("on-prem setup token is derived without printing the settings encryption key", () => {
  assert.match(setupTokenScript, /fornost-bootstrap-v1/);
  assert.match(setupTokenScript, /sha256sum/);
  assert.match(setupTokenScript, /Setup code:/);
  assert.doesNotMatch(setupTokenScript, /Settings encryption key:/i);
});

test("local identity schema is represented in canonical migrations", () => {
  for (const table of ["local_users", "local_sessions"]) {
    assert.match(identitySchema, new RegExp(`sqliteTable\\("${table}"`));
    assert.match(identityMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(drizzleConfig, /\.\/db\/identity-schema\.ts/);
  assert.match(migrationValidator, /identity-schema\.ts/);
});
