import { completedInitialization } from "../completed-initialization";
import { editions, type Edition, type LicenseAccess } from "./editions";

declare const __FORNOST_LICENSE_KEY__: string;
// An empty key is used only by the existing internal build. Commercial builds
// pin the publisher's public key into the artifact, outside customer settings.
export const publisherKey = typeof __FORNOST_LICENSE_KEY__ === "string" ? __FORNOST_LICENSE_KEY__ : "";
type Claims = { product: "Fornost GRC"; installation: string; customer: string; edition: Edition; expires: string; revision: number };
type LicenseRow = { installation: string; token: string; revision: number; highest: number };
export type LicenseInfo = { installation: string; customer: string; edition: Edition | null; expires: string; revision: number; status: "pending" | "active" | "expired" | "invalid"; access: LicenseAccess };
export class LicenseError extends Error {
  constructor(readonly code: "invalid" | "installation" | "expired" | "revision") { super(code); }
}
function decode(s: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new LicenseError("invalid");
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
export async function verifyLicense(token: string, key: string): Promise<Claims> {
  try {
    if (!key || typeof token !== "string" || token.length > 8192) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "FGR1") throw new Error();
    const pub = await crypto.subtle.importKey("spki", decode(key), "Ed25519", false, ["verify"]);
    if (!await crypto.subtle.verify("Ed25519", pub, decode(parts[2]), new TextEncoder().encode("FGR1." + parts[1]))) throw new Error();
    const c = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decode(parts[1])));
    if (c.product !== "Fornost GRC" || !editions.includes(c.edition) || typeof c.installation !== "string"
      || !/^[0-9a-f-]{36}$/.test(c.installation) || typeof c.customer !== "string" || !c.customer.trim() || c.customer.length > 160
      || !Number.isSafeInteger(c.revision) || c.revision < 1 || typeof c.expires !== "string"
      || new Date(c.expires).toISOString() !== c.expires) throw new Error();
    return c as Claims;
  } catch { throw new LicenseError("invalid"); }
}

const initialize = completedInitialization();
async function row(db: D1Database) {
  await initialize(db, async () => {
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS installation_license (id INTEGER PRIMARY KEY CHECK(id=1), installation TEXT NOT NULL, token TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0, highest INTEGER NOT NULL DEFAULT -1, updated_by TEXT, updated_at TEXT)"),
      db.prepare("INSERT INTO installation_license(id,installation) VALUES(1,?) ON CONFLICT(id) DO NOTHING").bind(crypto.randomUUID()),
    ]);
  });
  const state = await db.prepare("SELECT installation,token,revision,highest FROM installation_license WHERE id=1").first<LicenseRow>();
  if (!state) throw new Error("License storage unavailable");
  return state;
}

export async function readLicense(db: D1Database, key = publisherKey, now = Date.now()): Promise<LicenseInfo> {
  const s = await row(db);
  const base = { installation: s.installation, revision: s.revision, edition: null, customer: "", expires: "", access: { active: null, archive: null } };
  if (!s.token) return { ...base, status: "pending" };
  try {
    const c = await verifyLicense(s.token, key);
    if (c.installation !== s.installation || c.revision !== s.revision) throw new LicenseError("invalid");
    const active = Date.parse(c.expires) > now ? c.edition : null;
    return { ...base, customer: c.customer, edition: c.edition, expires: c.expires, status: active ? "active" : "expired",
      access: { active, archive: editions[s.highest] ?? c.edition } };
  } catch { return { ...base, status: "invalid" }; }
}

export async function activateLicense(db: D1Database, token: string, actor: string, key = publisherKey, now = Date.now()) {
  const c = await verifyLicense(token, key);
  const s = await row(db);
  if (c.installation !== s.installation) throw new LicenseError("installation");
  if (Date.parse(c.expires) <= now) throw new LicenseError("expired");
  if (s.token !== token) {
    const updated = await db.prepare("UPDATE installation_license SET token=?,revision=?,highest=MAX(highest,?),updated_by=?,updated_at=? WHERE id=1 AND installation=? AND revision<?")
      .bind(token,c.revision,editions.indexOf(c.edition),actor,new Date(now).toISOString(),c.installation,c.revision).run();
    if (!updated.meta?.changes && (await row(db)).token !== token) throw new LicenseError("revision");
  }
  return readLicense(db,key,now);
}

export async function installationAccess(db: D1Database) {
  return publisherKey ? (await readLicense(db)).access : undefined;
}
