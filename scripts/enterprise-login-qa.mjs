// Isolated protocol fixtures. This does not certify a customer's IdP or directory.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, sign, createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { qaPassword } from "./qa-credentials.mjs";
import {
  createQaContext,
  openQaModule,
  switchQaLocale,
  waitForQaIdle,
} from "./qa-browser-harness.mjs";
const base = "http://127.0.0.1:4173",
  issuer = "http://127.0.0.1:4190",
  out = "enterprise-login-qa-artifacts";
await mkdir(out, { recursive: true });
const bridgeToken = (await readFile(".dev.vars", "utf8")).match(
  /^FORNOST_IDENTITY_BRIDGE_TOKEN=(.+)$/m,
)?.[1];
assert.ok(bridgeToken?.length >= 32);
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }),
  jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "qa-key",
    alg: "RS256",
    use: "sig",
  },
  codes = new Map();
let externalEmail = "qa-admin@fornost.test";
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const fixture = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, issuer);
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/.well-known/openid-configuration")
      return res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: issuer + "/authorize",
          token_endpoint: issuer + "/token",
          jwks_uri: issuer + "/jwks",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"],
          code_challenge_methods_supported: ["S256"],
        }),
      );
    if (url.pathname === "/jwks")
      return res.end(JSON.stringify({ keys: [jwk] }));
    if (url.pathname === "/authorize") {
      assert.equal(
        url.searchParams.get("redirect_uri"),
        base + "/api/auth/callback",
      );
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      const code = randomUUID();
      codes.set(code, {
        nonce: url.searchParams.get("nonce"),
        challenge: url.searchParams.get("code_challenge"),
        email: externalEmail,
      });
      const callback = new URL(base + "/api/auth/callback");
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", url.searchParams.get("state"));
      res.writeHead(302, { location: callback.href });
      return res.end();
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    if (url.pathname === "/token") {
      const p = new URLSearchParams(raw),
        data = codes.get(p.get("code"));
      codes.delete(p.get("code"));
      if (
        !data ||
        p.get("client_secret") !== "qa-client-secret" ||
        createHash("sha256")
          .update(p.get("code_verifier") || "")
          .digest("base64url") !== data.challenge
      ) {
        res.statusCode = 401;
        return res.end("{}");
      }
      const now = Math.floor(Date.now() / 1000),
        payload =
          b64({ alg: "RS256", kid: "qa-key" }) +
          "." +
          b64({
            iss: issuer,
            aud: "qa-client",
            sub: data.email,
            email: data.email,
            email_verified: true,
            nonce: data.nonce,
            iat: now,
            exp: now + 120,
          });
      return res.end(
        JSON.stringify({
          access_token: "qa-unused",
          token_type: "Bearer",
          id_token:
            payload +
            "." +
            sign("RSA-SHA256", Buffer.from(payload), privateKey).toString(
              "base64url",
            ),
        }),
      );
    }
    if (url.pathname.startsWith("/v1/directory/")) {
      assert.equal(req.headers.authorization, "Bearer " + bridgeToken);
      const input = JSON.parse(raw);
      assert.equal(input.bindPassword, "qa-bind-secret");
      if (url.pathname.endsWith("/test")) return res.end('{"ok":true}');
      if (input.password !== qaPassword()) {
        res.statusCode = 401;
        return res.end('{"ok":false}');
      }
      return res.end(
        JSON.stringify({
          ok: true,
          subject: "directory-" + input.username,
          email:
            input.username === "qa-admin"
              ? "qa-admin@fornost.test"
              : "unknown@fornost.test",
        }),
      );
    }
    res.statusCode = 404;
    res.end("{}");
  } catch {
    res.statusCode = 500;
    res.end('{"error":"fixture contract failed"}');
  }
});
await new Promise((resolve) => fixture.listen(4190, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM_PATH || undefined,
});
const admin = await createQaContext(
    browser,
    base,
    {},
    { viewport: { width: 1440, height: 900 } },
  ),
  page = await admin.newPage();
page.setDefaultTimeout(20000);
const errors = [],
  screenshots = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
