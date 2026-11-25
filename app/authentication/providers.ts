import * as oauth from "oauth4webapi";
import { readBoundedBody } from "../api/request-body";
import {
  AuthenticationError,
  type SsoConfig,
  type DirectoryConfig,
} from "./model";
import { authUrl } from "./config";
export type ProviderRuntime = {
  allowPrivate: boolean;
  development: boolean;
  bridgeToken: string;
  fetcher?: typeof fetch;
};
export function providerFetch(runtime: ProviderRuntime): typeof fetch {
  return async (input, init) => {
    const url = authUrl(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      runtime.allowPrivate,
      runtime.development,
    );
    const response = await (runtime.fetcher || fetch)(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const bytes = await readBoundedBody(response, 512_000);
    return new Response(bytes, {
      status: response.status,
      headers: response.headers,
    });
  };
}
function requestOptions(runtime: ProviderRuntime) {
  return {
    [oauth.customFetch]: providerFetch(runtime),
    ...(runtime.development ? { [oauth.allowInsecureRequests]: true } : {}),
    signal: AbortSignal.timeout(12_000),
  };
}
export async function oidcMetadata(c: SsoConfig, runtime: ProviderRuntime) {
  const issuer = authUrl(c.issuer, runtime.allowPrivate, runtime.development),
    options = requestOptions(runtime);
  const response = await oauth.discoveryRequest(issuer, options),
    as = await oauth.processDiscoveryResponse(issuer, response);
  for (const endpoint of [
    as.authorization_endpoint,
    as.token_endpoint,
    as.jwks_uri,
  ])
    if (typeof endpoint !== "string")
      throw new AuthenticationError("invalid_configuration", 422);
    else authUrl(endpoint, runtime.allowPrivate, runtime.development);
  return as;
}
export async function oidcStart(
  c: SsoConfig,
  runtime: ProviderRuntime,
  state: string,
  verifier: string,
  nonce: string,
) {
  const as = await oidcMetadata(c, runtime),
    url = new URL(as.authorization_endpoint!);
  for (const [key, value] of Object.entries({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    response_mode: "query",
  }))
    url.searchParams.set(key, value);
  return url.href;
}
export async function oidcCallback(
  c: SsoConfig,
  secret: string,
  runtime: ProviderRuntime,
  params: URLSearchParams,
  state: string,
  verifier: string,
  nonce: string,
) {
  const as = await oidcMetadata(c, runtime),
    client: oauth.Client = {
      client_id: c.clientId,
      id_token_signed_response_alg: "RS256",
    },
    options = requestOptions(runtime);
  const callback = oauth.validateAuthResponse(as, client, params, state);
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    oauth.ClientSecretPost(secret),
    callback,
    c.redirectUri,
    verifier,
    options,
  );
  const tokens = await oauth.processAuthorizationCodeResponse(
    as,
    client,
    response,
    { expectedNonce: nonce, requireIdToken: true },
  );
  await oauth.validateApplicationLevelSignature(as, response, options);
  const claims = oauth.getValidatedIdTokenClaims(tokens);
  if (!claims?.sub) throw new AuthenticationError("callback_invalid");
  let email = claims.email;
  // Entra's tenant-specific v2 issuer signs preferred_username instead of email_verified.
  if (c.provider === "entra-oidc") {
    if (claims.tid !== c.tenantId || typeof claims.oid !== "string")
      throw new AuthenticationError("callback_invalid");
    email = claims.preferred_username;
  } else if (claims.email_verified !== true)
    throw new AuthenticationError("account_unavailable", 403);
  if (typeof email !== "string" || !email.includes("@"))
    throw new AuthenticationError("account_unavailable", 403);
  return {
    subject: claims.sub,
    email: email.toLowerCase(),
    provider: `oidc:${as.issuer}:${c.clientId}`,
  };
}
export async function bridgeCall(
  url: string,
  path: string,
  payload: Record<string, unknown>,
  runtime: ProviderRuntime,
) {
  if (runtime.bridgeToken.length < 32)
    throw new AuthenticationError("bridge_required", 503);
  const endpoint = authUrl(url, runtime.allowPrivate, runtime.development);
  if (endpoint.search || endpoint.hash)
    throw new AuthenticationError("invalid_configuration", 422);
  const response = await providerFetch(runtime)(
    endpoint.href.replace(/\/+$/, "") + path,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${runtime.bridgeToken}`,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok)
    throw new AuthenticationError(
      response.status === 401 ? "invalid_credentials" : "provider_unavailable",
      response.status === 401 ? 401 : 503,
    );
  const body = await response.json();
  if (!body || body.ok !== true)
    throw new AuthenticationError("provider_unavailable", 503);
  return body as Record<string, unknown>;
}
export async function directoryAuthenticate(
  c: DirectoryConfig,
  password: string,
  username: string,
  bindPassword: string,
  runtime: ProviderRuntime,
) {
  const result = await bridgeCall(
    c.bridgeUrl,
    "/v1/directory/login",
    { directory: c, bindPassword, username, password },
    runtime,
  );
  if (
    typeof result.email !== "string" ||
    typeof result.subject !== "string" ||
    !result.email.includes("@")
  )
    throw new AuthenticationError("account_unavailable", 403);
  return {
    email: result.email.toLowerCase(),
    subject: result.subject,
    provider: `ldap:${c.host.toLowerCase()}:${c.port}:${c.baseDn.toLowerCase()}`,
  };
}
