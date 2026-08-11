import { NextRequest, NextResponse } from "next/server";
import { identityDb, passwordHash, requireRole, validPassword } from "../auth/security";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  const rows = await (await identityDb()).prepare("SELECT id,name,email,role,status,failed_attempts,locked_until,created_at FROM local_users ORDER BY created_at DESC").all();
  return NextResponse.json({ users: rows.results }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const body = await req.json().catch(() => ({})), email = String(body.email || "").trim().toLowerCase(), password = String(body.password || ""), role = String(body.role || "Viewer");
  const name = String(body.name || email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || !validPassword(password) || !["Admin","Editor","Viewer"].includes(role)) return NextResponse.json({ error: "Hesap bilgileri veya parola politikası geçersiz." }, { status: 400 });
  const db = await identityDb(), p = await passwordHash(password), now = new Date().toISOString();
  try {
    await db.prepare("INSERT INTO local_users(id,name,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?, 'Active',?,?)").bind(crypto.randomUUID(), name, email, p.hash, p.salt, role, now, now).run();
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
  await db.prepare("UPDATE local_users SET role=?,status=?,updated_at=? WHERE id=?").bind(role, status, new Date().toISOString(), body.id).run();
  return NextResponse.json({ ok: true });
}
