import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  aiRiskAttention,
  validateAiRisk,
  validateRiskDecision,
} from "@/app/ai/risks";
import { cleanAiText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const csvCell = (value: unknown) => {
  const raw = String(value ?? ""),
    safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
const map = (row: Record<string, unknown>) => ({
  id: row.id,
  modelId: row.model_id,
  incidentId: row.incident_id,
  changeId: row.change_id,
  category: row.category,
  title: row.title,
  description: row.description,
  cause: row.cause,
  consequence: row.consequence,
  owner: row.owner,
  likelihood: row.likelihood,
  impact: row.impact,
  controlEffectiveness: row.control_effectiveness,
  inherentScore: row.inherent_score,
  residualScore: row.residual_score,
  riskTier: row.risk_tier,
  treatment: row.treatment,
  treatmentPlan: row.treatment_plan,
  treatmentOwner: row.treatment_owner,
  dueDate: row.due_date,
  status: row.status,
  acceptanceExpiry: row.acceptance_expiry,
  decisionNote: row.decision_note,
  createdBy: row.created_by,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at,
  attention: aiRiskAttention(
    String(row.status),
    String(row.due_date),
    row.acceptance_expiry ? String(row.acceptance_expiry) : null,
  ),
});

async function validateLinks(
  db: D1Database,
  modelId: string,
  incidentId: string,
  changeId: string,
) {
  if (
    !(await db
      .prepare("SELECT id FROM ai_model_inventory WHERE id=?")
      .bind(modelId)
      .first())
  )
    throw new Error("AI modeli bulunamadı.");
  if (
    incidentId &&
    !(await db
      .prepare("SELECT id FROM ai_incidents WHERE id=? AND model_id=?")
      .bind(incidentId, modelId)
      .first())
  )
    throw new Error("Olay bu AI modeline ait değil.");
  if (
    changeId &&
    !(await db
      .prepare("SELECT id FROM ai_model_changes WHERE id=? AND model_id=?")
      .bind(changeId, modelId)
      .first())
  )
    throw new Error("Değişiklik bu AI modeline ait değil.");
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime();
  const [models, incidents, changes, risks] = await Promise.all([
    DB.prepare(
      "SELECT id,system_name,model_name FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
    ).all<Record<string, unknown>>(),
    DB.prepare(
      "SELECT id,model_id,title,status FROM ai_incidents ORDER BY created_at DESC LIMIT 300",
    ).all<Record<string, unknown>>(),
    DB.prepare(
      "SELECT id,model_id,from_version,to_version,status FROM ai_model_changes ORDER BY created_at DESC LIMIT 300",
    ).all<Record<string, unknown>>(),
    DB.prepare(
      "SELECT * FROM ai_risks ORDER BY residual_score DESC,updated_at DESC LIMIT 500",
    ).all<Record<string, unknown>>(),
  ]);
  const rows = (risks.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    if (access.actor.role !== "Admin")
      return json(
        { error: "Risk kanıt paketi yalnız Admin tarafından alınabilir." },
        403,
      );
    const data = [
      [
        "Risk",
        "Model",
        "Kategori",
        "Başlık",
        "Sorumlu",
        "İçsel",
        "Artık",
        "Seviye",
        "Tedavi",
        "Aksiyon sahibi",
        "Termin",
        "Durum",
        "Kabul sonu",
        "Dikkat",
      ],
      ...rows.map((r) => [
        r.id,
        r.modelId,
        r.category,
        r.title,
        r.owner,
        r.inherentScore,
        r.residualScore,
        r.riskTier,
        r.treatment,
        r.treatmentOwner,
        r.dueDate,
        r.status,
        r.acceptanceExpiry,
        r.attention,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((row) => row.map(csvCell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-risk-pack.csv",
        },
      },
    );
  }
  return json({
    models: (models.results || []).map((r) => ({
      id: r.id,
      systemName: r.system_name,
      modelName: r.model_name,
    })),
    incidents: incidents.results || [],
    changes: changes.results || [],
    risks: rows,
    summary: {
      total: rows.length,
      criticalHigh: rows.filter((r) =>
        ["Critical", "High"].includes(String(r.riskTier)),
      ).length,
      overdue: rows.filter((r) => r.attention === "overdue").length,
      expiredAcceptances: rows.filter(
        (r) => r.attention === "acceptance-expired",
      ).length,
      open: rows.filter(
        (r) => !["closed", "accepted"].includes(String(r.status)),
      ).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 32_768)
    return json({ error: "AI risk isteği çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let value;
  try {
    value = validateAiRisk(body);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Risk doğrulanamadı." },
      400,
    );
  }
  const { DB } = await aiRuntime();
  try {
    await validateLinks(DB, value.modelId, value.incidentId, value.changeId);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Risk ilişkisi geçersiz.",
      },
      409,
    );
  }
  const duplicate = await DB.prepare(
    "SELECT id,title FROM ai_risks WHERE model_id=? AND lower(title)=lower(?) AND status!='closed' LIMIT 1",
  )
    .bind(value.modelId, value.title)
    .first();
  if (duplicate)
    return json(
      { error: "Aynı modelde aynı başlıklı açık risk zaten var.", duplicate },
      409,
    );
  const id = `AIR-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  await DB.prepare(
    "INSERT INTO ai_risks(id,model_id,incident_id,change_id,category,title,description,cause,consequence,owner,likelihood,impact,control_effectiveness,inherent_score,residual_score,risk_tier,treatment,treatment_plan,treatment_owner,due_date,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
  )
    .bind(
      id,
      value.modelId,
      value.incidentId || null,
      value.changeId || null,
      value.category,
      value.title,
      value.description,
      value.cause,
      value.consequence,
      value.owner,
      value.likelihood,
      value.impact,
      value.controlEffectiveness,
      value.inherent,
      value.residual,
      value.tier,
      value.treatment,
      value.treatmentPlan,
      value.treatmentOwner,
      value.dueDate,
      access.actor.email,
      now,
      access.actor.email,
      now,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-risk-create",
    contextRefs: [value.modelId],
    status: "success",
    detail: `${id} ${value.category}; residual ${value.residual} ${value.tier}`,
  });
  return json({ id, residualScore: value.residual, riskTier: value.tier }, 201);
}

export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100);
  let decision;
  try {
    decision = validateRiskDecision(body);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Karar doğrulanamadı.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    risk = await DB.prepare(
      "SELECT model_id,created_by,status,treatment,residual_score FROM ai_risks WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!risk) return json({ error: "AI riski bulunamadı." }, 404);
  if (decision.status === "accepted" && risk.treatment !== "accept")
    return json(
      { error: "Yalnız kabul tedavisi seçilmiş risk kabul edilebilir." },
      409,
    );
  if (decision.status === "accepted" && risk.created_by === access.actor.email)
    return json(
      { error: "Risk kaydını oluşturan kişi aynı riski kabul edemez." },
      409,
    );
  if (decision.status === "closed" && Number(risk.residual_score) > 9)
    return json(
      {
        error:
          "Yüksek veya kritik artık risk kapatılamaz; önce kontroller güncellenmelidir.",
      },
      409,
    );
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_risks SET status=?,acceptance_expiry=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(
      decision.status,
      decision.acceptanceExpiry || null,
      decision.note,
      access.actor.email,
      now,
      access.actor.email,
      now,
      id,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-risk-${decision.status}`,
    contextRefs: [String(risk.model_id)],
    status: "success",
    detail: `${id}; human-approved; residual ${risk.residual_score}`,
  });
  return json({ ok: true });
}
