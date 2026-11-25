import { requestOrigin } from "../security";
import { type NextRequest } from "next/server";
import { sameOrigin } from "../security";
import {
  authenticationRuntime,
  authenticationFailure,
  authJson,
  requestIp,
  loginCookie,
} from "../../../authentication/runtime";
import { AuthenticationError } from "../../../authentication/model";
import {
  authEvent,
  randomToken,
  saveAuthState,
  throttleLogin,
} from "../../../authentication/store";
import { oidcStart, bridgeCall } from "../../../authentication/providers";
import { validateSso } from "../../../authentication/config";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return authJson({ code: "invalid_credentials" }, 403);
  const r = await authenticationRuntime(true);
  try {
    if (!r.config.sso.enabled)
      throw new AuthenticationError("provider_disabled", 409);
    await throttleLogin(r.db, "sso", "", requestIp(req));
    validateSso(r.config.sso, requestOrigin(req), {
      ...r.runtime,
      hasSecret: !!r.secrets.ssoSecret,
      bridgeReady: r.runtime.bridgeToken.length >= 32,
    });
    const browser = randomToken(),
      verifier = randomToken(),
      nonce = randomToken(),
      requestId = "_" + randomToken(),
      issuedAt = new Date().toISOString();
    const state = await saveAuthState(r.db, r.key, browser, r.revision, {
      verifier,
      nonce,
      requestId,
      issuedAt,
    });
    let url: string;
    if (r.config.sso.provider === "saml") {
      const result = await bridgeCall(
        r.config.sso.bridgeUrl,
        "/v1/saml/start",
        { sso: r.config.sso, requestId, issuedAt, state },
        r.runtime,
      );
      if (
        typeof result.url !== "string" ||
        new URL(result.url).origin !== new URL(r.config.sso.entryPoint).origin
      )
        throw new AuthenticationError("provider_unavailable", 503);
      url = result.url;
    } else
      url = await oidcStart(r.config.sso, r.runtime, state, verifier, nonce);
    await authEvent(r.db, "sso", "started", "", "authorization_started");
    const response = authJson({ ok: true, url }),
      saml = r.config.sso.provider === "saml";
    response.cookies.set("fornost_sso_state", browser, {
      ...loginCookie(req),
      sameSite: saml && !r.runtime.development ? "none" : "lax",
      secure: saml && !r.runtime.development ? true : loginCookie(req).secure,
      maxAge: 300,
    });
    return response;
  } catch (e) {
    await authEvent(
      r.db,
      "sso",
      "failure",
      "",
      e instanceof AuthenticationError ? e.code : "provider_unavailable",
    );
    return authenticationFailure(e);
  }
}
