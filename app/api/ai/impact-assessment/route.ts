import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  AI_IMPACT_TYPES,
  impactReviewState,
  validateImpactAssessment,
} from "@/app/ai/impact-assessment";
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
  bool = (v: unknown) => Boolean(v),
  parse = (v: unknown) => {
    try {
      return JSON.parse(String(v || "[]"));
    } catch {
      return [];
    }
  };
const map = (r: Record<string, unknown>) => ({
  id: r.id,
  modelId: r.model_id,
  riskId: r.risk_id,
  type: r.assessment_type,
  title: r.title,
  context: r.context,
  affectedGroups: r.affected_groups,
  jurisdictions: r.jurisdictions,
  necessity: r.necessity,
  proportionality: r.proportionality,
  mitigations: r.mitigations,
  monitoringPlan: r.monitoring_plan,
  consultation: r.consultation,
  owner: r.owner,
  dpo: r.dpo,
  privacy: Number(r.privacy),
  fundamentalRights: Number(r.fundamental_rights),
  safety: Number(r.safety),
  workforce: Number(r.workforce),
  vulnerableGroups: Number(r.vulnerable_groups),
  autonomy: Number(r.autonomy),
  scale: Number(r.scale),
  controlMaturity: Number(r.control_maturity),
  personalData: bool(r.personal_data),
  specialCategoryData: bool(r.special_category_data),
  automatedDecision: bool(r.automated_decision),
  children: bool(r.children),
  workers: bool(r.workers),
  publicServices: bool(r.public_services),
  hasTransparency: bool(r.has_transparency),
  hasHumanOversight: bool(r.has_human_oversight),
  hasAppeal: bool(r.has_appeal),
  dpoConsulted: bool(r.dpo_consulted),
  inherentScore: Number(r.inherent_score),
  residualScore: Number(r.residual_score),
  impactTier: r.impact_tier,
  criticalGaps: parse(r.critical_gaps),
  reviewDate: r.review_date,
  status: r.status,
  decisionNote: r.decision_note,
  createdBy: r.created_by,
  approvedBy: r.approved_by,
  reviewState: impactReviewState(String(r.status), String(r.review_date)),
});
async function links(db: D1Database, modelId: string, riskId: string) {
  if (
    !(await db
      .prepare("SELECT id FROM ai_model_inventory WHERE id=?")
      .bind(modelId)
      .first())
  )
    throw new Error("AI modeli bulunamadı.");
  if (
    riskId &&
    !(await db
      .prepare("SELECT id FROM ai_risks WHERE id=? AND model_id=?")
      .bind(riskId, modelId)
      .first())
  )
    throw new Error("Risk istisnası bu AI modeline ait değil.");
}
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, risks, items] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,status FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT id,model_id,title,status,acceptance_expiry FROM ai_risks WHERE treatment='accept' ORDER BY updated_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_impact_assessments ORDER BY residual_score DESC,updated_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (items.results || []).map(map),
    format = req.nextUrl.searchParams.get("format");
  if (format) {
    if (access.actor.role !== "Admin")
      return json(
        { error: "Etki kanıt paketi yalnız Admin tarafından alınabilir." },
        403,
      );
    if (format === "manifest")
      return json({
        generatedAt: new Date().toISOString(),
        generatedBy: access.actor.email,
        records: rows,
      });
    if (format === "csv") {
      const data = [
        [
          "Değerlendirme",
          "Model",
          "Tür",
          "Başlık",
          "Sorumlu",
          "Bölge",
          "Etkilenenler",
          "İçsel",
          "Artık",
          "Seviye",
          "Kritik açıklar",
          "Durum",
          "İnceleme",
        ],
        ...rows.map((r) => [
          r.id,
          r.modelId,
          r.type,
          r.title,
          r.owner,
          r.jurisdictions,
          r.affectedGroups,
          r.inherentScore,
          r.residualScore,
          r.impactTier,
          r.criticalGaps.join("; "),
          r.status,
          r.reviewDate,
        ]),
      ];
      return new NextResponse(
        `\uFEFF${data.map((row) => row.map(cell).join(",")).join("\n")}`,
        {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              "attachment; filename=fornost-ai-impact-assessments.csv",
          },
        },
      );
    }
  }
  return json({
    types: AI_IMPACT_TYPES,
    models: (models.results || []).map((r) => ({
      id: r.id,
      systemName: r.system_name,
      modelName: r.model_name,
      status: r.status,
    })),
    risks: risks.results || [],
    assessments: rows,
    summary: {
      total: rows.length,
      approved: rows.filter((r) => r.status === "approved").length,
      highImpact: rows.filter((r) =>
        ["Critical", "High"].includes(String(r.impactTier)),
      ).length,
      criticalGaps: rows.filter((r) => r.criticalGaps.length).length,
      overdue: rows.filter((r) => r.reviewState === "overdue").length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 48_000)
    return json({ error: "Etki değerlendirmesi çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateImpactAssessment(body);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Değerlendirme doğrulanamadı.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime();
  try {
    await links(DB, v.modelId, v.riskId);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "İlişki geçersiz." },
      409,
    );
  }
  const duplicate = await DB.prepare(
    "SELECT id FROM ai_impact_assessments WHERE model_id=? AND assessment_type=? AND status NOT IN ('suspended','rejected') LIMIT 1",
  )
    .bind(v.modelId, v.type)
    .first();
  if (duplicate)
    return json(
      { error: "Bu model ve değerlendirme türü için etkin kayıt zaten var." },
      409,
    );
  const id = `AII-${crypto.randomUUID()}`,
    now = new Date().toISOString(),
    flags = [
      v.personalData,
      v.specialCategoryData,
      v.automatedDecision,
      v.children,
      v.workers,
      v.publicServices,
      v.hasTransparency,
      v.hasHumanOversight,
      v.hasAppeal,
      v.dpoConsulted,
    ].map((x) => (x ? 1 : 0));
  await DB.prepare(
    "INSERT INTO ai_impact_assessments(id,model_id,risk_id,assessment_type,title,context,affected_groups,jurisdictions,necessity,proportionality,mitigations,monitoring_plan,consultation,owner,dpo,privacy,fundamental_rights,safety,workforce,vulnerable_groups,autonomy,scale,control_maturity,personal_data,special_category_data,automated_decision,children,workers,public_services,has_transparency,has_human_oversight,has_appeal,dpo_consulted,inherent_score,residual_score,impact_tier,critical_gaps,review_date,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
  )
    .bind(
      id,
      v.modelId,
      v.riskId || null,
      v.type,
      v.title,
      v.context,
      v.affectedGroups,
      v.jurisdictions,
      v.necessity,
      v.proportionality,
      v.mitigations,
      v.monitoringPlan,
      v.consultation,
      v.owner,
      v.dpo,
      v.privacy,
      v.fundamentalRights,
      v.safety,
      v.workforce,
      v.vulnerableGroups,
      v.autonomy,
      v.scale,
      v.controlMaturity,
      ...flags,
      v.inherent,
      v.residual,
      v.tier,
      JSON.stringify(v.criticalGaps),
      v.reviewDate,
      access.actor.email,
      now,
      access.actor.email,
      now,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-impact-create",
    contextRefs: [v.modelId],
    status: "success",
    detail: `${id}; ${v.type}; residual ${v.residual} ${v.tier}; gaps ${v.criticalGaps.join(",") || "none"}`,
  });
  return json({ id, residualScore: v.residual, impactTier: v.tier }, 201);
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 35);
  if (
    !["approved", "conditional", "rejected", "suspended"].includes(status) ||
    note.length < 5 ||
    confirmation !==
      (status === "approved"
        ? "ETKİYİ ONAYLA"
        : status === "conditional"
          ? "ŞARTLI ONAYLA"
          : status === "rejected"
            ? "ETKİYİ REDDET"
            : "ASKIYA AL")
  )
    return json(
      { error: "Karar gerekçesi ve doğru onay metni zorunludur." },
      400,
    );
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,risk_id,critical_gaps,impact_tier,review_date,created_by FROM ai_impact_assessments WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Etki değerlendirmesi bulunamadı." }, 404);
  if (
    ["approved", "conditional"].includes(status) &&
    row.created_by === access.actor.email
  )
    return json(
      {
        error:
          "Değerlendirmeyi oluşturan kişi aynı değerlendirmeyi onaylayamaz.",
      },
      409,
    );
  const gaps = parse(row.critical_gaps) as string[];
  if (
    status === "approved" &&
    (gaps.length || ["Critical", "High"].includes(String(row.impact_tier)))
  )
    return json(
      {
        error:
          "Kritik açık veya yüksek artık etki giderilmeden doğrudan onay verilemez.",
      },
      409,
    );
  if (
    status === "approved" &&
    String(row.review_date) < new Date().toISOString().slice(0, 10)
  )
    return json({ error: "Süresi geçmiş değerlendirme onaylanamaz." }, 409);
  if (status === "conditional") {
    if (!row.risk_id)
      return json(
        { error: "Şartlı onay için geçerli risk kabulü zorunludur." },
        409,
      );
    const risk = await DB.prepare(
      "SELECT status,acceptance_expiry FROM ai_risks WHERE id=? AND model_id=?",
    )
      .bind(row.risk_id, row.model_id)
      .first<Record<string, unknown>>();
    if (
      !risk ||
      risk.status !== "accepted" ||
      String(risk.acceptance_expiry) < new Date().toISOString().slice(0, 10)
    )
      return json(
        {
          error:
            "Bağlı risk istisnası kabul edilmiş ve süresi geçmemiş olmalıdır.",
        },
        409,
      );
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_impact_assessments SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(status, note, access.actor.email, now, access.actor.email, now, id)
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-impact-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed; ${row.impact_tier}; gaps ${gaps.length}`,
  });
  return json({ ok: true });
}
