import { completedInitialization } from "../../completed-initialization";
import { ensurePasswordIterationsColumn } from "./password-column";
import { NextRequest, NextResponse } from "next/server";
import { sessionExpired, sessionTimeoutMinutes } from "../../session-policy";
import { BASE_PATH } from "../../base-path";
import { scopedApiAllowed, type ModuleAccess } from "../../module-access";
import { ensureModuleAccessSchema, readModuleAccess } from "../users/access-storage";
import { cleanupExpiredSessions, SESSION_EXPIRY_INDEX_SQL, SESSION_USER_INDEX_SQL } from "./session-storage";

export type AppRole = "Admin" | "Editor" | "Viewer";
export type Actor = { id: string; email: string; name: string; role: AppRole; source: "local" | "entra"; moduleAccess?: ModuleAccess };

// Cloudflare Workers WebCrypto rejects PBKDF2 requests above 100,000 iterations in production.
// Keep the local credential format at that runtime ceiling until the password KDF is migrated.
export const PBKDF2_LEGACY_ITERATIONS=100_000;
export const PBKDF2_ITERATIONS=100_000;

const usersSql = `CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT ${PBKDF2_ITERATIONS}, role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`;
const sessionsSql = `CREATE TABLE IF NOT EXISTS local_sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`;

const initializeIdentity = completedInitialization();

export async function identityDb() {
  const { env } = await import("cloudflare:workers");
  await initializeIdentity(env.DB, async()=>{
      await env.DB.batch([
        env.DB.prepare(usersSql),
        env.DB.prepare(sessionsSql),
        env.DB.prepare(SESSION_EXPIRY_INDEX_SQL),
        env.DB.prepare(SESSION_USER_INDEX_SQL),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_settings (id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      ]);
      await ensureModuleAccessSchema(env.DB);
      await ensurePasswordIterationsColumn(env.DB);
  });
  return env.DB;
}

export const demoAccount={name:"Fornost Demo Editor",email:"demo@fornost.test",role:"Editor" as const};

export async function ensureDemoUser(db: Awaited<ReturnType<typeof identityDb>>){
 const existing=await db.prepare("SELECT id FROM local_users WHERE email=?").bind(demoAccount.email).first<{id:string}>();
 if(existing)return;
 const oneTimeSecret=`${bytesToHex(crypto.getRandomValues(new Uint8Array(24)))}Aa1!`;
 const p=await passwordHash(oneTimeSecret),now=new Date().toISOString();
 await db.prepare("INSERT INTO local_users(id,name,email,password_hash,password_salt,password_iterations,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'Active',?,?) ON CONFLICT(email) DO NOTHING").bind("demo-editor",demoAccount.name,demoAccount.email,p.hash,p.salt,p.iterations,demoAccount.role,now,now).run();
}

function bytesToHex(bytes: Uint8Array) { return [...bytes].map(x => x.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(hex: string) { return new Uint8Array(hex.match(/.{2}/g)?.map(x => parseInt(x, 16)) || []); }
async function sha256(value: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export function passwordIterations(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < PBKDF2_LEGACY_ITERATIONS || parsed > PBKDF2_ITERATIONS) return PBKDF2_LEGACY_ITERATIONS;
  return parsed;
}

export async function passwordHash(password: string, saltHex?: string, iterations = PBKDF2_ITERATIONS) {
  const workFactor=passwordIterations(iterations);
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: workFactor }, key, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt), iterations: workFactor };
}

export function validPassword(password: string) {
  return password.length >= 12 && password.length <= 128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || "";
}

function forwardedOrigin(req: NextRequest) {
  const proto = firstForwardedValue(req.headers.get("x-forwarded-proto")).toLowerCase();
  const host = firstForwardedValue(req.headers.get("x-forwarded-host"));
  if ((proto !== "http" && proto !== "https") || !host) return null;
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

export function requestIsSecure(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || forwardedOrigin(req)?.startsWith("https://") === true;
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }
  const proxiedOrigin = forwardedOrigin(req);
  return normalizedOrigin === req.nextUrl.origin || (!!proxiedOrigin && normalizedOrigin === proxiedOrigin);
}

