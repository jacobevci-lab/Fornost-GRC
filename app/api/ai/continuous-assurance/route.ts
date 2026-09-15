import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  assessAssurance,
  validateAssurancePolicy,
} from "@/app/ai/continuous-assurance";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "cache-control": "no-store" },
    }),
  cell = (value: unknown) => {
    const raw = String(value ?? ""),
      safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  },
  mapPolicy = (row: Record<string, unknown>) => ({
    id: row.id,
    modelId: row.model_id,
    owner: row.owner,
    minAccuracy: Number(row.min_accuracy),
    maxErrorRate: Number(row.max_error_rate),
    maxDriftScore: Number(row.max_drift_score),
    maxBiasScore: Number(row.max_bias_score),
    maxP95LatencyMs: Number(row.max_p95_latency_ms),
    minSampleSize: Number(row.min_sample_size),
    frequencyDays: Number(row.frequency_days),
    evidencePlan: row.evidence_plan,
    breachAction: row.breach_action,
    reviewDate: row.review_date,
    status: row.status,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
  });

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, result, snapshots] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,risk_tier FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_assurance_policies ORDER BY review_date,status LIMIT 1000",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT m.* FROM ai_model_monitoring m JOIN (SELECT model_id,MAX(recorded_at) recorded_at FROM ai_model_monitoring GROUP BY model_id) latest ON latest.model_id=m.model_id AND latest.recorded_at=m.recorded_at LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    latest = new Map(
      (snapshots.results || []).map((row) => [
        String(row.model_id),
        {
          accuracy: Number(row.accuracy),
          errorRate: Number(row.error_rate),
          driftScore: Number(row.drift_score),
          biasScore: Number(row.bias_score),
          p95LatencyMs: Number(row.p95_latency_ms),
          sampleSize: Number(row.sample_size),
          recordedAt: String(row.recorded_at),
        },
      ]),
    ),
    policies = (result.results || []).map((row) => {
      const policy = mapPolicy(row),
        snapshot = latest.get(String(policy.modelId)) || null;
      return {
        ...policy,
        snapshot,
        assurance: assessAssurance(policy, snapshot),
      };
    });
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const rows = [
      [
        "Policy",
        "Model",
        "Sahip",
        "Durum",
        "Güvence",
        "İhlaller",
        "Review",
        "Son ölçüm",
      ],
      ...policies.map((item) => [
        item.id,
        item.modelId,
        item.owner,
        item.status,
        item.assurance.state,
        item.assurance.breaches.join("; "),
        item.reviewDate,
        item.snapshot?.recordedAt || "",
      ]),
    ];
    return new NextResponse(
      `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-continuous-assurance.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    policies,
    summary: {
      total: policies.length,
      approved: policies.filter((item) => item.status === "approved").length,
      healthy: policies.filter(
        (item) =>
          item.status === "approved" && item.assurance.state === "healthy",
      ).length,
      breached: policies.filter((item) => item.assurance.state === "breached")
        .length,
      missing: policies.filter((item) => item.assurance.state === "missing")
        .length,
    },
  });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({}));
  let value;
  try {
    value = validateAssurancePolicy(body);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Güvence politikası geçersiz.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    model = await DB.prepare(
      "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(value.modelId)
      .first();
  if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
  const id = `AICA-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_assurance_policies(id,model_id,owner,min_accuracy,max_error_rate,max_drift_score,max_bias_score,max_p95_latency_ms,min_sample_size,frequency_days,evidence_plan,breach_action,review_date,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
    )
      .bind(
        id,
        value.modelId,
        value.owner,
        value.minAccuracy,
        value.maxErrorRate,
        value.maxDriftScore,
        value.maxBiasScore,
        value.maxP95LatencyMs,
        value.minSampleSize,
        value.frequencyDays,
        value.evidencePlan,
        value.breachAction,
        value.reviewDate,
        access.actor.email,
        now,
        access.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Bu AI modeli için güvence baseline'ı zaten mevcut." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-assurance-policy-create",
    contextRefs: [value.modelId],
    status: "success",
    detail: `${id}; frequency ${value.frequencyDays}d; min accuracy ${value.minAccuracy}`,
  });
  return json({ id }, 201);
}

export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 50),
    phrases: Record<string, string> = {
      approved: "BASELINE'I ONAYLA",
      rejected: "BASELINE'I REDDET",
      retired: "BASELINE'I EMEKLİ ET",
    };
  if (!phrases[status] || note.length < 5 || confirmation !== phrases[status])
    return json(
      {
        error: `Geçerli karar, gerekçe ve ${phrases[status] || "onay metni"} zorunludur.`,
      },
      400,
    );
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,created_by,review_date FROM ai_assurance_policies WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Güvence baseline'ı bulunamadı." }, 404);
  if (status === "approved") {
    if (row.created_by === access.actor.email)
      return json(
        {
          error: "Kaydı oluşturan kişi aynı güvence baseline'ını onaylayamaz.",
        },
        409,
      );
    if (String(row.review_date) < new Date().toISOString().slice(0, 10))
      return json({ error: "Review tarihi geçmiş baseline onaylanamaz." }, 409);
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_assurance_policies SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
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
    action: `ai-assurance-policy-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed`,
  });
  return json({ ok: true });
}
