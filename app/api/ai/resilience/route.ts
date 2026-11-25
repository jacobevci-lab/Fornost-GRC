import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  resilienceAttention,
  validateExercise,
  validateResiliencePlan,
} from "@/app/ai/resilience";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const cell = (value: unknown) => {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
const parse = (value: unknown) => {
  try {
    return JSON.parse(String(value || "[]"));
  } catch {
    return [];
  }
};
const plan = (r: Record<string, unknown>) => ({
  id: r.id,
  modelId: r.model_id,
  scenario: r.scenario,
  owner: r.owner,
  technicalOwner: r.technical_owner,
  rtoMinutes: Number(r.rto_minutes),
  rpoMinutes: Number(r.rpo_minutes),
  maxDegradedMinutes: Number(r.max_degraded_minutes),
  fallbackPlan: r.fallback_plan,
  manualPlan: r.manual_plan,
  shutdownProcedure: r.shutdown_procedure,
  communicationPlan: r.communication_plan,
  dependencies: r.dependencies,
  nextExercise: r.next_exercise,
  status: r.status,
  decisionNote: r.decision_note,
  createdBy: r.created_by,
  approvedBy: r.approved_by,
  attention: resilienceAttention(String(r.status), String(r.next_exercise)),
});
const exercise = (r: Record<string, unknown>) => ({
  id: r.id,
  planId: r.plan_id,
  modelId: r.model_id,
  actualRecoveryMinutes: Number(r.actual_recovery_minutes),
  actualDataLossMinutes: Number(r.actual_data_loss_minutes),
  killSwitchPassed: Boolean(r.kill_switch_passed),
  fallbackPassed: Boolean(r.fallback_passed),
  manualModePassed: Boolean(r.manual_mode_passed),
  communicationPassed: Boolean(r.communication_passed),
  score: Number(r.score),
  result: r.result,
  checks: parse(r.checks_json),
  criticalFailures: parse(r.critical_failures),
  findings: r.findings,
  correctiveActions: r.corrective_actions,
  exercisedAt: r.exercised_at,
  nextRetest: r.next_retest,
  recordedBy: r.recorded_by,
  recordedAt: r.recorded_at,
});

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime();
  const [models, plans, exercises] = await Promise.all([
    DB.prepare(
      "SELECT id,system_name,model_name,status FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
    ).all<Record<string, unknown>>(),
    DB.prepare(
      "SELECT * FROM ai_resilience_plans ORDER BY next_exercise,status LIMIT 500",
    ).all<Record<string, unknown>>(),
    DB.prepare(
      "SELECT * FROM ai_resilience_exercises ORDER BY exercised_at DESC,recorded_at DESC LIMIT 1000",
    ).all<Record<string, unknown>>(),
  ]);
  const ps = (plans.results || []).map(plan),
    es = (exercises.results || []).map(exercise),
    format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = [
      [
        "Plan",
        "Model",
        "Senaryo",
        "Durum",
        "RTO",
        "RPO",
        "Sonraki tatbikat",
        "Sonuç",
        "Skor",
        "Bulgular",
      ],
      ...ps.map((p) => {
        const e = es.find((x) => x.planId === p.id);
        return [
          p.id,
          p.modelId,
          p.scenario,
          p.status,
          p.rtoMinutes,
          p.rpoMinutes,
          p.nextExercise,
          e?.result || "",
          e?.score || "",
          e?.findings || "",
        ];
      }),
    ];
    return new NextResponse(
      `\uFEFF${rows.map((r) => r.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-resilience.csv",
        },
      },
    );
  }
  const today = new Date().toISOString().slice(0, 10),
    recent = es.filter(
      (e) =>
        String(e.exercisedAt) >=
        new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10),
    );
  return json({
    models: models.results || [],
    plans: ps,
    exercises: es,
    summary: {
      total: ps.length,
      approved: ps.filter((p) => p.status === "approved").length,
      overdue: ps.filter((p) => p.attention === "overdue").length,
      recentPassed: recent.filter((e) => e.result === "passed").length,
      failed: es.filter((e) => e.result === "failed").length,
      asOf: today,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 24576)
    return json({ error: "Dayanıklılık planı çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateResiliencePlan(body);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Plan geçersiz." },
      400,
    );
  }
  const { DB } = await aiRuntime();
  const model = await DB.prepare(
    "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
  )
    .bind(v.modelId)
    .first();
  if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
  const id = `AIRP-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_resilience_plans(id,model_id,scenario,owner,technical_owner,rto_minutes,rpo_minutes,max_degraded_minutes,fallback_plan,manual_plan,shutdown_procedure,communication_plan,dependencies,next_exercise,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
    )
      .bind(
        id,
        v.modelId,
        v.scenario,
        v.owner,
        v.technicalOwner,
        v.rtoMinutes,
        v.rpoMinutes,
        v.maxDegradedMinutes,
        v.fallbackPlan,
        v.manualPlan,
        v.shutdownProcedure,
        v.communicationPlan,
        v.dependencies,
        v.nextExercise,
        access.actor.email,
        now,
        access.actor.email,
        now,
      )
      .run();
  } catch {
    return json({ error: "Bu model ve senaryo için plan zaten var." }, 409);
  }
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-resilience-plan-create",
    contextRefs: [v.modelId],
    status: "success",
    detail: `${id}; ${v.scenario}; RTO ${v.rtoMinutes}; RPO ${v.rpoMinutes}`,
  });
  return json({ id }, 201);
}
export async function PUT(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.planId, 100),
    { DB } = await aiRuntime();
  const p = await DB.prepare(
    "SELECT id,model_id,status,rto_minutes,rpo_minutes FROM ai_resilience_plans WHERE id=?",
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!p) return json({ error: "Dayanıklılık planı bulunamadı." }, 404);
  if (p.status !== "approved")
    return json(
      { error: "Yalnız onaylı plan için tatbikat kaydedilebilir." },
      409,
    );
  let v;
  try {
    v = validateExercise(body, {
      rtoMinutes: Number(p.rto_minutes),
      rpoMinutes: Number(p.rpo_minutes),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Tatbikat geçersiz." },
      400,
    );
  }
  const exerciseId = `AIRE-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  await DB.prepare(
    "INSERT INTO ai_resilience_exercises(id,plan_id,model_id,actual_recovery_minutes,actual_data_loss_minutes,kill_switch_passed,fallback_passed,manual_mode_passed,communication_passed,score,result,checks_json,critical_failures,findings,corrective_actions,exercised_at,next_retest,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      exerciseId,
      id,
      p.model_id,
      v.actualRecoveryMinutes,
      v.actualDataLossMinutes,
      v.killSwitchPassed ? 1 : 0,
      v.fallbackPassed ? 1 : 0,
      v.manualModePassed ? 1 : 0,
      v.communicationPassed ? 1 : 0,
      v.score,
      v.status,
      JSON.stringify(v.checks),
      JSON.stringify(v.criticalFailures),
      v.findings,
      v.correctiveActions,
      v.exercisedAt,
      v.nextRetest,
      access.actor.email,
      now,
    )
    .run();
  await DB.prepare(
    "UPDATE ai_resilience_plans SET next_exercise=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(v.nextRetest, access.actor.email, now, id)
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-resilience-exercise",
    contextRefs: [String(p.model_id), id],
    status: v.status === "passed" ? "success" : "error",
    detail: `${exerciseId}; score ${v.score}; ${v.criticalFailures.join(",") || "no critical failure"}`,
  });
  return json(
    { id: exerciseId, result: v.status, score: v.score, checks: v.checks },
    201,
  );
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 40);
  if (!["approved", "retired"].includes(status) || note.length < 5)
    return json({ error: "Geçerli karar ve gerekçe zorunludur." }, 400);
  const expected = status === "approved" ? "PLANI ONAYLA" : "PLANI EMEKLİ ET";
  if (confirmation !== expected)
    return json({ error: `Onay metni: ${expected}` }, 400);
  const { DB } = await aiRuntime(),
    p = await DB.prepare(
      "SELECT model_id,status,next_exercise,created_by FROM ai_resilience_plans WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!p) return json({ error: "Plan bulunamadı." }, 404);
  if (status === "approved" && p.created_by === access.actor.email)
    return json({ error: "Planı oluşturan kişi aynı planı onaylayamaz." }, 409);
  if (
    status === "approved" &&
    String(p.next_exercise) < new Date().toISOString().slice(0, 10)
  )
    return json({ error: "Gecikmiş tatbikat tarihli plan onaylanamaz." }, 409);
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_resilience_plans SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
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
    action: `ai-resilience-plan-${status}`,
    contextRefs: [String(p.model_id), id],
    status: "success",
    detail: `human-confirmed; ${note}`,
  });
  return json({ ok: true });
}