export async function actor(req: NextRequest): Promise<Actor | null> {
  const platformEmail = req.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const { env } = await import("cloudflare:workers");
  const trustPlatformIdentity = ["true", "1"].includes(String((env as unknown as Record<string, unknown>).FORNOST_TRUST_PLATFORM_IDENTITY ?? "").trim().toLowerCase());
  if (platformEmail && trustPlatformIdentity) {
    const db = await identityDb();
    const mapped = await db.prepare("SELECT id,name,email,role,status FROM local_users WHERE email=?").bind(platformEmail).first<{id:string;name:string;email:string;role:string;status:string}>();
    if (mapped?.status === "Active") return { id:mapped.id, email:mapped.email, name:mapped.name, role:mapped.role as AppRole, source:"entra", moduleAccess:await readModuleAccess(db,mapped.id) };
    if (mapped) return null; // A disabled mapped account must not fall back to an unmapped Viewer.
    const admins = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin'").first<{total:number}>();
    if (!admins?.total) return null;
    return { id:`platform:${platformEmail}`, email:platformEmail, name:platformEmail, role:"Viewer", source:"entra" };
  }
  const token = req.cookies.get("fornost_session")?.value;
  if (!token) return null;
  const db = await identityDb(), now = new Date().toISOString(), tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,s.expires_at,s.created_at,p.config_json
    FROM local_sessions s JOIN local_users u ON u.id=s.user_id LEFT JOIN platform_settings p ON p.id='default' WHERE s.id_hash=?`).bind(tokenHash).first<{id:string;name:string;email:string;role:string;status:string;expires_at:string;created_at:string;config_json:string|null}>();
  if (!row || row.status !== "Active") return null;
  const minutes = sessionTimeoutMinutes(row.config_json);
  if (sessionExpired(row.created_at, row.expires_at, minutes, Date.parse(now))) {
    await db.prepare("DELETE FROM local_sessions WHERE id_hash=?").bind(tokenHash).run();
    return null;
  }
  await db.prepare("UPDATE local_sessions SET last_seen_at=? WHERE id_hash=?").bind(now, tokenHash).run();
  return { id: row.id, email: row.email, name: row.name, role: row.role as AppRole, source: "local", moduleAccess: await readModuleAccess(db, row.id) };
}

export async function requireRole(req: NextRequest, roles: AppRole[]) {
  const current = await actor(req);
  if (!current) return { response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
  if (!roles.includes(current.role)) return { response: NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  if (!sameOrigin(req)) return { response: NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 }) };
  const path = req.nextUrl.pathname;
  const apiPath = BASE_PATH && path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
  if (!scopedApiAllowed(current, apiPath, req.method)) return { response: NextResponse.json({ error: "Bu çalışma alanı için modül erişiminiz yok." }, { status: 403 }) };
  return { actor: current };
}

async function readSessionTimeout(db: Awaited<ReturnType<typeof identityDb>>) {
  const row = await db.prepare("SELECT config_json FROM platform_settings WHERE id='default'").first<{config_json:string}>();
  return sessionTimeoutMinutes(row?.config_json);
}

export async function createSession(db: Awaited<ReturnType<typeof identityDb>>, userId: string) {
  const minutes = await readSessionTimeout(db);
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32))), now = new Date(), expires = new Date(now.getTime() + minutes * 60_000);
  await cleanupExpiredSessions(db, now.toISOString());
  await db.prepare("INSERT INTO local_sessions VALUES(?,?,?,?,?)").bind(await sha256(token), userId, expires.toISOString(), now.toISOString(), now.toISOString()).run();
  return { token, expires };
}

export async function destroySession(req: NextRequest) {
  const token = req.cookies.get("fornost_session")?.value;
  if (token) await (await identityDb()).prepare("DELETE FROM local_sessions WHERE id_hash=?").bind(await sha256(token)).run();
}
