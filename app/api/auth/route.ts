import { NextRequest, NextResponse } from "next/server";
import { actor, constantTimeEqual, createSession, demoAccount, destroySession, ensureDemoUser, identityDb, passwordHash, passwordIterations, PBKDF2_ITERATIONS, PBKDF2_LEGACY_ITERATIONS, requestIsSecure, sameOrigin, validPassword } from "./security";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, "") || "";
const bootstrapCookieName = "fornost_bootstrap_auth";
const bootstrapContext = "fornost-bootstrap-v1";
const cookie = (req: NextRequest) => ({ httpOnly: true, secure: requestIsSecure(req), sameSite: "strict" as const, path: configuredBasePath || "/", maxAge: 8 * 3600 });
const bootstrapCookie = (req: NextRequest) => ({ ...cookie(req), maxAge: 15 * 60 });
const normalize = (v: unknown) => String(v || "").trim();

async function runtimeEnvValue(name: string) {
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>)[name];
    if (value !== undefined && value !== null) return String(value).trim();
  } catch {
    // Node-based tests and local build validation may not expose cloudflare:workers.
  }
  return String(process.env[name] || "").trim();
}

async function expectedBootstrapToken() {
  const explicit = await runtimeEnvValue("FORNOST_BOOTSTRAP_TOKEN");
  if (explicit) return explicit;
  const settingsKey = await runtimeEnvValue("FORNOST_SETTINGS_ENCRYPTION_KEY");
  if (!settingsKey) return "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${bootstrapContext}:${settingsKey}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bootstrapAuthorized(req: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;
  const expected = await expectedBootstrapToken();
  if (!expected) return false;
  return constantTimeEqual(req.cookies.get(bootstrapCookieName)?.value || "", expected);
}

async function demoMode(req: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;
  const configured = (await runtimeEnvValue("FORNOST_DEMO_MODE")).toLowerCase();
  if (configured) return configured === "true" || configured === "1";
  return req.nextUrl.hostname.endsWith(".chatgpt.site");
}

