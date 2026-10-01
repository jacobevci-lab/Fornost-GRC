import { NextRequest, NextResponse } from "next/server";
import { FULL_ACCESS, parseModuleAccess, validateModuleAccess } from "../../module-access";
import { readModuleAccess } from "./access-storage";
import { identityDb, passwordHash, requireRole, validPassword } from "../auth/security";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  const db = await identityDb();
  const rows = await db.prepare("SELECT u.id,u.name,u.email,u.role,u.status,u.failed_attempts,u.locked_until,u.created_at,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id ORDER BY u.created_at DESC").all<Record<string, unknown>>();
  const events = await db.prepare("SELECT e.id,e.user_id,e.actor,e.before_json,e.after_json,e.created_at,u.email FROM user_access_events e LEFT JOIN local_users u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT 20").all();
  return NextResponse.json({ users: rows.results.map(({policy_json,...user}) => ({...user,moduleAccess:parseModuleAccess(policy_json as string | null)})), events: events.results }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const body = await req.json().catch(() => ({})), email = String(body.email || "").trim().toLowerCase(), password = String(body.password || ""), role = String(body.role || "Viewer");
  const name = String(body.name || email).trim();
  const moduleAccess = body.moduleAccess === undefined ? FULL_ACCESS : validateModuleAccess(body.moduleAccess);
  if (!moduleAccess || (role === "Admin" && moduleAccess.mode !== "full")) return NextResponse.json({error:"Geçersiz modül erişimi. Yönetici erişimi tam olmalıdır."},{status:400});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || !validPassword(password) || !["Admin","Editor","Viewer"].includes(role)) return NextResponse.json({ error: "Hesap bilgileri veya parola politikası geçersiz." }, { status: 400 });
  const db = await identityDb(), p = await passwordHash(password), now = new Date().toISOString();
  try {
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO local_users(id,name,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?, 'Active',?,?)").bind(id, name, email, p.hash, p.salt, role, now, now),
      db.prepare("INSERT INTO user_module_access(user_id,policy_json,updated_at,updated_by) VALUES(?,?,?,?)").bind(id,JSON.stringify(moduleAccess),now,auth.actor.email),
      db.prepare("INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,auth.actor.email,"null",JSON.stringify({role,status:"Active",moduleAccess}),now),
    ]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch { return NextResponse.json({ error: "Bu e-posta ile hesap zaten mevcut." }, { status: 409 }); }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const body = await req.json().catch(() => ({})), role = String(body.role || ""), status = String(body.status || "");
  if (typeof body.id !== "string" || body.id.length > 100 || !["Admin","Editor","Viewer"].includes(role) || !["Active","Disabled"].includes(status)) return NextResponse.json({ error: "Geçersiz kullanıcı değişikliği." }, { status: 400 });
  const db = await identityDb();
  const target = await db.prepare("SELECT id,role,status FROM local_users WHERE id=?").bind(body.id).first<{id:string;role:string;status:string}>();
  if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  if (target.role === "Admin" && target.status === "Active" && (role !== "Admin" || status !== "Active")) {
    const admins = await db.prepare("SELECT COUNT(*) total FROM local_users WHERE role='Admin' AND status='Active'").first<{total:number}>();
    if (Number(admins?.total || 0) <= 1) return NextResponse.json({ error: "Son aktif yönetici devre dışı bırakılamaz veya rolü düşürülemez." }, { status: 409 });
  }
  const previousAccess = await readModuleAccess(db,body.id);
  const moduleAccess = body.moduleAccess === undefined ? (role === "Admin" ? FULL_ACCESS : previousAccess) : validateModuleAccess(body.moduleAccess);
  if (!moduleAccess || (role === "Admin" && moduleAccess.mode !== "full")) return NextResponse.json({error:"Geçersiz modül erişimi. Yönetici erişimi tam olmalıdır."},{status:400});
  const now = new Date().toISOString();
  const changed = role !== target.role || status !== target.status || JSON.stringify(moduleAccess) !== JSON.stringify(previousAccess);
  await db.batch([
    db.prepare("UPDATE local_users SET role=?,status=?,failed_attempts=CASE WHEN ?='Active' THEN 0 ELSE failed_attempts END,locked_until=CASE WHEN ?='Active' THEN NULL ELSE locked_until END,updated_at=? WHERE id=?").bind(role,status,status,status,now,body.id),
    db.prepare("INSERT INTO user_module_access(user_id,policy_json,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET policy_json=excluded.policy_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(body.id,JSON.stringify(moduleAccess),now,auth.actor.email),
    ...(changed ? [
      db.prepare("DELETE FROM local_sessions WHERE user_id=?").bind(body.id),
      db.prepare("INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),body.id,auth.actor.email,JSON.stringify({role:target.role,status:target.status,moduleAccess:previousAccess}),JSON.stringify({role,status,moduleAccess}),now),
    ] : []),
  ]);
  return NextResponse.json({ ok: true });
}
