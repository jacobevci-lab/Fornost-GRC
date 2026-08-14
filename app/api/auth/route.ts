import { NextRequest, NextResponse } from "next/server";
import { actor, constantTimeEqual, createSession, demoAccount, destroySession, ensureDemoUser, identityDb, passwordHash, sameOrigin, validPassword } from "./security";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, "") || "";
const cookie = (req: NextRequest) => ({ httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "strict" as const, path: configuredBasePath || "/", maxAge: 8 * 3600 });
const normalize = (v: unknown) => String(v || "").trim();

async function demoMode(req: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const configured = String((env as unknown as Record<string, unknown>).NEXORA_DEMO_MODE ?? "").trim().toLowerCase();
  if (configured) return configured === "true" || configured === "1";
  return req.nextUrl.hostname.endsWith(".chatgpt.site");
}

export async function GET(req: NextRequest) {
  const db = await identityDb(), current = await actor(req);
  const allowDemo = await demoMode(req);
  if (allowDemo) await ensureDemoUser(db);
  const count = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin' AND status='Active'").first<{ total: number }>();
  return NextResponse.json({ authenticated: !!current, user: current, bootstrapRequired: !count?.total, demoAccount:allowDemo?{email:demoAccount.email,role:demoAccount.role}:null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const body = await req.json().catch(() => ({})), action = normalize(body.action), db = await identityDb();
  if (action === "logout") {
    await destroySession(req); const res = NextResponse.json({ ok: true }); res.cookies.set("odine_session", "", { ...cookie(req), maxAge: 0 }); return res;
  }
  if (action === "demo_login") {
    if (!(await demoMode(req))) return NextResponse.json({ error: "Demo girişi bu kurulumda etkin değil." }, { status: 403 });
    await ensureDemoUser(db);
    const demo = await db.prepare("SELECT id,status FROM local_users WHERE email=?").bind(demoAccount.email).first<{id:string;status:string}>();
    if (!demo || demo.status !== "Active") return NextResponse.json({ error: "Demo hesabı kullanılamıyor." }, { status: 503 });
    const session = await createSession(db, demo.id), res = NextResponse.json({ ok: true });
    res.cookies.set("odine_session", session.token, cookie(req));
    return res;
  }
  const email = normalize(body.email).toLowerCase(), password = normalize(body.password);
  if (action === "bootstrap") {
    const count = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin' AND status='Active'").first<{ total: number }>();
    if (count?.total) return NextResponse.json({ error: "İlk yönetici hesabı zaten oluşturulmuş." }, { status: 409 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(password)) return NextResponse.json({ error: "Geçerli e-posta ve en az 12 karakterlik güçlü parola gerekli." }, { status: 400 });
    const now = new Date().toISOString(), id = crypto.randomUUID(), p = await passwordHash(password);
    await db.prepare("INSERT INTO local_users(id,name,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,?,?,'Admin','Active',?,?)").bind(id, normalize(body.name) || email, email, p.hash, p.salt, now, now).run();
    const session = await createSession(db, id), res = NextResponse.json({ ok: true }); res.cookies.set("odine_session", session.token, cookie(req)); return res;
  }
  if (action !== "login") return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
  const row = await db.prepare("SELECT * FROM local_users WHERE email=?").bind(email).first<{id:string;status:string;locked_until:string|null;password_salt:string;password_hash:string;failed_attempts:number}>();
  const now = new Date(), generic = NextResponse.json({ error: "E-posta veya parola hatalı." }, { status: 401 });
  if (!row || row.status !== "Active" || (row.locked_until && new Date(row.locked_until) > now)) return generic;
  const candidate = await passwordHash(password, row.password_salt);
  if (!constantTimeEqual(candidate.hash, row.password_hash)) {
    const attempts = Number(row.failed_attempts || 0) + 1, locked = attempts >= 5 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null;
    await db.prepare("UPDATE local_users SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?").bind(locked ? 0 : attempts, locked, now.toISOString(), row.id).run(); return generic;
  }
  await db.prepare("UPDATE local_users SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?").bind(now.toISOString(), row.id).run();
  const session = await createSession(db, row.id), res = NextResponse.json({ ok: true }); res.cookies.set("odine_session", session.token, cookie(req)); return res;
}
