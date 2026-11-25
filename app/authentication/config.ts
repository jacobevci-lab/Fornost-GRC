import { BASE_PATH } from "../base-path";
import {
  AuthenticationError,
  emptyLoginConfig,
  domains,
  ssoProviders,
  type LoginConfig,
} from "./model";
import { safeHttpUrl } from "../api/integrations/security";
export function authUrl(
  value: string,
  allowPrivate = false,
  development = false,
) {
  if (development) {
    try {
      const u = new URL(value);
      if (
        ["127.0.0.1", "localhost"].includes(u.hostname) &&
        u.protocol === "http:" &&
        !u.username &&
        !u.password &&
        !u.hash
      )
        return u;
    } catch {}
  }
  const safe = safeHttpUrl(value, allowPrivate);
  if (!safe || !safe.startsWith("https:"))
    throw new AuthenticationError("invalid_configuration", 422);
  const u = new URL(safe);
  if (u.hash || u.username || u.password)
    throw new AuthenticationError("invalid_configuration", 422);
  return u;
}
export function parseLoginConfig(value: unknown): LoginConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthenticationError("invalid_configuration", 422);
  const v = value as Record<string, unknown>,
    out = emptyLoginConfig();
  for (const group of ["sso", "directory"] as const) {
    if (!v[group] || typeof v[group] !== "object" || Array.isArray(v[group]))
      throw new AuthenticationError("invalid_configuration", 422);
    const row = v[group] as Record<string, unknown>,
      target = out[group] as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      const item = row[key];
      if (typeof target[key] === "boolean") {
        if (typeof item !== "boolean")
          throw new AuthenticationError("invalid_configuration", 422);
        target[key] = item;
      } else {
        if (
          typeof item !== "string" ||
          item.length > (key === "idpCertificate" ? 16000 : 2048) ||
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item)
        )
          throw new AuthenticationError("invalid_configuration", 422);
        target[key] = item.trim();
      }
    }
  }
  const policy = v.policy as Record<string, unknown>;
  if (
    !policy ||
    typeof policy.requireSso !== "boolean" ||
    !Array.isArray(policy.breakGlassUserIds) ||
    policy.breakGlassUserIds.length > 20 ||
    policy.breakGlassUserIds.some(
      (x) => typeof x !== "string" || !x || x.length > 150,
    )
  )
    throw new AuthenticationError("invalid_configuration", 422);
  out.policy = {
    requireSso: policy.requireSso,
    breakGlassUserIds: [...new Set(policy.breakGlassUserIds)] as string[],
  };
  if (
    !ssoProviders.includes(out.sso.provider) ||
    !["ldaps", "starttls"].includes(out.directory.transport) ||
    !["sAMAccountName", "uid"].includes(out.directory.usernameAttribute) ||
    !["objectGUID", "entryUUID"].includes(out.directory.subjectAttribute)
  )
    throw new AuthenticationError("invalid_configuration", 422);
  return out;
}
export function validateSso(
  c: LoginConfig["sso"],
  origin: string,
  options: {
    allowPrivate: boolean;
    development: boolean;
    hasSecret: boolean;
    bridgeReady: boolean;
  },
) {
  const callback = c.provider === "saml" ? c.acsUrl : c.redirectUri;
  const url = authUrl(callback, options.allowPrivate, options.development);
  const path = c.provider === "saml" ? "/api/auth/saml" : "/api/auth/callback";
  if (
    url.origin !== origin ||
    url.pathname !== BASE_PATH + path ||
    url.search ||
    !domains(c.domains).length ||
    domains(c.domains).length > 50 ||
    domains(c.domains).some(
      (d) => !/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(d),
    )
  )
    throw new AuthenticationError("invalid_configuration", 422);
  if (c.provider === "saml") {
    authUrl(c.entryPoint, options.allowPrivate, options.development);
    authUrl(c.bridgeUrl, options.allowPrivate, options.development);
    if (
      !c.idpIssuer ||
      !c.entityId ||
      !c.idpCertificate.includes("-----BEGIN CERTIFICATE-----")
    )
      throw new AuthenticationError("invalid_configuration", 422);
    if (!options.bridgeReady)
      throw new AuthenticationError("bridge_required", 422);
  } else {
    const issuer = authUrl(c.issuer, options.allowPrivate, options.development);
    if (issuer.search || !c.clientId)
      throw new AuthenticationError("invalid_configuration", 422);
    if (
      c.provider === "entra-oidc" &&
      (!/^[a-f0-9-]{36}$/i.test(c.tenantId) ||
        issuer.href.replace(/\/$/, "") !==
          `https://login.microsoftonline.com/${c.tenantId}/v2.0`)
    )
      throw new AuthenticationError("invalid_configuration", 422);
    if (!options.hasSecret)
      throw new AuthenticationError("secret_required", 422);
  }
}
export function validateDirectory(
  c: LoginConfig["directory"],
  options: {
    allowPrivate: boolean;
    development: boolean;
    hasSecret: boolean;
    bridgeReady: boolean;
  },
) {
  authUrl(c.bridgeUrl, options.allowPrivate, options.development);
  if (
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/.test(c.host) ||
    !/^\d{1,5}$/.test(c.port) ||
    Number(c.port) < 1 ||
    Number(c.port) > 65535 ||
    !c.baseDn ||
    !c.bindDn
  )
    throw new AuthenticationError("invalid_configuration", 422);
  if (!options.hasSecret) throw new AuthenticationError("secret_required", 422);
  if (!options.bridgeReady)
    throw new AuthenticationError("bridge_required", 422);
}
