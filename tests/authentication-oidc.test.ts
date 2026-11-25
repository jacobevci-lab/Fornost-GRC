import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { emptyLoginConfig } from "../app/authentication/model";
import { oidcStart, oidcCallback } from "../app/authentication/providers";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function fixture(overrides: Record<string, unknown> = {}, tamper = false) {
  const c = emptyLoginConfig().sso;
  Object.assign(c, {
    provider: "generic-oidc",
    issuer: "https://idp.example.com",
    clientId: "client",
    redirectUri: "https://app.example.com/api/auth/callback",
  });
  let tokenCalls = 0;
  const requests: URLSearchParams[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration"))
      return Response.json({
        issuer: c.issuer,
        authorization_endpoint: c.issuer + "/authorize",
        token_endpoint: c.issuer + "/token",
        jwks_uri: c.issuer + "/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    if (url.endsWith("/jwks"))
      return Response.json({
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid: "key-1",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    if (url.endsWith("/token")) {
      tokenCalls++;
      requests.push(new URLSearchParams(String(init?.body)));
      const now = Math.floor(Date.now() / 1000),
        claims = {
          iss: c.issuer,
          aud: "client",
          sub: "user-subject",
          email: "user@example.com",
          email_verified: true,
          nonce: "nonce",
          iat: now,
          exp: now + 300,
          ...overrides,
        };
      const data = b64({ alg: "RS256", kid: "key-1" }) + "." + b64(claims);
      const signature = sign(
        "RSA-SHA256",
        Buffer.from(data),
        privateKey,
      ).toString("base64url");
      return Response.json({
        access_token: "not-stored",
        token_type: "Bearer",
        id_token: (tamper ? data.replace(/.$/, "A") : data) + "." + signature,
      });
    }
    throw Error("Unexpected external request");
  };
  const runtime = {
    allowPrivate: false,
    development: false,
    bridgeToken: "",
    fetcher,
  };
  return { c, runtime, requests, tokenCalls: () => tokenCalls };
}
test("OIDC sends PKCE S256/state/nonce and validates a signed identity before mapping", async () => {
  const f = fixture(),
    url = new URL(
      await oidcStart(f.c, f.runtime, "state", "v".repeat(64), "nonce"),
    );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "state");
  assert.equal(url.searchParams.get("nonce"), "nonce");
  assert.ok(url.searchParams.get("code_challenge"));
  const result = await oidcCallback(
    f.c,
    "client-secret",
    f.runtime,
    new URLSearchParams({ code: "code", state: "state" }),
    "state",
    "v".repeat(64),
    "nonce",
  );
  assert.equal(result.email, "user@example.com");
  assert.equal(result.subject, "user-subject");
  assert.equal(f.requests[0].get("code_verifier"), "v".repeat(64));
  assert.equal(f.requests[0].get("client_secret"), "client-secret");
  assert.equal(f.requests[0].get("redirect_uri"), f.c.redirectUri);
});
test("OIDC rejects issuer/audience/nonce/expiry/unverified-email and tampered signatures", async () => {
  for (const claims of [
    { iss: "https://evil.example.com" },
    { aud: "other" },
    { nonce: "other" },
    { exp: 1 },
    { email_verified: false },
  ]) {
    const f = fixture(claims);
    await assert.rejects(
      oidcCallback(
        f.c,
        "secret",
        f.runtime,
        new URLSearchParams({ code: "code", state: "state" }),
        "state",
        "v".repeat(64),
        "nonce",
      ),
    );
  }
  const f = fixture({}, true);
  await assert.rejects(
    oidcCallback(
      f.c,
      "secret",
      f.runtime,
      new URLSearchParams({ code: "code", state: "state" }),
      "state",
      "v".repeat(64),
      "nonce",
    ),
  );
});
test("OIDC state or provider-denied callback never exchanges a code", async () => {
  const scenarios: Record<string, string>[] = [
    { code: "code", state: "wrong" },
    { error: "access_denied", state: "state" },
  ];
  for (const params of scenarios) {
    const f = fixture();
    await assert.rejects(
      oidcCallback(
        f.c,
        "secret",
        f.runtime,
        new URLSearchParams(params),
        "state",
        "v".repeat(64),
        "nonce",
      ),
    );
    assert.equal(f.tokenCalls(), 0);
  }
});
