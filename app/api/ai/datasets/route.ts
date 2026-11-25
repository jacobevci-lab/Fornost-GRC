import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  datasetAttention,
  datasetBlockers,
  validateDataset,
} from "@/app/ai/dataset-governance";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
const json = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "cache-control": "no-store" },
    }),
  cell = (v: unknown) => {
    const raw = String(v ?? ""),
      safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  },
  map = (r: Record<string, unknown>) => ({
    id: r.id,
    modelId: r.model_id,
    name: r.name,
    version: r.version,
    purpose: r.purpose,
    sourceType: r.source_type,
    sourceOwner: r.source_owner,
    provenance: r.provenance,
    license: r.license,
    legalBasis: r.legal_basis,
    dataClassification: r.data_classification,
    personalData: !!r.personal_data,
    specialCategory: !!r.special_category,
    consentRequired: !!r.consent_required,
    consentVerified: !!r.consent_verified,
    retentionDays: Number(r.retention_days),
    records: Number(r.records),
    qualityScore: Number(r.quality_score),
    biasScore: Number(r.bias_score),
    documentation: r.documentation,
    reviewDate: r.review_date,
    status: r.status,
    blockers: JSON.parse(String(r.blockers_json || "[]")),
    decisionNote: r.decision_note,
    createdBy: r.created_by,
    approvedBy: r.approved_by,
    attention: datasetAttention(String(r.status), String(r.review_date)),
  });
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, result] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,status FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_datasets ORDER BY review_date,status,name LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (result.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const data = [
      [
        "Veri seti",
        "Model",
        "Ad",
        "Sürüm",
        "Amaç",
        "Kaynak",
        "Sınıf",
        "Lisans",
        "Hukuki dayanak",
        "Kalite",
        "Bias",
        "İnceleme",
        "Durum",
        "Engeller",
      ],
      ...rows.map((x) => [
        x.id,
        x.modelId,
        x.name,
        x.version,
        x.purpose,
        x.sourceType,
        x.dataClassification,
        x.license,
        x.legalBasis,
        x.qualityScore,
        x.biasScore,
        x.reviewDate,
        x.status,
        x.blockers.join("; "),
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((r) => r.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=fornost-ai-datasets.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    datasets: rows,
    summary: {
      total: rows.length,
      approved: rows.filter(
        (x) => x.status === "approved" && x.attention !== "overdue",
      ).length,
      blocked: rows.filter((x) => x.blockers.length).length,
      overdue: rows.filter((x) => x.attention === "overdue").length,
      personal: rows.filter((x) => x.personalData).length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 32768)
    return json({ error: "Veri seti kaydı çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateDataset(body);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Veri seti geçersiz." },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    model = await DB.prepare(
      "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(v.modelId)
      .first();
  if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
  const blockers = datasetBlockers(v),
    id = `AIDS-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_datasets(id,model_id,name,version,purpose,source_type,source_owner,provenance,license,legal_basis,data_classification,personal_data,special_category,consent_required,consent_verified,retention_days,records,quality_score,bias_score,documentation,review_date,status,blockers_json,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?)",
    )
      .bind(
        id,
        v.modelId,
        v.name,
        v.version,
        v.purpose,
        v.sourceType,
        v.sourceOwner,
        v.provenance,
        v.license,
        v.legalBasis,
        v.dataClassification,
        v.personalData ? 1 : 0,
        v.specialCategory ? 1 : 0,
        v.consentRequired ? 1 : 0,
        v.consentVerified ? 1 : 0,
        v.retentionDays,
        v.records,
        v.qualityScore,
        v.biasScore,
        v.documentation,
        v.reviewDate,
        JSON.stringify(blockers),
        access.actor.email,
        now,
        access.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Aynı model, veri seti ve sürüm zaten kayıtlı." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-dataset-create",
    contextRefs: [v.modelId],
    status: blockers.length ? "denied" : "success",
    detail: `${id}; ${v.purpose}; blockers ${blockers.join(",") || "none"}`,
  });
  return json({ id, blockers }, 201);
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 40);
  if (!["approved", "rejected", "retired"].includes(status) || note.length < 5)
    return json({ error: "Geçerli karar ve gerekçe zorunludur." }, 400);
  const phrases: Record<string, string> = {
    approved: "VERİ SETİNİ ONAYLA",
    rejected: "VERİ SETİNİ REDDET",
    retired: "VERİ SETİNİ EMEKLİ ET",
  };
  if (confirmation !== phrases[status])
    return json({ error: `Onay metni: ${phrases[status]}` }, 400);
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,status,blockers_json,review_date,created_by FROM ai_datasets WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Veri seti bulunamadı." }, 404);
  if (status === "approved") {
    if (row.created_by === access.actor.email)
      return json(
        { error: "Kaydı oluşturan kişi aynı veri setini onaylayamaz." },
        409,
      );
    const blockers = JSON.parse(String(row.blockers_json || "[]"));
    if (blockers.length)
      return json(
        { error: "Kontrol engelleri giderilmeden onay verilemez.", blockers },
        409,
      );
    if (String(row.review_date) < new Date().toISOString().slice(0, 10))
      return json(
        { error: "İnceleme tarihi geçmiş veri seti onaylanamaz." },
        409,
      );
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_datasets SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(
      status,
      note,
      status === "approved" ? access.actor.email : null,
      status === "approved" ? now : null,
      access.actor.email,
      now,
      id,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-dataset-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed`,
  });
  return json({ ok: true });
}
