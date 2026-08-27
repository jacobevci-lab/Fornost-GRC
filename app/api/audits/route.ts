import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";

const auditsTable = `CREATE TABLE IF NOT EXISTS simple_audits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL,
  audit_type TEXT NOT NULL,
  auditor TEXT NOT NULL,
  audit_owner TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const recordsTable = `CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const metadataTable = `CREATE TABLE IF NOT EXISTS simple_grc_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`;

type AuditInput = Record<string, unknown>;
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function db() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([env.DB.prepare(auditsTable), env.DB.prepare(recordsTable), env.DB.prepare(metadataTable)]);
  return env.DB;
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (auth.response) return auth.response;
  const result = await (await db()).prepare("SELECT * FROM simple_audits ORDER BY updated_at DESC").all();
  return NextResponse.json({ audits: result.results });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor"]);
  if (auth.response) return auth.response;
  try {
    const body = await req.json() as AuditInput;
    const name = text(body.name, 160), template = text(body.template, 160) || "Özel Denetim";
    if (name.length < 3) return NextResponse.json({ error: "Denetim adı en az 3 karakter olmalıdır." }, { status: 400 });
    const id = `AUDIT-${crypto.randomUUID()}`, now = new Date().toISOString();
    await (await db()).prepare("INSERT INTO simple_audits(id,name,template,audit_type,auditor,audit_owner,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id, name, template, text(body.auditType, 100) || "Diğer Denetim", text(body.auditor, 160), text(body.auditOwner, 160), text(body.status, 40) || "Planlandı", now, now).run();
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return NextResponse.json({ error: "Bu adla bir denetim zaten portföyde." }, { status: 409 });
    return NextResponse.json({ error: "Denetim oluşturulamadı." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id || id.length > 100) return NextResponse.json({ error: "Geçersiz denetim kimliği." }, { status: 400 });
  const d = await db(), audit = await d.prepare("SELECT * FROM simple_audits WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!audit) return NextResponse.json({ error: "Denetim bulunamadı." }, { status: 404 });
  const requirements = await d.prepare("SELECT id,data_json,created_at,updated_at FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(String(audit.name)).all();
  const now = new Date().toISOString();
  await d.batch([
    d.prepare("INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) VALUES(?,?,?)").bind(`audit_archive_${id}`, JSON.stringify({ audit, requirements: requirements.results, deletedAt: now, deletedBy: auth.actor?.email || "unknown" }), now),
    d.prepare("DELETE FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(String(audit.name)),
    d.prepare("DELETE FROM simple_audits WHERE id=?").bind(id),
  ]);
  return NextResponse.json({ ok: true, deletedRequirements: requirements.results.length });
}
