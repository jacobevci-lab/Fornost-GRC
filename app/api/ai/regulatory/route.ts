import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  regulatoryAttention,
  validateRegulatoryProfile,
} from "@/app/ai/regulatory";
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
  parse = (v: unknown) => {
    try {
      return JSON.parse(String(v || "[]"));
    } catch {
      return [];
    }
  },
  map = (r: Record<string, unknown>) => ({
    id: r.id,
    modelId: r.model_id,
    classification: r.classification,
    jurisdictions: r.jurisdictions,
    providerRole: !!r.provider_role,
    deployerRole: !!r.deployer_role,
    importerRole: !!r.importer_role,
    distributorRole: !!r.distributor_role,
    personalData: !!r.personal_data,
    automatedDecision: !!r.automated_decision,
    publicInteraction: !!r.public_interaction,
    highImpact: !!r.high_impact,
    owner: r.owner,
    legalReviewer: r.legal_reviewer,
    classificationRationale: r.classification_rationale,
    transparencyNotice: r.transparency_notice,
    humanOversight: r.human_oversight,
    obligations: parse(r.obligations_json),
    completedKeys: parse(r.completed_keys_json),
    gaps: parse(r.gaps_json),
    reviewDate: r.review_date,
    status: r.status,
    decisionNote: r.decision_note,
    createdBy: r.created_by,
    approvedBy: r.approved_by,
    attention: regulatoryAttention(String(r.status), String(r.review_date)),
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
        "SELECT * FROM ai_regulatory_profiles ORDER BY review_date,status LIMIT 500",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (result.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const data = [
      [
        "Profil",
        "Model",
        "Sınıf",
        "Ülkeler",
        "Roller",
        "Sahip",
        "Hukuk",
        "Yükümlülük",
        "Tamamlanan",
        "Açıklar",
        "İnceleme",
        "Durum",
      ],
      ...rows.map((x) => [
        x.id,
        x.modelId,
        x.classification,
        x.jurisdictions,
        [
          x.providerRole && "provider",
          x.deployerRole && "deployer",
          x.importerRole && "importer",
          x.distributorRole && "distributor",
        ]
          .filter(Boolean)
          .join("; "),
        x.owner,
        x.legalReviewer,
        x.obligations.map((o: { label: string }) => o.label).join("; "),
        x.completedKeys.join("; "),
        x.gaps.join("; "),
        x.reviewDate,
        x.status,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((r) => r.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-regulatory.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    profiles: rows,
    summary: {
      total: rows.length,
      approved: rows.filter(
        (x) => x.status === "approved" && x.attention !== "overdue",
      ).length,
      highRisk: rows.filter((x) =>
        ["high-risk", "gpai-systemic"].includes(x.classification),
      ).length,
      gaps: rows.reduce((n, x) => n + x.gaps.length, 0),
      overdue: rows.filter((x) => x.attention === "overdue").length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 32768)
    return json({ error: "Regülasyon profili çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateRegulatoryProfile(body);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Profil geçersiz." },
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
  const id = `AIRG-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_regulatory_profiles(id,model_id,classification,jurisdictions,provider_role,deployer_role,importer_role,distributor_role,personal_data,automated_decision,public_interaction,high_impact,owner,legal_reviewer,classification_rationale,transparency_notice,human_oversight,obligations_json,completed_keys_json,gaps_json,review_date,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
    )
      .bind(
        id,
        v.modelId,
        v.classification,
        v.jurisdictions,
        v.providerRole ? 1 : 0,
        v.deployerRole ? 1 : 0,
        v.importerRole ? 1 : 0,
        v.distributorRole ? 1 : 0,
        v.personalData ? 1 : 0,
        v.automatedDecision ? 1 : 0,
        v.publicInteraction ? 1 : 0,
        v.highImpact ? 1 : 0,
        v.owner,
        v.legalReviewer,
        v.classificationRationale,
        v.transparencyNotice,
        v.humanOversight,
        JSON.stringify(v.obligations),
        JSON.stringify(v.completedKeys),
        JSON.stringify(v.gaps),
        v.reviewDate,
        access.actor.email,
        now,
        access.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Bu AI modeli için regülasyon profili zaten var." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-regulatory-classify",
    contextRefs: [v.modelId],
    status: v.gaps.length ? "denied" : "success",
    detail: `${id}; ${v.classification}; gaps ${v.gaps.length}`,
  });
  return json({ id, obligations: v.obligations, gaps: v.gaps }, 201);
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 50);
  if (!["approved", "rejected", "retired"].includes(status) || note.length < 5)
    return json({ error: "Geçerli karar ve gerekçe zorunludur." }, 400);
  const phrases: Record<string, string> = {
    approved: "SINIFLANDIRMAYI ONAYLA",
    rejected: "SINIFLANDIRMAYI REDDET",
    retired: "PROFİLİ EMEKLİ ET",
  };
  if (confirmation !== phrases[status])
    return json({ error: `Onay metni: ${phrases[status]}` }, 400);
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,created_by,gaps_json,review_date FROM ai_regulatory_profiles WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Regülasyon profili bulunamadı." }, 404);
  if (status === "approved") {
    if (row.created_by === access.actor.email)
      return json(
        { error: "Profili oluşturan kişi aynı sınıflandırmayı onaylayamaz." },
        409,
      );
    const gaps = parse(row.gaps_json);
    if (gaps.length)
      return json(
        { error: "Açık yükümlülükler kapatılmadan onay verilemez.", gaps },
        409,
      );
    if (String(row.review_date) < new Date().toISOString().slice(0, 10))
      return json({ error: "İnceleme tarihi geçmiş profil onaylanamaz." }, 409);
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_regulatory_profiles SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
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
    action: `ai-regulatory-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed`,
  });
  return json({ ok: true });
}
