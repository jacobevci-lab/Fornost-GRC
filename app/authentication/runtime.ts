import { NextResponse, type NextRequest } from "next/server";
import {
  identityDb,
  createSession,
  requestIsSecure,
} from "../api/auth/security";
import { BASE_PATH } from "../base-path";
import {
  AuthenticationError,
  loginErrorText,
  type SignInMethod,
} from "./model";
import { authEvent, digest, readLoginConfig } from "./store";
export async function authenticationRuntime(withSecrets = false) {
  const { env } = await import("cloudflare:workers");
  const values = env as unknown as Record<string, unknown>,
    key = String(values.FORNOST_SETTINGS_ENCRYPTION_KEY || ""),
    db = await identityDb();
  const runtime = {
    allowPrivate: ["true", "1"].includes(
      String(values.FORNOST_ALLOW_PRIVATE_CONNECTORS),
    ),
    development: process.env.NODE_ENV === "development",
    bridgeToken: String(values.FORNOST_IDENTITY_BRIDGE_TOKEN || ""),
  };
  return { db, key, runtime, ...(await readLoginConfig(db, key, withSecrets)) };
}
export const loginCookie = (req: NextRequest) => ({
  httpOnly: true,
  secure: requestIsSecure(req),
  sameSite: "strict" as const,
  path: BASE_PATH || "/",
});
export function authJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
export function authenticationFailure(error: unknown) {
  const e =
    error instanceof AuthenticationError
      ? error
      : new AuthenticationError("provider_unavailable", 503);
  return authJson(
    { error: loginErrorText(e.code, "tr"), code: e.code },
    e.status,
  );
}
export async function signInSession(
  req: NextRequest,
  db: D1Database,
  id: string,
  method: SignInMethod,
  email: string,
  revision?: string,
) {
  const session = await createSession(db, id, undefined, revision);
  if (!session) throw new AuthenticationError("account_unavailable", 403);
  const hash = await digest(session.token);
  try {
    await db
      .prepare("DELETE FROM authentication_session_methods WHERE expires_at<=?")
      .bind(new Date().toISOString())
      .run();
    await db
      .prepare(
        "INSERT INTO authentication_session_methods(id_hash,method,expires_at) VALUES(?,?,?)",
      )
      .bind(hash, method, session.expires.toISOString())
      .run();
    await authEvent(db, method, "success", email, "authenticated");
    await db
      .prepare("DELETE FROM authentication_limits WHERE key_hash=?")
      .bind(await digest(method + ":account:" + email.trim().toLowerCase()))
      .run();
  } catch (error) {
    await db
      .prepare("DELETE FROM local_sessions WHERE id_hash=?")
      .bind(hash)
      .run();
    throw error;
  }
  return {
    session,
    options: {
      ...loginCookie(req),
      expires: session.expires,
      maxAge: Math.max(
        0,
        Math.floor((session.expires.getTime() - Date.now()) / 1000),
      ),
    },
  };
}
export function requestIp(req: NextRequest) {
  return req.headers.get("cf-connecting-ip")?.slice(0, 64) || "unavailable";
}
