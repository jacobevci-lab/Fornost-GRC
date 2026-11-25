import { type NextRequest } from "next/server";
import {
  constantTimeEqual,
  passwordHash,
  passwordIterations,
  PBKDF2_ITERATIONS,
  PBKDF2_LEGACY_ITERATIONS,
} from "../api/auth/security";
import {
  authenticationRuntime,
  authenticationFailure,
  authJson,
  requestIp,
  signInSession,
} from "./runtime";
import { AuthenticationError } from "./model";
import {
  authEvent,
  localLoginAllowed,
  mappedExternalAccount,
  throttleLogin,
  digest,
} from "./store";
import { directoryAuthenticate } from "./providers";
import { validateDirectory } from "./config";
export async function passwordLogin(
  req: NextRequest,
  body: Record<string, unknown>,
  directory = false,
) {
  const r = await authenticationRuntime(directory),
    method = directory ? "directory" : "local",
    identifier = String(directory ? body.username || "" : body.email || "")
      .trim()
      .toLowerCase();
  try {
    await throttleLogin(r.db, method, identifier, requestIp(req));
    const password = typeof body.password === "string" ? body.password : "";
    if (
      !identifier ||
      identifier.length > 320 ||
      !password ||
      password.length > 4096
    )
      throw new AuthenticationError("invalid_credentials");
    let id: string, email: string;
    if (directory) {
      if (!r.config.directory.enabled)
        throw new AuthenticationError("provider_disabled", 409);
      validateDirectory(r.config.directory, {
        ...r.runtime,
        hasSecret: !!r.secrets.bindPassword,
        bridgeReady: r.runtime.bridgeToken.length >= 32,
      });
      const identity = await directoryAuthenticate(
        r.config.directory,
        password,
        identifier,
        r.secrets.bindPassword,
        r.runtime,
      );
      // The bridge's configured directory is the trust boundary; only pre-existing local accounts map.
      id = await mappedExternalAccount(
        r.db,
        identity.provider,
        identity.subject,
        identity.email,
        [identity.email.split("@")[1]],
      );
      email = identity.email;
    } else {
      const row = await r.db
        .prepare("SELECT * FROM local_users WHERE email=?")
        .bind(identifier)
        .first<{
          id: string;
          email: string;
          role: string;
          status: string;
          locked_until: string | null;
          password_salt: string;
          password_hash: string;
          password_iterations: number | null;
        }>();
      const now = new Date();
      if (
        !row ||
        row.status !== "Active" ||
        (row.locked_until && new Date(row.locked_until) > now) ||
        !localLoginAllowed(r.config, row.id, row.role)
      ) {
        await passwordHash(password, "00000000000000000000000000000000");
        throw new AuthenticationError("invalid_credentials");
      }
      const iterations = passwordIterations(
          row.password_iterations ?? PBKDF2_LEGACY_ITERATIONS,
        ),
        candidate = await passwordHash(
          password.trim(),
          row.password_salt,
          iterations,
        );
      if (!constantTimeEqual(candidate.hash, row.password_hash)) {
        await r.db
          .prepare(
            "UPDATE local_users SET locked_until=CASE WHEN failed_attempts+1>=5 THEN ? ELSE locked_until END,failed_attempts=CASE WHEN failed_attempts+1>=5 THEN 0 ELSE failed_attempts+1 END,updated_at=? WHERE id=?",
          )
          .bind(
            new Date(now.getTime() + 15 * 60_000).toISOString(),
            now.toISOString(),
            row.id,
          )
          .run();
        throw new AuthenticationError("invalid_credentials");
      }
      if (iterations < PBKDF2_ITERATIONS) {
        const upgraded = await passwordHash(password.trim());
        await r.db
          .prepare(
            "UPDATE local_users SET password_hash=?,password_salt=?,password_iterations=? WHERE id=?",
          )
          .bind(upgraded.hash, upgraded.salt, upgraded.iterations, row.id)
          .run();
      }
      await r.db
        .prepare(
          "UPDATE local_users SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?",
        )
        .bind(now.toISOString(), row.id)
        .run();
      id = row.id;
      email = row.email;
    }
    if (directory)
      await r.db
        .prepare("DELETE FROM authentication_limits WHERE key_hash=?")
        .bind(await digest(method + ":account:" + identifier))
        .run();
    const { session, options } = await signInSession(
      req,
      r.db,
      id,
      method,
      email,
      r.revision,
    );
    const response = authJson({ ok: true });
    response.cookies.set("fornost_session", session.token, options);
    return response;
  } catch (e) {
    await authEvent(
      r.db,
      method,
      "failure",
      identifier,
      e instanceof AuthenticationError ? e.code : "provider_unavailable",
    );
    return authenticationFailure(e);
  }
}
