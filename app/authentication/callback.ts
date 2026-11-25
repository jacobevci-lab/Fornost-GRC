import { requestOrigin } from "../api/auth/security";
import { NextResponse, type NextRequest } from "next/server";
import { BASE_PATH } from "../base-path";
import { readBoundedBody } from "../api/request-body";
import { authenticationRuntime, loginCookie, signInSession } from "./runtime";
import { AuthenticationError, domains } from "./model";
import { authEvent, consumeAuthState, mappedExternalAccount } from "./store";
import { oidcCallback, bridgeCall } from "./providers";
export async function completeSso(req: NextRequest, saml = false) {
  const r = await authenticationRuntime(true),
    home = new URL((BASE_PATH || "") + "/", requestOrigin(req));
  let email = "";
  try {
    if (!r.config.sso.enabled || saml !== (r.config.sso.provider === "saml"))
      throw new AuthenticationError("provider_disabled", 409);
    let params: URLSearchParams;
    if (saml) {
      if (
        !req.headers
          .get("content-type")
          ?.startsWith("application/x-www-form-urlencoded")
      )
        throw new AuthenticationError("callback_invalid");
      params = new URLSearchParams(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readBoundedBody(req, 192_000),
        ),
      );
    } else params = req.nextUrl.searchParams;
    for (const key of saml
      ? ["RelayState", "SAMLResponse"]
      : ["state", "code", "error"])
      if (params.getAll(key).length > 1)
        throw new AuthenticationError("callback_invalid");
    const state = params.get(saml ? "RelayState" : "state") || "";
    const transaction = await consumeAuthState(
      r.db,
      r.key,
      state,
      req.cookies.get("fornost_sso_state")?.value || "",
      r.revision,
    );
    let identity: { email: string; subject: string; provider: string };
    if (saml) {
      const result = await bridgeCall(
        r.config.sso.bridgeUrl,
        "/v1/saml/verify",
        {
          sso: r.config.sso,
          SAMLResponse: params.get("SAMLResponse"),
          requestId: transaction.requestId,
          issuedAt: transaction.issuedAt,
        },
        r.runtime,
      );
      if (
        typeof result.email !== "string" ||
        typeof result.subject !== "string"
      )
        throw new AuthenticationError("callback_invalid");
      identity = {
        email: result.email.toLowerCase(),
        subject: result.subject,
        provider: `saml:${r.config.sso.idpIssuer}:${r.config.sso.entityId}`,
      };
    } else
      identity = await oidcCallback(
        r.config.sso,
        r.secrets.ssoSecret,
        r.runtime,
        params,
        state,
        String(transaction.verifier),
        String(transaction.nonce),
      );
    email = identity.email;
    const id = await mappedExternalAccount(
      r.db,
      identity.provider,
      identity.subject,
      email,
      domains(r.config.sso.domains),
    );
    // A provider/configuration changed while verification was in flight cannot issue a session.
    const latest = await r.db
      .prepare("SELECT revision FROM identity_login_config WHERE id=1")
      .first<{ revision: string }>();
    if (latest?.revision !== r.revision)
      throw new AuthenticationError("callback_invalid");
    const { session, options } = await signInSession(
        req,
        r.db,
        id,
        "sso",
        email,
        r.revision,
      ),
      res = NextResponse.redirect(home, 303);
    res.cookies.set("fornost_session", session.token, options);
    res.cookies.set("fornost_sso_state", "", {
      ...loginCookie(req),
      maxAge: 0,
    });
    res.headers.set("cache-control", "no-store");
    return res;
  } catch (e) {
    const code = e instanceof AuthenticationError ? e.code : "callback_invalid";
    await authEvent(r.db, "sso", "failure", email, code);
    home.searchParams.set("auth_error", code);
    const res = NextResponse.redirect(home, 303);
    res.cookies.set("fornost_sso_state", "", {
      ...loginCookie(req),
      maxAge: 0,
    });
    res.headers.set("cache-control", "no-store");
    return res;
  }
}
