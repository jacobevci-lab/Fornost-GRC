import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { soc2TemplateControls, soc2TemplateMeta } from "../grc/soc2-template";
import { frameworkTemplateCatalogs } from "../grc/framework-catalogs";

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
const iso27001Titles = Object.fromEntries([
  ["5",["Bilgi güvenliği politikaları","Bilgi güvenliği rolleri ve sorumlulukları","Görevlerin ayrılığı","Yönetim sorumlulukları","Yetkili makamlarla iletişim","Özel ilgi gruplarıyla iletişim","Tehdit istihbaratı","Proje yönetiminde bilgi güvenliği","Bilgi ve diğer ilişkili varlıkların envanteri","Bilgi ve diğer ilişkili varlıkların kabul edilebilir kullanımı","Varlıkların iadesi","Bilginin sınıflandırılması","Bilginin etiketlenmesi","Bilgi aktarımı","Erişim kontrolü","Kimlik yönetimi","Kimlik doğrulama bilgileri","Erişim hakları","Tedarikçi ilişkilerinde bilgi güvenliği","Tedarikçi sözleşmelerinde bilgi güvenliğinin ele alınması","Bilgi ve iletişim teknolojileri tedarik zincirinde bilgi güvenliği","Tedarikçi hizmetlerinin izlenmesi, gözden geçirilmesi ve değişiklik yönetimi","Bulut hizmetlerinin kullanımında bilgi güvenliği","Bilgi güvenliği olay yönetimi planlaması ve hazırlığı","Bilgi güvenliği olaylarının değerlendirilmesi ve kararı","Bilgi güvenliği olaylarına müdahale","Bilgi güvenliği olaylarından öğrenme","Kanıtların toplanması","Kesinti sırasında bilgi güvenliği","İş sürekliliği için BİT hazırlığı","Yasal, düzenleyici ve sözleşmesel gereksinimler","Fikri mülkiyet hakları","Kayıtların korunması","Kişisel verilerin gizliliği ve korunması","Bilgi güvenliğinin bağımsız gözden geçirilmesi","Bilgi güvenliği politika ve standartlarına uyum","Belgelenmiş işletim prosedürleri"]],
  ["6",["İşe alım öncesi kontroller","İstihdam şartları ve koşulları","Bilgi güvenliği farkındalığı, eğitimi ve öğretimi","Disiplin süreci","İşten ayrılma veya görev değişikliği sonrası sorumluluklar","Gizlilik veya ifşa etmeme anlaşmaları","Uzaktan çalışma","Bilgi güvenliği olaylarının raporlanması"]],
  ["7",["Fiziksel güvenlik çevreleri","Fiziksel giriş","Ofislerin, odaların ve tesislerin güvenliği","Fiziksel güvenlik izleme","Fiziksel ve çevresel tehditlere karşı koruma","Güvenli alanlarda çalışma","Temiz masa ve temiz ekran","Ekipman yerleşimi ve korunması","Kuruluş dışındaki varlıkların güvenliği","Depolama ortamları","Destek altyapıları","Kablolama güvenliği","Ekipman bakımı","Ekipmanın güvenli imhası veya yeniden kullanımı"]],
  ["8",["Kullanıcı uç nokta cihazları","Ayrıcalıklı erişim hakları","Bilgiye erişim kısıtlaması","Kaynak koda erişim","Güvenli kimlik doğrulama","Kapasite yönetimi","Kötücül yazılımlara karşı koruma","Teknik zafiyetlerin yönetimi","Yapılandırma yönetimi","Bilginin silinmesi","Veri maskeleme","Veri sızıntısının önlenmesi","Bilginin yedeklenmesi","Bilgi işleme tesislerinin yedekliliği","Günlükleme","İzleme faaliyetleri","Saat senkronizasyonu","Ayrıcalıklı yardımcı programların kullanımı","Canlı sistemlere yazılım kurulumu","Ağ güvenliği","Ağ hizmetlerinin güvenliği","Ağların ayrıştırılması","Web filtreleme","Kriptografi kullanımı","Güvenli geliştirme yaşam döngüsü","Uygulama güvenliği gereksinimleri","Güvenli sistem mimarisi ve mühendislik ilkeleri","Güvenli kodlama","Geliştirme ve kabulde güvenlik testleri","Dış kaynaklı geliştirme","Geliştirme, test ve üretim ortamlarının ayrılması","Değişiklik yönetimi","Test bilgileri","Denetim testleri sırasında bilgi sistemlerinin korunması"]],
].flatMap(([group,titles]) => (titles as string[]).map((title,index) => [`A.${group}.${index+1}`,title])));

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
    requirementTitle: iso27001Titles[ref] || "",
    controlRef: ref,
    owner: String(audit.audit_owner || "Bilgi Güvenliği"),
    businessUnit: "Bilgi Güvenliği",
    scopeCategory: ref.startsWith("A.5.") ? "Organizasyonel" : ref.startsWith("A.6.") ? "İnsan" : ref.startsWith("A.7.") ? "Fiziksel" : "Teknolojik",
  }));
  const catalog = frameworkTemplateCatalogs[template];
  if (catalog) return catalog.map((requirement) => ({
    ...common,
    frameworkTemplate: template,
    requirementRef: requirement.ref,
    requirementTitle: requirement.title,
    controlRef: requirement.ref,
    owner: requirement.owner || String(audit.audit_owner || "Bilgi Güvenliği"),
    businessUnit: requirement.owner || "Bilgi Güvenliği",
    scopeCategory: requirement.category,
  }));
  return [];
}

async function ensureTemplateRows(d: Awaited<ReturnType<typeof db>>, audit: Record<string, unknown>, now: string) {
  const rows = auditTemplateRows(audit);
  if (!rows.length) return 0;
  const auditName = String(audit.name), template = String(audit.template || "");
  if (template.startsWith("PCI DSS")) {
    await d.prepare("DELETE FROM simple_grc_records WHERE id='AUD-006' AND module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(auditName).run();
  }
  const existing = await d.prepare("SELECT id,data_json FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(auditName).all<{ id: string; data_json: string }>();
  const parsed = existing.results.map((record) => ({ record, data: JSON.parse(record.data_json) as Record<string, unknown> }));
  const existingRefs = new Set(parsed.map(({ data }) => String(data.requirementRef || data.controlRef || "")).filter(Boolean));
  const titleByRef = new Map(rows.map((row) => [String(row.requirementRef), String(row.requirementTitle || "")]));
  const updates = parsed.flatMap(({ record, data }) => {
    const ref = String(data.requirementRef || data.controlRef || ""), title = titleByRef.get(ref);
    if (!title || String(data.requirementTitle || "").trim()) return [];
    data.requirementTitle = title;
    return [d.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(data), now, record.id)];
  });
  for (let index = 0; index < updates.length; index += 50) await d.batch(updates.slice(index, index + 50));
  const missing = rows.filter((row) => !existingRefs.has(String(row.requirementRef)));
  const safeAuditId = String(audit.id).replace(/[^a-zA-Z0-9-]/g, ""), safeRef = (value: unknown) => String(value).replace(/[^a-zA-Z0-9-]/g, "-");
  for (let index = 0; index < missing.length; index += 50) {
    await d.batch(missing.slice(index, index + 50).map((data) => d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(`AUD-${safeAuditId}-${safeRef(data.requirementRef)}`, "Denetim Yönetimi", JSON.stringify(data), now, now)));
  }
  return missing.length;
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
