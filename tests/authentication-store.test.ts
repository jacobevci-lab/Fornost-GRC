import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { authenticationSchema } from "../app/authentication/schema";
import {
  emptyLoginConfig,
  discoverSso,
  publicLoginOptions,
} from "../app/authentication/model";
import {
  authEvent,
  consumeAuthState,
  digest,
  localLoginAllowed,
  mappedExternalAccount,
  readLoginConfig,
  saveAuthState,
  throttleLogin,
  writeLoginConfig,
} from "../app/authentication/store";
import {
  parseLoginConfig,
  validateDirectory,
  validateSso,
} from "../app/authentication/config";
const key = "test-encryption-key-".repeat(3);
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    authenticationSchema.join(";") +
      `;CREATE TABLE local_users(id TEXT PRIMARY KEY,email TEXT UNIQUE,role TEXT,status TEXT);INSERT INTO local_users VALUES('u','user@example.com','Editor','Active'),('a','admin@example.com','Admin','Active');`,
  );
  function prepare(query: string, values: SQLInputValue[] = []) {
    return {
      bind(...args: SQLInputValue[]) {
        return prepare(query, args);
      },
      async first() {
        return sql.prepare(query).get(...values) || null;
      },
      async all() {
        return { results: sql.prepare(query).all(...values) };
      },
      async run() {
        const results = /RETURNING/i.test(query)
          ? sql.prepare(query).all(...values)
          : [];
        const changes = /RETURNING/i.test(query)
          ? results.length
          : Number(sql.prepare(query).run(...values).changes);
        return { results, meta: { changes } };
      },
    };
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sql, db };
}
test("login settings preserve encrypted secrets and reject stale concurrent saves", async () => {
  const { db, sql } = fixture();
  try {
    const c = emptyLoginConfig(),
      revision = await writeLoginConfig(
        db,
        key,
        c,
        { ssoSecret: "secret-must-not-appear", bindPassword: "bind-secret" },
        "",
        "admin@example.com",
      );
    const raw = sql.prepare("SELECT * FROM identity_login_config").get()!;
    assert.ok(!JSON.stringify(raw).includes("secret-must-not-appear"));
    assert.ok(!JSON.stringify(raw).includes("bind-secret"));
    assert.equal((await readLoginConfig(db, key)).secrets.ssoSecret, "");
    assert.equal(
      (await readLoginConfig(db, key, true)).secrets.ssoSecret,
      "secret-must-not-appear",
    );
    await assert.rejects(
      writeLoginConfig(
        db,
        key,
        c,
        { ssoSecret: "", bindPassword: "" },
        "stale",
        "admin@example.com",
      ),
      /configuration_changed/,
    );
    assert.equal((await readLoginConfig(db, key)).revision, revision);
    assert.equal(
      sql.prepare("SELECT count(*) n FROM authentication_events").get()?.n,
      1,
    );
  } finally {
    sql.close();
  }
});
test("SSO state is encrypted, browser/revision bound, expires and consumes exactly once", async () => {
  const { db, sql } = fixture();
  try {
    const browser = "b".repeat(64),
      state = await saveAuthState(
        db,
        key,
        browser,
        "v1",
        { verifier: "secret-code-verifier" },
        1000,
      );
    assert.ok(
      !String(
        sql.prepare("SELECT payload FROM authentication_states").get()?.payload,
      ).includes("secret-code-verifier"),
    );
    await assert.rejects(
      consumeAuthState(db, key, state, "c".repeat(64), "v1", 2000),
      /callback_invalid/,
    );
    await assert.rejects(
      consumeAuthState(db, key, state, browser, "v2", 2000),
      /callback_invalid/,
    );
    const concurrent = await Promise.allSettled([
      consumeAuthState(db, key, state, browser, "v1", 2000),
      consumeAuthState(db, key, state, browser, "v1", 2000),
    ]);
    assert.equal(concurrent.filter((x) => x.status === "fulfilled").length, 1);
    const expired = await saveAuthState(db, key, browser, "v1", {}, 1000);
    await assert.rejects(
      consumeAuthState(db, key, expired, browser, "v1", 301001),
      /callback_invalid/,
    );
  } finally {
    sql.close();
  }
});
test("external identities map only active existing accounts and pin immutable subjects", async () => {
  const { db, sql } = fixture();
  try {
    assert.equal(
      await mappedExternalAccount(
        db,
        "oidc:issuer",
        "sub-1",
        "user@example.com",
        ["example.com"],
      ),
      "u",
    );
    await assert.rejects(
      mappedExternalAccount(db, "oidc:issuer", "sub-2", "user@example.com", [
        "example.com",
      ]),
      /account_unavailable/,
    );
    await assert.rejects(
      mappedExternalAccount(db, "oidc:issuer", "sub-new", "new@example.com", [
        "example.com",
      ]),
      /account_unavailable/,
    );
    await assert.rejects(
      mappedExternalAccount(db, "oidc:issuer", "sub-1", "admin@example.com", [
        "example.com",
      ]),
      /account_unavailable/,
    );
    await assert.rejects(
      mappedExternalAccount(db, "other", "sub", "user@example.com", [
        "other.example",
      ]),
      /account_unavailable/,
    );
    sql.exec("UPDATE local_users SET status='Disabled' WHERE id='u'");
    await assert.rejects(
      mappedExternalAccount(db, "oidc:issuer", "sub-1", "user@example.com", [
        "example.com",
      ]),
      /account_unavailable/,
    );
    assert.equal(sql.prepare("SELECT count(*) n FROM local_users").get()?.n, 2);
    assert.equal(
      sql.prepare("SELECT role FROM local_users WHERE id='u'").get()?.role,
      "Editor",
    );
  } finally {
    sql.close();
  }
});
test("SSO required policy cannot elevate a local contributor into emergency access", () => {
  const c = emptyLoginConfig();
  assert.equal(localLoginAllowed(c, "u", "Editor"), true);
  c.policy = { requireSso: true, breakGlassUserIds: ["a", "u"] };
  assert.equal(localLoginAllowed(c, "a", "Admin"), true);
  assert.equal(localLoginAllowed(c, "u", "Editor"), false);
  assert.equal(localLoginAllowed(c, "other", "Admin"), false);
});
test("failed attempts are bounded, expiry recovers and every method is auditable without raw opaque identity", async () => {
  const { db, sql } = fixture();
  try {
    for (let n = 0; n < 10; n++)
      await throttleLogin(db, "local", "USER@example.com", "test-ip", 1000);
    await assert.rejects(
      throttleLogin(db, "local", "user@example.com", "other-ip", 1000),
      /rate_limited/,
    );
    await throttleLogin(db, "local", "user@example.com", "test-ip", 902000);
    for (const method of ["local", "sso", "directory"] as const)
      for (const outcome of ["success", "failure"] as const)
        await authEvent(
          db,
          method,
          outcome,
          "opaque-identity",
          "invalid_credentials",
        );
    const rows = sql.prepare("SELECT * FROM authentication_events").all();
    assert.equal(rows.length, 6);
    assert.equal(new Set(rows.map((r) => r.method)).size, 3);
    assert.ok(rows.every((r) => r.actor === "sha256:" + sqlSafeDigest));
  } finally {
    sql.close();
  }
});
const sqlSafeDigest = await digest("opaque-identity");
test("public discovery matches exact normalized domain and never exposes connection settings", () => {
  const c = emptyLoginConfig();
  c.sso.enabled = true;
  c.sso.domains = "Example.com, subsidiary.example.com";
  c.sso.issuer = "https://secret-server.example.com";
  const options = publicLoginOptions(c);
  assert.equal(discoverSso(" USER@example.com ", options), true);
  assert.equal(discoverSso("user@evil-example.com", options), false);
  assert.equal(discoverSso("user@sub.example.com", options), false);
  assert.ok(!JSON.stringify(options).includes(c.sso.issuer));
  assert.deepEqual(parseLoginConfig(c), c);
  assert.throws(
    () =>
      parseLoginConfig({
        ...c,
        policy: { requireSso: true, breakGlassUserIds: ["a", 42] },
      }),
    /invalid_configuration/,
  );
});
test("enabled providers reject plaintext, redirect injection and unbounded domains", () => {
  const c = emptyLoginConfig(),
    options = {
      allowPrivate: false,
      development: false,
      hasSecret: true,
      bridgeReady: true,
    };
  Object.assign(c.sso, {
    provider: "generic-oidc",
    domains: "example.com",
    issuer: "https://idp.example.com",
    clientId: "client",
    redirectUri: "https://app.example.com/api/auth/callback",
  });
  validateSso(c.sso, "https://app.example.com", options);
  assert.throws(() =>
    validateSso(
      { ...c.sso, redirectUri: "https://evil.example.com/api/auth/callback" },
      "https://app.example.com",
      options,
    ),
  );
  assert.throws(() =>
    validateSso(
      { ...c.sso, issuer: "http://idp.example.com" },
      "https://app.example.com",
      options,
    ),
  );
  Object.assign(c.directory, {
    host: "dc.example.com",
    port: "636",
    bindDn: "CN=service,DC=example,DC=com",
    baseDn: "DC=example,DC=com",
    bridgeUrl: "https://bridge.example.com",
  });
  validateDirectory(c.directory, options);
  assert.throws(() =>
    validateDirectory({ ...c.directory, port: "70000" }, options),
  );
  assert.throws(
    () => validateDirectory(c.directory, { ...options, bridgeReady: false }),
    /bridge_required/,
  );
});
