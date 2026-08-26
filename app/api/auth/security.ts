import { NextRequest, NextResponse } from "next/server";

export type AppRole = "Admin" | "Editor" | "Viewer";
export type Actor = { id: string; email: string; name: string; role: AppRole; source: "local" | "entra" };

const usersSql = `CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`;
const sessionsSql = `CREATE TABLE IF NOT EXISTS local_sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`;

export async function identityDb() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([env.DB.prepare(usersSql), env.DB.prepare(sessionsSql)]);
  return env.DB;
}

export const demoAccount={name:"Fornost Demo Editor",email:"demo@fornost.test",role:"Editor" as const};

export async function ensureDemoUser(db: Awaited<ReturnType<typeof identityDb>>){
 const existing=await db.prepare("SELECT id FROM local_users WHERE email=?").bind(demoAccount.email).first<{id:string}>();
 if(existing)return;
 const oneTimeSecret=`${bytesToHex(crypto.getRandomValues(new Uint8Array(24)))}Aa1!`;
 const p=await passwordHash(oneTimeSecret),now=new Date().toISOString();
 await db.prepare("INSERT INTO local_users(id,name,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'Active',?,?)").bind("demo-editor",demoAccount.name,demoAccount.email,p.hash,p.salt,demoAccount.role,now,now).run();
}

function bytesToHex(bytes: Uint8Array) { return [...bytes].map(x => x.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(hex: string) { return new Uint8Array(hex.match(/.{2}/g)?.map(x => parseInt(x, 16)) || []); }
async function sha256(value: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export const PBKDF2_ITERATIONS=100_000;

export async function passwordHash(password: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
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

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
}

export async function actor(req: NextRequest): Promise<Actor | null> {
  const platformEmail = req.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const { env } = await import("cloudflare:workers");
  const trustPlatformIdentity = ["true", "1"].includes(String((env as unknown as Record<string, unknown>).FORNOST_TRUST_PLATFORM_IDENTITY ?? "").trim().toLowerCase());
  if (platformEmail && trustPlatformIdentity) {
    const db = await identityDb();
    const mapped = await db.prepare("SELECT id,name,email,role,status FROM local_users WHERE email=?").bind(platformEmail).first<{id:string;name:string;email:string;role:string;status:string}>();
    if (mapped?.status === "Active") return { id:mapped.id, email:mapped.email, name:mapped.name, role:mapped.role as AppRole, source:"entra" };
    const admins = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin'").first<{total:number}>();
    if (!admins?.total) return null;
    return { id:`platform:${platformEmail}`, email:platformEmail, name:platformEmail, role:"Viewer", source:"entra" };
  }
  const token = req.cookies.get("fornost_session")?.value;
  if (!token) return null;
  const db = await identityDb(), now = new Date().toISOString(), tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,s.expires_at
    FROM local_sessions s JOIN local_users u ON u.id=s.user_id WHERE s.id_hash=?`).bind(tokenHash).first<{id:string;name:string;email:string;role:string;status:string;expires_at:string}>();
  if (!row || row.status !== "Active" || row.expires_at <= now) return null;
  await db.prepare("UPDATE local_sessions SET last_seen_at=? WHERE id_hash=?").bind(now, tokenHash).run();
  return { id: row.id, email: row.email, name: row.name, role: row.role as AppRole, source: "local" };
}

export async function requireRole(req: NextRequest, roles: AppRole[]) {
  const current = await actor(req);
  if (!current) return { response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
  if (!roles.includes(current.role)) return { response: NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  if (!sameOrigin(req)) return { response: NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 }) };
  return { actor: current };
}

export async function createSession(db: Awaited<ReturnType<typeof identityDb>>, userId: string) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32))), now = new Date(), expires = new Date(now.getTime() + 8 * 3600_000);
  await db.prepare("DELETE FROM local_sessions WHERE expires_at<=?").bind(now.toISOString()).run();
  await db.prepare("INSERT INTO local_sessions VALUES(?,?,?,?,?)").bind(await sha256(token), userId, expires.toISOString(), now.toISOString(), now.toISOString()).run();
  return { token, expires };
}

export async function destroySession(req: NextRequest) {
  const token = req.cookies.get("fornost_session")?.value;
  if (token) await (await identityDb()).prepare("DELETE FROM local_sessions WHERE id_hash=?").bind(await sha256(token)).run();
}
