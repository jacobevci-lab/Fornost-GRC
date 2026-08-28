import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { soc2TemplateControls, soc2TemplateMeta } from "../grc/soc2-template";

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

const iso27001Refs = [
  ...Array.from({ length: 37 }, (_, index) => `A.5.${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `A.6.${index + 1}`),
  ...Array.from({ length: 14 }, (_, index) => `A.7.${index + 1}`),
  ...Array.from({ length: 34 }, (_, index) => `A.8.${index + 1}`),
];

function auditTemplateRows(audit: Record<string, unknown>) {
  const template = String(audit.template || ""), name = String(audit.name || ""), nowDate = new Date().toISOString().slice(0, 10);
  const common = {
    auditName: name,
    auditType: String(audit.audit_type || ""),
    auditor: String(audit.auditor || ""),
    auditOwner: String(audit.audit_owner || ""),
    startDate: nowDate,
    endDate: nowDate,
    dueDate: nowDate,
    status: "Başlanmadı",
    progress: 0,
    evidenceStatus: "Kanıt Bekleniyor",
    followUpOwner: String(audit.audit_owner || ""),
    recordKind: "ControlAssessment",
  };
  if (template.startsWith("SOC 2")) return soc2TemplateControls.map((control) => ({
    ...common,
    frameworkTemplate: soc2TemplateMeta.name,
    requirementRef: control.tscId,
    requirementTitle: control.expectation,
    controlRef: control.tscId,
    owner: control.controlOwner,
    businessUnit: control.controlOwner.split("/")[0].trim() || "Bilgi Güvenliği",
    frequency: control.frequency,
    scopeCategory: control.tscCategory.split("/")[0].trim(),
    expectedEvidence: control.expectedEvidence,
    typeIITestApproach: control.typeIITestApproach,
    isoAnnex: control.isoAnnex,
    isoClauses: control.isoClauses,
    designEffectiveness: "Test Bekliyor",
    operatingEffectiveness: "Test Bekliyor",
    auditorResult: "Bekliyor",
  }));
  if (template.startsWith("ISO/IEC 27001")) return iso27001Refs.map((ref) => ({
    ...common,
    frameworkTemplate: "ISO/IEC 27001:2022 Annex A",
    requirementRef: ref,
    requirementTitle: `ISO/IEC 27001:2022 ${ref} kontrolü`,
    controlRef: ref,
    owner: String(audit.audit_owner || "Bilgi Güvenliği"),
    businessUnit: "Bilgi Güvenliği",
    scopeCategory: ref.startsWith("A.5.") ? "Organizasyonel" : ref.startsWith("A.6.") ? "İnsan" : ref.startsWith("A.7.") ? "Fiziksel" : "Teknolojik",
  }));
  return [];
}

async function ensureTemplateRows(d: Awaited<ReturnType<typeof db>>, audit: Record<string, unknown>, now: string) {
  const count = await d.prepare("SELECT COUNT(*) AS total FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(String(audit.name)).first<{ total: number }>();
  if (Number(count?.total || 0) > 0) return 0;
  const rows = auditTemplateRows(audit);
  for (let index = 0; index < rows.length; index += 50) {
    await d.batch(rows.slice(index, index + 50).map((data, offset) => d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(`AUD-${String(audit.id).replace(/[^a-zA-Z0-9-]/g, "")}-${index + offset + 1}`, "Denetim Yönetimi", JSON.stringify(data), now, now)));
  }
  return rows.length;
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (auth.response) return auth.response;
  const d = await db(), result = await d.prepare("SELECT * FROM simple_audits ORDER BY updated_at DESC").all(), now = new Date().toISOString();
  for (const audit of result.results as Record<string, unknown>[]) await ensureTemplateRows(d, audit, now);
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
    const d = await db();
    await d.prepare("INSERT INTO simple_audits(id,name,template,audit_type,auditor,audit_owner,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id, name, template, text(body.auditType, 100) || "Diğer Denetim", text(body.auditor, 160), text(body.auditOwner, 160), text(body.status, 40) || "Planlandı", now, now).run();
    const audit = await d.prepare("SELECT * FROM simple_audits WHERE id=?").bind(id).first<Record<string, unknown>>();
    const insertedRequirements = audit ? await ensureTemplateRows(d, audit, now) : 0;
    return NextResponse.json({ ok: true, id, insertedRequirements }, { status: 201 });
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
