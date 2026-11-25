import { decryptSecret, encryptSecret } from "../api/integrations/security";
import { ensureIntegrations } from "../integrations/schema";
import { ensureAuthentication } from "./schema";
import {
  AuthenticationError,
  emptyLoginConfig,
  domains,
  type LoginConfig,
  type SignInMethod,
} from "./model";
export type AuthSecrets = { ssoSecret: string; bindPassword: string };
export type StoredLogin = {
  config: LoginConfig;
  secrets: AuthSecrets;
  revision: string;
};
export const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function readLoginConfig(
  db: D1Database,
  key: string,
  withSecrets = false,
): Promise<StoredLogin> {
  await ensureAuthentication(db);
  const row = await db
    .prepare(
      "SELECT config_json,secrets_ciphertext,revision FROM identity_login_config WHERE id=1",
    )
    .first<{
      config_json: string;
      secrets_ciphertext: string;
      revision: string;
    }>();
  if (row)
    return {
      config: JSON.parse(row.config_json),
      revision: row.revision,
      secrets:
        withSecrets && row.secrets_ciphertext
          ? JSON.parse(await decryptSecret(row.secrets_ciphertext, key))
          : { ssoSecret: "", bindPassword: "" },
    };
  // Import only the saved metadata for editing. A legacy preflight never enables login.
  const config = emptyLoginConfig();
  await ensureIntegrations(db);
  const old = await db
    .prepare(
      "SELECT provider,config_json FROM integration_settings WHERE kind='identity'",
    )
    .first<{ provider: string; config_json: string }>();
  if (old) {
    const c = JSON.parse(old.config_json);
    if (
      [
        "entra-oidc",
        "okta-oidc",
        "google-oidc",
        "generic-oidc",
        "saml",
      ].includes(old.provider)
    ) {
      for (const k of Object.keys(config.sso)) {
        if (k !== "enabled" && typeof c[k] === "string")
          (config.sso as unknown as Record<string, unknown>)[k] = c[k];
      }
      config.sso.provider = old.provider as LoginConfig["sso"]["provider"];
    }
  }
  return { config, revision: "", secrets: { ssoSecret: "", bindPassword: "" } };
}
export async function writeLoginConfig(
  db: D1Database,
  key: string,
  config: LoginConfig,
  secrets: AuthSecrets,
  expected: string,
  actor: string,
) {
  const revision = crypto.randomUUID(),
    now = new Date().toISOString();
  const encrypted =
    secrets.ssoSecret || secrets.bindPassword
      ? await encryptSecret(JSON.stringify(secrets), key)
      : "";
  const [result] = await db.batch([
    db
      .prepare(
        `INSERT INTO identity_login_config SELECT 1,?,?,?,?,? WHERE coalesce((SELECT revision FROM identity_login_config WHERE id=1),'')=?
 AND EXISTS(SELECT 1 FROM local_users WHERE email=? AND role='Admin' AND status='Active')
 AND (?=0 OR (? > 0 AND NOT EXISTS(SELECT 1 FROM json_each(?) ids LEFT JOIN local_users u ON u.id=ids.value WHERE u.id IS NULL OR u.role!='Admin' OR u.status!='Active')))
 ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,secrets_ciphertext=excluded.secrets_ciphertext,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      )
      .bind(
        JSON.stringify(config),
        encrypted,
        revision,
        actor,
        now,
        expected,
        actor,
        Number(config.policy.requireSso),
        config.policy.breakGlassUserIds.length,
        JSON.stringify(config.policy.breakGlassUserIds),
      ),
    db
      .prepare(
        "INSERT INTO authentication_events SELECT ?,'configuration','success',?,'settings_updated',? WHERE changes()=1",
      )
      .bind(crypto.randomUUID(), actor, now),
  ]);
  if (!result.meta?.changes)
    throw new AuthenticationError("configuration_changed", 409);
  return revision;
}
export async function authEvent(
  db: D1Database,
  method: SignInMethod | "configuration",
  outcome: "success" | "failure" | "started",
  identifier: string,
  reason: string,
) {
  // Never store unstructured provider errors or arbitrary credential-shaped input.
  const actor = /^[^\s@<>]{1,160}@[^\s@<>]{1,160}$/.test(identifier)
    ? identifier.toLowerCase()
    : identifier
      ? "sha256:" + (await digest(identifier.toLowerCase()))
      : "anonymous";
  await db
    .prepare(
      "INSERT INTO authentication_events(id,method,outcome,actor,reason,created_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      method,
      outcome,
      actor,
      reason,
      new Date().toISOString(),
    )
    .run();
}
export async function throttleLogin(
  db: D1Database,
  method: SignInMethod,
  identifier: string,
  ip: string,
  now = Date.now(),
) {
  const keys = await Promise.all([
    ...(identifier
      ? [digest(method + ":account:" + identifier.trim().toLowerCase())]
      : []),
    digest(method + ":network:" + ip),
  ]);
  await db
    .prepare("DELETE FROM authentication_limits WHERE expires_at<=?")
    .bind(now)
    .run();
  const results = await db.batch(
    keys.map((key) =>
      db
        .prepare(
          `INSERT INTO authentication_limits VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts`,
        )
        .bind(key, now + 15 * 60_000),
    ),
  );
  if (
    results.some(
      (r, i) =>
        Number((r.results[0] as { attempts: number })?.attempts) >
        (identifier && i === 0 ? 10 : 300),
    )
  )
    throw new AuthenticationError("rate_limited", 429);
}
export async function saveAuthState(
  db: D1Database,
  key: string,
  browser: string,
  revision: string,
  payload: Record<string, unknown>,
  now = Date.now(),
) {
  const state = randomToken();
  await db
    .prepare("DELETE FROM authentication_states WHERE expires_at<=?")
    .bind(now)
    .run();
  await db
    .prepare(
      "INSERT INTO authentication_states(id_hash,browser_hash,revision,payload,expires_at) VALUES(?,?,?,?,?)",
    )
    .bind(
      await digest(state),
      await digest(browser),
      revision,
      await encryptSecret(JSON.stringify(payload), key),
      now + 5 * 60_000,
    )
    .run();
  return state;
}
export async function consumeAuthState(
  db: D1Database,
  key: string,
  state: string,
  browser: string,
  revision: string,
  now = Date.now(),
) {
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser))
    throw new AuthenticationError("callback_invalid");
  const row = await db
    .prepare(
      "UPDATE authentication_states SET consumed=1 WHERE id_hash=? AND browser_hash=? AND revision=? AND expires_at>? AND consumed=0 RETURNING payload",
    )
    .bind(await digest(state), await digest(browser), revision, now)
    .first<{ payload: string }>();
  if (!row) throw new AuthenticationError("callback_invalid");
  return JSON.parse(await decryptSecret(row.payload, key)) as Record<
    string,
    unknown
  >;
}
export async function mappedExternalAccount(
  db: D1Database,
  provider: string,
  subject: string,
  email: string,
  allowedDomains: string[],
  now = new Date().toISOString(),
) {
  if (
    !subject ||
    subject.length > 1024 ||
    !email ||
    !allowedDomains.includes(email.toLowerCase().split("@")[1])
  )
    throw new AuthenticationError("account_unavailable", 403);
  const pinned = await db
    .prepare(
      `SELECT u.id,u.email FROM authentication_bindings b JOIN local_users u ON u.id=b.user_id WHERE b.provider=? AND b.subject=? AND u.status='Active'`,
    )
    .bind(provider, subject)
    .first<{ id: string; email: string }>();
  if (pinned) {
    if (pinned.email.toLowerCase() !== email.toLowerCase())
      throw new AuthenticationError("account_unavailable", 403);
    return pinned.id;
  }
  const user = await db
    .prepare("SELECT id FROM local_users WHERE email=? AND status='Active'")
    .bind(email.toLowerCase())
    .first<{ id: string }>();
  if (!user) throw new AuthenticationError("account_unavailable", 403);
  // Both uniqueness constraints are enforced by storage, including simultaneous first logins.
  await db
    .prepare(
      "INSERT OR IGNORE INTO authentication_bindings(provider,subject,user_id,created_at) VALUES(?,?,?,?)",
    )
    .bind(provider, subject, user.id, now)
    .run();
  const bound = await db
    .prepare(
      "SELECT user_id FROM authentication_bindings WHERE provider=? AND subject=?",
    )
    .bind(provider, subject)
    .first<{ user_id: string }>();
  if (bound?.user_id !== user.id)
    throw new AuthenticationError("account_unavailable", 403);
  return user.id;
}
export function localLoginAllowed(
  config: LoginConfig,
  userId: string,
  role: string,
) {
  return (
    !config.policy.requireSso ||
    (role === "Admin" && config.policy.breakGlassUserIds.includes(userId))
  );
}
export function allowedLoginDomains(config: LoginConfig, email: string) {
  return domains(config.sso.domains).includes(
    email.toLowerCase().split("@")[1],
  );
}
