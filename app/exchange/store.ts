import { ensureEnterprise } from "../enterprise/schema";
import { EnterpriseError } from "../enterprise/http";
import { sha256HexBytes } from "../evidence/versioning";
import { applicationLinkBase } from "../record-links";
import { withBasePath } from "../base-path";
import { deliverConfiguredEmail } from "../api/integrations/email-transport";
import { completedInitialization } from "../completed-initialization";
const ready = completedInitialization();
const ddl = [
  "CREATE TABLE IF NOT EXISTS vendor_invitation_details (digest TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)",
  "CREATE TABLE IF NOT EXISTS trust_request_details (request_id TEXT PRIMARY KEY NOT NULL, reason TEXT NOT NULL, nda_required INTEGER NOT NULL, accepted_at TEXT)",
  "CREATE TABLE IF NOT EXISTS exchange_connectors (kind TEXT PRIMARY KEY, config TEXT NOT NULL, secret TEXT, hook_hash TEXT, enabled INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS exchange_signals (kind TEXT NOT NULL, event_id TEXT NOT NULL, observed_at TEXT NOT NULL, summary TEXT NOT NULL, PRIMARY KEY(kind,event_id))",
  "CREATE TABLE IF NOT EXISTS exchange_tickets (finding_id TEXT PRIMARY KEY, provider TEXT NOT NULL, ticket TEXT UNIQUE, url TEXT, state TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS exchange_notices (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS vendor_invitations (digest TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, email TEXT NOT NULL, expires_at TEXT NOT NULL, created_by TEXT NOT NULL, draft_id TEXT, draft_revision TEXT, receipt TEXT UNIQUE)",
  "CREATE INDEX IF NOT EXISTS vendor_invitations_vendor ON vendor_invitations(vendor_id)",
  "CREATE TABLE IF NOT EXISTS trust_publication (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS trust_requests (id TEXT PRIMARY KEY, version_id TEXT NOT NULL, name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL, acknowledged_at TEXT NOT NULL, nda_version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', grant_hash TEXT UNIQUE, expires_at TEXT, decided_by TEXT, decided_at TEXT)",
  "CREATE INDEX IF NOT EXISTS trust_requests_queue ON trust_requests(status, acknowledged_at)",
  "CREATE TABLE IF NOT EXISTS exchange_rate (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS board_packages (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, digest TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)",
];
export async function init(db: D1Database) {
  await ensureEnterprise(db);
  await ready(db, () => db.batch(ddl.map((q) => db.prepare(q))));
}
export function check(v: unknown, status = 400, code = "input"): asserts v {
  if (!v) throw new EnterpriseError(status, code);
}
export const stamp = () => new Date().toISOString();
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
export const hash = (s: string) => sha256HexBytes(new TextEncoder().encode(s));
export const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
export const plusDays = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString();
export const emailOk = (v: string) =>
  v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export type Env = Record<string, unknown> & {
  DB: D1Database;
  BUCKET?: R2Bucket;
};
export async function sendLink(
  db: D1Database,
  env: Env,
  req: Request,
  email: string,
  path: string,
  subject: string,
) {
  const settings = await db
    .prepare("SELECT config_json FROM integration_settings WHERE kind='email'")
    .first<{ config_json: string }>();
  const base = applicationLinkBase(
    env.FORNOST_PUBLIC_URL ||
      JSON.parse(settings?.config_json || "{}").applicationUrl,
  );
  if (!base) return { sent: false, url: withBasePath(path) };
  const url = base + path.replace(/^\/+/, "");
  const result = await deliverConfiguredEmail(db, env, {
    to: email,
    subject,
    text: subject + "\n" + url,
  }).catch(() => ({ sent: false }));
  return result.sent ? { sent: true } : { sent: false, url };
}
export async function throttle(
  db: D1Database,
  req: Request,
  kind: string,
  max: number,
) {
  const hour = Math.floor(Date.now() / 3600000),
    id = await hash(
      kind +
        "|" +
        (req.headers.get("cf-connecting-ip") || "local") +
        "|" +
        hour,
    );
  const out = await db.batch<{ attempts: number }>([
    db.prepare("DELETE FROM exchange_rate WHERE expires<?").bind(hour),
    db
      .prepare(
        "INSERT INTO exchange_rate VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
      )
      .bind(id, hour + 1),
  ]);
  check(Number(out[1].results[0]?.attempts) <= max, 429, "rate");
}