let phase = "local login";
async function api(ctx, method, path, data, status = 200) {
  const response = await ctx.request.fetch(base + path, {
    method,
    data,
    headers: { origin: base },
  });
  assert.equal(
    response.status(),
    status,
    `${method} ${path}: ${await response.text()}`,
  );
  return response.json();
}
async function save(config, extra = {}) {
  const current = await api(admin, "GET", "/api/auth/settings");
  return api(admin, "PUT", "/api/auth/settings", {
    config,
    revision: current.revision,
    ssoSecret: "",
    bindPassword: "",
    ...extra,
  });
}
async function capture(p, name) {
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  screenshots.push(name);
}
try {
  await api(admin, "POST", "/api/auth", {
    action: "login",
    email: "qa-admin@fornost.test",
    password: qaPassword(),
  });
  const stored = await api(admin, "GET", "/api/auth/settings"),
    config = stored.config;
  Object.assign(config.sso, {
    enabled: true,
    provider: "generic-oidc",
    displayName: "Fornost QA IdP",
    domains: "fornost.test",
    issuer,
    clientId: "qa-client",
    redirectUri: base + "/api/auth/callback",
  });
  Object.assign(config.directory, {
    enabled: true,
    host: "dc.fornost.test",
    port: "636",
    baseDn: "DC=fornost,DC=test",
    bindDn: "CN=reader,DC=fornost,DC=test",
    bridgeUrl: issuer,
  });
  await save(config, {
    ssoSecret: "qa-client-secret",
    bindPassword: "qa-bind-secret",
  });
  const safe = await api(admin, "GET", "/api/auth/settings");
  assert.equal(safe.hasSsoSecret, true);
  assert.equal(safe.hasBindPassword, true);
  assert.ok(!JSON.stringify(safe).includes("qa-bind-secret"));
  await api(
    admin,
    "PUT",
    "/api/auth/settings",
    { config, revision: "stale", ssoSecret: "", bindPassword: "" },
    409,
  );
  for (const method of ["sso", "directory"]) {
    const r = await api(admin, "POST", "/api/auth/settings", {
      method,
      revision: safe.revision,
    });
    assert.equal(r.signInVerified, false);
    assert.ok(r.latencyMs >= 0);
  }
  checks.push(
    "encrypted-secret redaction, stale-save conflict and actual connection checks",
  );
  phase = "login TR/EN light/dark desktop/mobile";
  for (const lang of ["tr", "en"])
    for (const theme of ["light", "dark"])
      for (const width of [1440, 390]) {
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 900 : 844 },
        });
        await context.addInitScript(
          ({ lang, theme }) => {
            localStorage.setItem("fornost-grc-language", lang);
            localStorage.setItem("fornost-grc-theme-v5", theme);
          },
          { lang, theme },
        );
        const p = await context.newPage();
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(base);
        await expect(p.locator("form.auth-card")).toBeVisible();
        await expect(p.locator("html")).toHaveAttribute("lang", lang);
        await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
        // Stored preferences alone cannot detect decorative layers intercepting
        // the actual button: exercise both pointer transitions at every size.
        const otherTheme = theme === "light" ? "dark" : "light";
        await p.locator(".login-preferences .theme-toggle").click();
        await expect(p.locator("html")).toHaveAttribute("data-theme", otherTheme);
        assert.equal(await p.evaluate(() => localStorage.getItem("fornost-grc-theme-v5")), otherTheme);
        await p.locator(".login-preferences .theme-toggle").click();
        await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await p.locator("input[name=email]").fill("person@fornost.test");
        await expect(p.locator(".login-discovery")).toBeVisible();
        await expect(p.locator(".login-sso")).toContainText("Fornost QA IdP");
        const sizes = await p
          .locator("form.auth-card input,form.auth-card button")
          .evaluateAll((nodes) =>
            nodes
              .filter((n) => n.getClientRects().length)
              .map((n) => ({
                size: parseFloat(getComputedStyle(n).fontSize),
                font: getComputedStyle(n).fontFamily,
                root: getComputedStyle(document.body).fontFamily,
              })),
          );
        assert.ok(
          sizes.every(
            (s) => s.size >= 11.5 && s.size <= 12 && s.font === s.root,
          ),
          JSON.stringify(sizes),
        );
        await expect(p.locator(".login-trust a")).toHaveAttribute(
          "href",
          "/trust-center",
        );
        await capture(p, `local-${lang}-${theme}-${width}`);
        await p
          .getByRole("tab", { name: "Active Directory / LDAP", exact: true })
          .click();
        await expect(p.locator("input[name=username]")).toBeVisible();
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await capture(p, `directory-${lang}-${theme}-${width}`);
        await p
          .getByRole("tab", { name: "Active Directory / LDAP", exact: true })
          .press("End");
        await expect(p.locator("input[name=email]")).toBeVisible();
        await context.close();
      }
  checks.push(
    "16 login method/locale/theme/viewport layouts; real bidirectional theme clicks, 12px controls, keyboard tabs, domain hint, Trust Center",
  );
  phase = "wrong local and LDAP credentials";
  let client = await browser.newContext();
  await api(
    client,
    "POST",
    "/api/auth",
    {
      action: "login",
      email: "qa-admin@fornost.test",
      password: "Wrong!Password123",
    },
    401,
  );
  await api(
    client,
    "POST",
    "/api/auth",
    {
      action: "directory_login",
      username: "qa-admin",
      password: "Wrong!Password123",
    },
    401,
  );
  await api(client, "POST", "/api/auth", {
    action: "directory_login",
    username: "qa-admin",
    password: qaPassword(),
  });
  assert.equal(
    (await api(client, "GET", "/api/auth")).user.authenticationMethod,
    "directory",
  );
  await client.close();
  client = await browser.newContext();
  await api(
    client,
    "POST",
    "/api/auth",
    { action: "directory_login", username: "unknown", password: qaPassword() },
    403,
  );
  assert.equal((await api(client, "GET", "/api/auth")).authenticated, false);
  await client.close();
  checks.push("directory success/failure and no just-in-time provisioning");
  phase = "actual OIDC redirect and signed token";
  client = await browser.newContext();
  let p = await client.newPage();
  await p.goto(base);
  await p.locator(".login-sso button").click();
  await expect(p.locator(".shell")).toBeVisible({ timeout: 30000 });
  assert.equal(
    (await api(client, "GET", "/api/auth")).user.authenticationMethod,
    "sso",
  );
  await client.close();
  phase = "SSO replay, unknown account and provider down";
  client = await browser.newContext();
  const started = await api(client, "POST", "/api/auth/start", {}),
    authorization = await client.request.get(started.url, { maxRedirects: 0 }),
    callback = authorization.headers().location;
  const first = await client.request.get(callback, { maxRedirects: 0 });
  assert.equal(first.status(), 303);
  await api(client, "POST", "/api/auth", { action: "logout" });
  const replay = await client.request.get(callback, { maxRedirects: 0 });
  assert.match(replay.headers().location, /auth_error=callback_invalid/);
  assert.equal((await api(client, "GET", "/api/auth")).authenticated, false);
  await client.close();
  externalEmail = "not-provisioned@fornost.test";
  client = await browser.newContext();
  p = await client.newPage();
  await p.goto(base);
  await p.locator(".login-sso button").click();
  await expect(p.getByRole("alert")).toBeVisible();
  assert.equal((await api(client, "GET", "/api/auth")).authenticated, false);
  await client.close();
  externalEmail = "qa-admin@fornost.test";
  checks.push(
    "real PKCE OIDC roundtrip, signature, consumed-state replay and unknown-account rejection",
  );
  phase = "SSO required, RBAC and last emergency administrator";
  const userId = (
    await api(
      admin,
      "POST",
      "/api/users",
      {
        name: "Enterprise QA User",
        email: "enterprise-qa@fornost.test",
        password: qaPassword(),
        role: "Viewer",
      },
      201,
    )
  ).id;
  config.policy = { requireSso: true, breakGlassUserIds: ["bootstrap-admin"] };
  await save(config);
  client = await browser.newContext();
  await api(
    client,
    "POST",
    "/api/auth",
    {
      action: "login",
      email: "enterprise-qa@fornost.test",
      password: qaPassword(),
    },
    401,
  );
  await api(client, "POST", "/api/auth", { action: "demo_login" }, 403);
  await api(client, "POST", "/api/auth", {
    action: "login",
    email: "qa-admin@fornost.test",
    password: qaPassword(),
  });
  await client.close();
  const admin2 = (
    await api(
      admin,
      "POST",
      "/api/users",
      {
        name: "Second Admin",
        email: "enterprise-admin2@fornost.test",
        password: qaPassword(),
        role: "Admin",
      },
      201,
    )
  ).id;
  const current = (await api(admin, "GET", "/api/users")).users.find(
    (u) => u.id === "bootstrap-admin",
  );
  await api(
    admin,
    "PATCH",
    "/api/users",
    { ...current, status: "Disabled", expectedRevision: current.revision },
    409,
  );
  config.policy.requireSso = false;
  await save(config);
  client = await browser.newContext();
  await api(client, "POST", "/api/auth", {
    action: "login",
    email: "enterprise-qa@fornost.test",
    password: qaPassword(),
  });
  await api(client, "GET", "/api/auth/settings", undefined, 403);
  await api(client, "GET", "/api/auth/events", undefined, 403);
  await client.close();
  for (const id of [userId, admin2]) {
    const user = (await api(admin, "GET", "/api/users")).users.find(
      (u) => u.id === id,
    );
    await api(admin, "DELETE", "/api/users", {
      id,
      email: user.email,
      expectedRevision: user.revision,
    });
  }
  checks.push(
    "required SSO denies ordinary local/demo; emergency account survives; settings and audit RBAC",
  );
  phase = "identity settings UI and audit trail";
  await page.goto(base);
  await expect(page.locator(".shell")).toBeVisible();
  await switchQaLocale(page, "en");
  await openQaModule(page, "Identity & Access");
  await page
    .getByRole("button", { name: "Enterprise SSO and SCIM", exact: true })
    .click();
  const panel = page.locator(".enterprise-auth-settings");
  await expect(panel.getByLabel("Provider", { exact: true })).toHaveValue("generic-oidc");
  assert.ok(await panel.locator("input[type=checkbox]").first().evaluate(e=>e.getBoundingClientRect().height<=16));
  await expect(panel.getByLabel("Client ID", { exact: true })).toHaveValue(
    "qa-client",
  );
  await panel
    .getByRole("button", { name: "Active Directory / LDAP", exact: true })
    .click();
  await expect(panel.getByLabel("Server host", { exact: true })).toHaveValue(
    "dc.fornost.test",
  );
  await waitForQaIdle(page);
  await capture(page, "directory-settings-en");
  for (const lang of ["tr", "en"])
    for (const theme of ["light", "dark"])
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await switchQaLocale(page, lang);
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page.locator(".theme-toggle:visible").click();
        await waitForQaIdle(page);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await capture(page, `settings-${lang}-${theme}-${width}`);
      }
  const events = (await api(admin, "GET", "/api/auth/events")).rows;
  for (const method of ["sso", "local", "directory"])
    for (const outcome of ["success", "failure"])
      assert.ok(
        events.some((e) => e.method === method && e.outcome === outcome),
        `${method}/${outcome}`,
      );
  assert.ok(!JSON.stringify(events).includes(qaPassword()));
  checks.push(
    "8 admin settings layouts; success/failure audit for all three methods",
  );
  // Leave this isolated environment with local recovery available for subsequent tests.
  config.sso.enabled = false;
  config.directory.enabled = false;
  await save(config);
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        result: "passed",
        checks,
        screenshots,
        errors,
        limits:
          "OIDC uses signed isolated IdP; directory HTTP transport is a fixture, LDAP TLS binds and signed SAML are separately covered by bridge tests. Customer IdP/AD/MFA acceptance remains required.",
      },
      null,
      2,
    ),
  );
  console.log(
    "ENTERPRISE_LOGIN_QA_PASS: " +
      checks.length +
      " scenario groups, " +
      screenshots.length +
      " screenshots",
  );
} catch (error) {
  await page
    .screenshot({ path: `${out}/failure.png`, fullPage: true })
    .catch(() => {});
  await writeFile(
    `${out}/failure.json`,
    JSON.stringify({ phase, error: error.message, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => fixture.close(resolve));
}
