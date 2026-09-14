import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
import {
  AI_VENDOR_CONTROLS,
  validateVendorAssessment,
  vendorReviewState,
} from "@/app/ai/vendor-assurance";
const json = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "cache-control": "no-store" },
    }),
  cell = (value: unknown) => {
    const raw = String(value ?? ""),
      safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
const map = (r: Record<string, unknown>) => ({
  id: r.id,
  modelId: r.model_id,
  riskId: r.risk_id,
  serviceName: r.service_name,
  legalEntity: r.legal_entity,
  serviceOwner: r.service_owner,
  dataLocations: r.data_locations,
  subprocessors: r.subprocessors,
  certifications: r.certifications,
  sla: r.sla,
  exitPlan: r.exit_plan,
  contractEnd: r.contract_end,
  reviewDate: r.review_date,
  breachHours: Number(r.breach_hours),
  ...Object.fromEntries(
    AI_VENDOR_CONTROLS.map((k) => [
      k,
      Boolean(r[k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)]),
    ]),
  ),
  assuranceScore: Number(r.assurance_score),
  assuranceTier: r.assurance_tier,
  gaps: JSON.parse(String(r.gaps || "[]")),
  criticalGaps: JSON.parse(String(r.critical_gaps || "[]")),
  status: r.status,
  decisionNote: r.decision_note,
  approvedBy: r.approved_by,
  reviewState: vendorReviewState(String(r.status), String(r.review_date)),
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
    [models, risks, assessments] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,vendor FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT id,model_id,title,status,acceptance_expiry FROM ai_risks WHERE treatment='accept' ORDER BY updated_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_vendor_assessments ORDER BY updated_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (assessments.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    if (access.actor.role !== "Admin")
      return json(
        {
          error:
            "AI tedarikçi kanıt paketi yalnız Admin tarafından alınabilir.",
        },
        403,
      );
    const data = [
      [
        "Hizmet",
        "Tüzel kişi",
        "Model",
        "Sorumlu",
        "Veri lokasyonu",
        "Puan",
        "Seviye",
        "Kritik açıklar",
        "Durum",
        "İnceleme",
        "İnceleme hali",
      ],
      ...rows.map((r) => [
        r.serviceName,
        r.legalEntity,
        r.modelId,
        r.serviceOwner,
        r.dataLocations,
        r.assuranceScore,
        r.assuranceTier,
        r.criticalGaps.join("; "),
        r.status,
        r.reviewDate,
        r.reviewState,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-vendor-assurance.csv",
        },
      },
    );
  }
  return json({
    models: (models.results || []).map((r) => ({
      id: r.id,
      systemName: r.system_name,
      modelName: r.model_name,
      vendor: r.vendor,
    })),
    risks: risks.results || [],
    assessments: rows,
    summary: {
      total: rows.length,
      approved: rows.filter((r) => r.status === "approved").length,
      conditional: rows.filter((r) => r.status === "conditional").length,
      criticalGaps: rows.filter((r) => r.criticalGaps.length).length,
      overdue: rows.filter((r) => r.reviewState === "overdue").length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 32_768)
    return json({ error: "AI tedarikçi değerlendirmesi çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateVendorAssessment(body);
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
    "SELECT id FROM ai_vendor_assessments WHERE model_id=? AND lower(service_name)=lower(?) AND status!='suspended' LIMIT 1",
  )
    .bind(v.modelId, v.serviceName)
    .first();
  if (duplicate)
    return json(
      { error: "Bu model ve hizmet için etkin değerlendirme zaten var." },
      409,
    );
  const id = `AIV-${crypto.randomUUID()}`,
    now = new Date().toISOString(),
    flagValues = AI_VENDOR_CONTROLS.map((k) => (v[k] ? 1 : 0));
  await DB.prepare(
    "INSERT INTO ai_vendor_assessments(id,model_id,risk_id,service_name,legal_entity,service_owner,data_locations,subprocessors,certifications,sla,exit_plan,contract_end,review_date,breach_hours,dpa,training_opt_out,deletion_commitment,audit_rights,security_exhibit,bcdr,subprocessor_notice,data_portability,assurance_score,assurance_tier,gaps,critical_gaps,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
  )
    .bind(
      id,
      v.modelId,
      v.riskId || null,
      v.serviceName,
      v.legalEntity,
      v.serviceOwner,
      v.dataLocations,
      v.subprocessors,
      v.certifications,
      v.sla,
      v.exitPlan,
      v.contractEnd,
      v.reviewDate,
      v.breachHours,
      ...flagValues,
      v.score,
      v.tier,
      JSON.stringify(v.gaps),
      JSON.stringify(v.criticalGaps),
      access.actor.email,
      now,
      access.actor.email,
      now,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-vendor-assessment-create",
    contextRefs: [v.modelId],
    status: "success",
    detail: `${id}; assurance ${v.score}; critical gaps ${v.criticalGaps.join(",") || "none"}`,
  });
  return json({ id, score: v.score, tier: v.tier }, 201);
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 30);
  if (
    !["approved", "conditional", "suspended"].includes(status) ||
    note.length < 5 ||
    confirmation !==
      (status === "approved"
        ? "TEDARİKÇİYİ ONAYLA"
        : status === "conditional"
          ? "ŞARTLI ONAYLA"
          : "ASKIYA AL")
  )
    return json(
      { error: "Karar gerekçesi ve doğru onay metni zorunludur." },
      400,
    );
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,risk_id,critical_gaps,review_date FROM ai_vendor_assessments WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Değerlendirme bulunamadı." }, 404);
  const gaps = JSON.parse(String(row.critical_gaps || "[]")) as string[];
  if (status === "approved" && gaps.length)
    return json(
      { error: "Kritik güvence açıkları giderilmeden tedarikçi onaylanamaz." },
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
        { error: "Şartlı onay için kabul edilmiş risk istisnası zorunludur." },
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
        { error: "Risk istisnası kabul edilmiş ve geçerli olmalıdır." },
        409,
      );
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_vendor_assessments SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(status, note, access.actor.email, now, access.actor.email, now, id)
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-vendor-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-approved; gaps ${gaps.length}`,
  });
  return json({ ok: true });
}
