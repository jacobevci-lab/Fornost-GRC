import { requestOrigin } from "../security";
import { type NextRequest } from "next/server";
import { requireRole } from "../security";
import { readBoundedJsonObject } from "../../request-body";
import {
  authenticationRuntime,
  authenticationFailure,
  authJson,
} from "../../../authentication/runtime";
import {
  parseLoginConfig,
  validateDirectory,
  validateSso,
} from "../../../authentication/config";
import { AuthenticationError } from "../../../authentication/model";
import { authEvent, writeLoginConfig } from "../../../authentication/store";
import { bridgeCall, oidcMetadata } from "../../../authentication/providers";
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  try {
    const r = await authenticationRuntime(true),
      admins = await r.db
        .prepare(
          "SELECT id,name,email FROM local_users WHERE status='Active' AND role='Admin' ORDER BY name",
        )
        .all();
    return authJson({
      config: r.config,
      revision: r.revision,
      hasSsoSecret: !!r.secrets.ssoSecret,
      hasBindPassword: !!r.secrets.bindPassword,
      bridgeReady: r.runtime.bridgeToken.length >= 32,
      admins: admins.results,
    });
  } catch (e) {
    return authenticationFailure(e);
  }
}
export async function PUT(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  try {
    const body = await readBoundedJsonObject(req, 48_000),
      r = await authenticationRuntime(true),
      config = parseLoginConfig(body.config);
    if (typeof body.revision !== "string" || body.revision !== r.revision)
      throw new AuthenticationError("configuration_changed", 409);
    if (
      typeof body.ssoSecret !== "string" ||
      body.ssoSecret.length > 4096 ||
      typeof body.bindPassword !== "string" ||
      body.bindPassword.length > 4096
    )
      throw new AuthenticationError("invalid_configuration", 422);
    const secrets = {
      ssoSecret:
        body.ssoSecret ||
        (config.sso.provider === r.config.sso.provider
          ? r.secrets.ssoSecret
          : ""),
      bindPassword: body.bindPassword || r.secrets.bindPassword,
    };
    const options = {
      ...r.runtime,
      hasSecret: false,
      bridgeReady: r.runtime.bridgeToken.length >= 32,
    };
    if (config.sso.enabled)
      validateSso(config.sso, requestOrigin(req), {
        ...options,
        hasSecret: !!secrets.ssoSecret,
      });
    if (config.directory.enabled)
      validateDirectory(config.directory, {
        ...options,
        hasSecret: !!secrets.bindPassword,
      });
    if (
      (config.sso.enabled ||
        config.directory.enabled ||
        secrets.ssoSecret ||
        secrets.bindPassword) &&
      r.key.length < 32
    )
      throw new AuthenticationError("secret_required", 503);
    if (config.policy.requireSso) {
      if (
        !config.sso.enabled ||
        !config.policy.breakGlassUserIds.length ||
        (!r.config.policy.requireSso &&
          !config.policy.breakGlassUserIds.includes(access.actor.id))
      )
        throw new AuthenticationError("emergency_required", 422);
      const admins = await r.db
        .prepare(
          "SELECT id FROM local_users WHERE status='Active' AND role='Admin'",
        )
        .all<{ id: string }>();
      if (
        config.policy.breakGlassUserIds.some(
          (id) => !admins.results.some((a) => a.id === id),
        )
      )
        throw new AuthenticationError("emergency_required", 422);
    }
    const revision = await writeLoginConfig(
      r.db,
      r.key,
      config,
      secrets,
      body.revision,
      access.actor.email,
    );
    return authJson({ ok: true, revision });
  } catch (e) {
    return authenticationFailure(e);
  }
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const r = await authenticationRuntime(true);
  try {
    const body = await readBoundedJsonObject(req, 2048);
    if (body.revision !== r.revision)
      throw new AuthenticationError("configuration_changed", 409);
    const options = {
        ...r.runtime,
        bridgeReady: r.runtime.bridgeToken.length >= 32,
        hasSecret: false,
      },
      start = Date.now();
    if (body.method === "sso") {
      validateSso(r.config.sso, requestOrigin(req), {
        ...options,
        hasSecret: !!r.secrets.ssoSecret,
      });
      if (r.config.sso.provider === "saml")
        await bridgeCall(
          r.config.sso.bridgeUrl,
          "/v1/saml/test",
          { sso: r.config.sso },
          r.runtime,
        );
      else await oidcMetadata(r.config.sso, r.runtime);
    } else if (body.method === "directory") {
      validateDirectory(r.config.directory, {
        ...options,
        hasSecret: !!r.secrets.bindPassword,
      });
      await bridgeCall(
        r.config.directory.bridgeUrl,
        "/v1/directory/test",
        { directory: r.config.directory, bindPassword: r.secrets.bindPassword },
        r.runtime,
      );
    } else throw new AuthenticationError("invalid_configuration", 400);
    const current = await r.db
      .prepare("SELECT revision FROM identity_login_config WHERE id=1")
      .first<{ revision: string }>();
    if (current?.revision !== r.revision)
      throw new AuthenticationError("configuration_changed", 409);
    await authEvent(
      r.db,
      "configuration",
      "success",
      access.actor.email,
      body.method === "directory"
        ? "directory_bind_test"
        : "sso_configuration_test",
    );
    return authJson({
      ok: true,
      latencyMs: Date.now() - start,
      method: body.method,
      signInVerified: false,
    });
  } catch (e) {
    await authEvent(
      r.db,
      "configuration",
      "failure",
      access.actor.email,
      "connection_test_failed",
    );
    return authenticationFailure(e);
  }
}