export async function GET(req: NextRequest) {
  const db = await identityDb(), current = await actor(req);
  const allowDemo = await demoMode(req);
  if (allowDemo) await ensureDemoUser(db);
  const count = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin'").first<{ total: number }>();
  const bootstrapRequired = !count?.total;
  const authorized = bootstrapRequired ? await bootstrapAuthorized(req) : false;
  const bootstrapProtectionConfigured = process.env.NODE_ENV === "development" || !!(await expectedBootstrapToken());
  return NextResponse.json({
    authenticated: !!current,
    user: current,
    bootstrapRequired,
    bootstrapAuthorizationRequired: bootstrapRequired && !allowDemo && !authorized,
    bootstrapProtectionConfigured,
    demoAccount: allowDemo ? { email: demoAccount.email, role: demoAccount.role } : null,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const body = await req.json().catch(() => ({})), action = normalize(body.action), db = await identityDb();
  if (action === "logout") {
    await destroySession(req); const res = NextResponse.json({ ok: true }); res.cookies.set("fornost_session", "", { ...cookie(req), maxAge: 0 }); return res;
  }
  if (action === "authorize_bootstrap") {
    const count = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin'").first<{ total: number }>();
    if (count?.total) return NextResponse.json({ error: "İlk yönetici hesabı zaten oluşturulmuş." }, { status: 409 });
    if (process.env.NODE_ENV === "development") return NextResponse.json({ ok: true });
    const expected = await expectedBootstrapToken();
    if (!expected) return NextResponse.json({ error: "Güvenli ilk kurulum anahtarı yapılandırılmamış. FORNOST_BOOTSTRAP_TOKEN veya FORNOST_SETTINGS_ENCRYPTION_KEY gerekli." }, { status: 503 });
    const presented = normalize(body.token);
    if (!presented || presented.length > 512 || !constantTimeEqual(presented, expected)) {
      return NextResponse.json({ error: "Kurulum kodu doğrulanamadı." }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(bootstrapCookieName, expected, bootstrapCookie(req));
    return res;
  }
  if (action === "demo_login") {
    if (!(await demoMode(req))) return NextResponse.json({ error: "Demo girişi bu kurulumda etkin değil." }, { status: 403 });
    await ensureDemoUser(db);
    const demo = await db.prepare("SELECT id,status FROM local_users WHERE email=?").bind(demoAccount.email).first<{id:string;status:string}>();
    if (!demo || demo.status !== "Active") return NextResponse.json({ error: "Demo hesabı kullanılamıyor." }, { status: 503 });
    const session = await createSession(db, demo.id), res = NextResponse.json({ ok: true });
    res.cookies.set("fornost_session", session.token, cookie(req));
    return res;
  }
  const email = normalize(body.email).toLowerCase(), password = normalize(body.password);
  if (action === "bootstrap") {
    const count = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin'").first<{ total: number }>();
    if (count?.total) return NextResponse.json({ error: "İlk yönetici hesabı zaten oluşturulmuş." }, { status: 409 });
    if (!(await bootstrapAuthorized(req))) return NextResponse.json({ error: "İlk kurulum yetkilendirmesi gerekli. Sunucuda scripts/linux/setup-token.sh komutuyla kurulum kodunu alın ve /setup ekranından doğrulayın." }, { status: 403 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(password)) return NextResponse.json({ error: "Geçerli e-posta ve en az 12 karakterlik güçlü parola gerekli." }, { status: 400 });
    const now = new Date().toISOString(), id = "bootstrap-admin", p = await passwordHash(password);
    try {
      await db.prepare("INSERT INTO local_users(id,name,email,password_hash,password_salt,password_iterations,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'Admin','Active',?,?)").bind(id, normalize(body.name) || email, email, p.hash, p.salt, p.iterations, now, now).run();
    } catch {
      return NextResponse.json({ error: "İlk yönetici hesabı başka bir oturum tarafından oluşturuldu." }, { status: 409 });
    }
    const session = await createSession(db, id), res = NextResponse.json({ ok: true });
    res.cookies.set("fornost_session", session.token, cookie(req));
    res.cookies.set(bootstrapCookieName, "", { ...bootstrapCookie(req), maxAge: 0 });
    return res;
  }
  if (action !== "login") return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
  const row = await db.prepare("SELECT * FROM local_users WHERE email=?").bind(email).first<{id:string;status:string;locked_until:string|null;password_salt:string;password_hash:string;password_iterations:number|null;failed_attempts:number}>();
  const now = new Date(), generic = NextResponse.json({ error: "E-posta veya parola hatalı." }, { status: 401 });
  if (!row || row.status !== "Active" || (row.locked_until && new Date(row.locked_until) > now)) return generic;
  const storedIterations = passwordIterations(row.password_iterations ?? PBKDF2_LEGACY_ITERATIONS);
  const candidate = await passwordHash(password, row.password_salt, storedIterations);
  if (!constantTimeEqual(candidate.hash, row.password_hash)) {
    const attempts = Number(row.failed_attempts || 0) + 1, locked = attempts >= 5 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null;
    await db.prepare("UPDATE local_users SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?").bind(locked ? 0 : attempts, locked, now.toISOString(), row.id).run(); return generic;
  }
  if (storedIterations < PBKDF2_ITERATIONS) {
    const upgraded=await passwordHash(password);
    await db.prepare("UPDATE local_users SET password_hash=?,password_salt=?,password_iterations=?,failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?").bind(upgraded.hash,upgraded.salt,upgraded.iterations,now.toISOString(),row.id).run();
  } else {
    await db.prepare("UPDATE local_users SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?").bind(now.toISOString(), row.id).run();
  }
  const session = await createSession(db, row.id), res = NextResponse.json({ ok: true }); res.cookies.set("fornost_session", session.token, cookie(req)); return res;
}
