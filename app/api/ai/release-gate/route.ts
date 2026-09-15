import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  evaluateReleaseGate,
  validateReleaseDecision,
  validateReleaseRequest,
  type GateInput,
} from "@/app/ai/release-gate";
import { cleanAiText } from "@/app/ai/security";
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
  safeParse = (v: unknown) => {
    try {
      return JSON.parse(String(v || "[]"));
    } catch {
      return [];
    }
  };
const map = (r: Record<string, unknown>) => ({
  id: r.id,
  modelId: r.model_id,
  changeId: r.change_id,
  version: r.version,
  environment: r.environment,
  releaseOwner: r.release_owner,
  rollbackOwner: r.rollback_owner,
  rollbackPlan: r.rollback_plan,
  plannedAt: r.planned_at,
  readinessScore: Number(r.readiness_score),
  checks: safeParse(r.checks_json),
  blockers: safeParse(r.blockers_json),
  snapshot: safeParse(r.snapshot_json),
  status: r.status,
  decisionNote: r.decision_note,
  validUntil: r.valid_until,
  createdBy: r.created_by,
  decidedBy: r.decided_by,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
  expired:
    r.status === "approved" &&
    String(r.valid_until) < new Date().toISOString().slice(0, 10),
});
async function currentGate(db: D1Database, modelId: string, changeId: string) {
  const today = new Date().toISOString().slice(0, 10),
    [
      model,
      change,
      controls,
      findings,
      risks,
      incidents,
      vendors,
      evidence,
      access,
      impact,
      resilience,
      datasets,
      regulatory,
      literacy,
      artifact,
      redTeam,
      transparency,
      oversight,
      continuousAssurance,
      assuranceAlerts,
      exceptions,
      decommission,
    ] = await Promise.all([
      db
        .prepare(
          "SELECT status,model_name,risk_tier FROM ai_model_inventory WHERE id=?",
        )
        .bind(modelId)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT status,to_version FROM ai_model_changes WHERE id=? AND model_id=?",
        )
        .bind(changeId, modelId)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total,SUM(CASE WHEN status NOT IN ('implemented','not-applicable') THEN 1 ELSE 0 END) open FROM ai_control_assessments WHERE model_id=?",
        )
        .bind(modelId)
        .first<Record<string, unknown>>(),
      db
        .prepare("SELECT COUNT(*) total FROM ai_findings WHERE model_id=? AND status!='resolved' AND (severity IN ('High','Critical') OR due_date<?)")
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT SUM(CASE WHEN risk_tier IN ('Critical','High') AND status NOT IN ('closed','accepted') THEN 1 ELSE 0 END) high_risks,SUM(CASE WHEN status='accepted' AND acceptance_expiry<? THEN 1 ELSE 0 END) expired FROM ai_risks WHERE model_id=?",
        )
        .bind(today, modelId)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_incidents WHERE model_id=? AND severity IN ('critical','high') AND status!='resolved'",
        )
        .bind(modelId)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_vendor_assessments WHERE model_id=? AND status IN ('approved','conditional') AND review_date>=?",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_evidence WHERE model_id=? AND status='approved' AND integrity_status='verified' AND valid_until>=?",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_access_assignments WHERE model_id=? AND (status='pending' AND risk_tier IN ('Critical','High') OR status='active' AND (expires_at<? OR review_date<? OR last_used<date(?,'-90 day')))",
        )
        .bind(modelId, today, today, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_impact_assessments WHERE model_id=? AND status IN ('approved','conditional') AND review_date>=?",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_resilience_exercises WHERE model_id=? AND result='passed' AND exercised_at>=date(?,'-180 day') AND kill_switch_passed=1 AND fallback_passed=1",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_datasets WHERE model_id=? AND status='approved' AND review_date>=?",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_regulatory_profiles WHERE model_id=? AND status='approved' AND review_date>=? AND gaps_json='[]'",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_literacy_records WHERE model_id=? AND status='approved' AND valid_until>=? AND missing_json='[]' AND operator_role IN ('reviewer','approver','operator')",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_model_artifacts WHERE model_id=? AND status='approved' AND valid_until>=? AND blockers_json='[]' AND signature_verified=1 AND malware_clean=1",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_red_team_campaigns WHERE model_id=? AND status='approved' AND retest_at>=? AND blockers_json='[]' AND critical_findings=0 AND high_findings=0",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_transparency_profiles WHERE model_id=? AND status='approved' AND review_date>=? AND gaps_json='[]'",
        )
        .bind(modelId, today)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_oversight_events WHERE model_id=? AND status='open' AND severity IN ('high','critical')",
        )
        .bind(modelId)
        .first<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT COUNT(*) total FROM ai_assurance_policies p WHERE p.model_id=? AND p.status='approved' AND p.review_date>=? AND EXISTS (SELECT 1 FROM ai_model_monitoring m WHERE m.model_id=p.model_id AND m.recorded_at>=datetime(?,'-'||p.frequency_days||' day') AND m.accuracy>=p.min_accuracy AND m.error_rate<=p.max_error_rate AND m.drift_score<=p.max_drift_score AND m.bias_score<=p.max_bias_score AND m.p95_latency_ms<=p.max_p95_latency_ms AND m.sample_size>=p.min_sample_size)",
        )
        .bind(modelId, today, new Date().toISOString())
        .first<Record<string, unknown>>(),
      db.prepare("SELECT COUNT(*) total FROM ai_assurance_alerts WHERE model_id=? AND status!='resolved' AND severity IN ('High','Critical')").bind(modelId).first<Record<string,unknown>>(),
      db
        .prepare("SELECT COUNT(*) total FROM ai_exceptions WHERE model_id=? AND (status='draft' OR status='approved' AND (expires_at<? OR review_at<?))")
        .bind(modelId, today, today)
        .first<Record<string, unknown>>(),
      db
        .prepare("SELECT COUNT(*) total FROM ai_decommission_plans WHERE model_id=? AND status IN ('draft','approved','executing')")
        .bind(modelId)
        .first<Record<string, unknown>>(),
    ]);
  if (!model) throw new Error("AI modeli bulunamadı.");
  if (!change) throw new Error("Değişiklik bu AI modeline ait değil.");
  const input: GateInput = {
    modelApproved: model.status === "approved",
    controlsTotal: Number(controls?.total || 0),
    controlsOpen: Number(controls?.open || 0),
    blockingFindings: Number(findings?.total || 0),
    highRisks: Number(risks?.high_risks || 0),
    expiredAcceptances: Number(risks?.expired || 0),
    criticalIncidents: Number(incidents?.total || 0),
    vendorCurrent: Number(vendors?.total || 0) > 0,
    evidenceCurrent: Number(evidence?.total || 0),
    accessFindings: Number(access?.total || 0),
    impactCurrent: Number(impact?.total || 0) > 0,
    resilienceCurrent: Number(resilience?.total || 0) > 0,
    datasetCurrent: Number(datasets?.total || 0) > 0,
    regulatoryCurrent: Number(regulatory?.total || 0) > 0,
    literacyCurrent: Number(literacy?.total || 0) > 0,
    artifactCurrent: Number(artifact?.total || 0) > 0,
    redTeamCurrent: Number(redTeam?.total || 0) > 0,
    transparencyCurrent: Number(transparency?.total || 0) > 0,
    oversightClear: Number(oversight?.total || 0) === 0,
    continuousAssuranceCurrent: Number(continuousAssurance?.total || 0) > 0,
    blockingAssuranceAlerts: Number(assuranceAlerts?.total || 0),
    unresolvedExceptions: Number(exceptions?.total || 0),
    retirementClear: Number(decommission?.total || 0) === 0,
    changeApproved: change.status === "approved",
  };
  return {
    result: evaluateReleaseGate(input),
    snapshot: {
      evaluatedAt: new Date().toISOString(),
      modelStatus: model.status,
      modelName: model.model_name,
      modelRiskTier: model.risk_tier,
      changeStatus: change.status,
      changeVersion: change.to_version,
      ...input,
    },
  };
}
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, changes, gates] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,status FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT id,model_id,from_version,to_version,status FROM ai_model_changes ORDER BY created_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_release_gates ORDER BY created_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (gates.results || []).map(map),
    format = req.nextUrl.searchParams.get("format");
  if (format === "manifest")
    return json({
      generatedAt: new Date().toISOString(),
      generatedBy: access.actor.email,
      records: rows,
    });
  if (format === "csv") {
    const data = [
      [
        "Kapı",
        "Model",
        "Değişiklik",
        "Sürüm",
        "Ortam",
        "Skor",
        "Engeller",
        "Durum",
        "Plan",
        "Geçerlilik",
        "Karar veren",
      ],
      ...rows.map((r) => [
        r.id,
        r.modelId,
        r.changeId,
        r.version,
        r.environment,
        r.readinessScore,
        r.blockers.join("; "),
        r.status,
        r.plannedAt,
        r.validUntil,
        r.decidedBy,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-release-gates.csv",
        },
      },
    );
  }
  return json({
    models: (models.results || []).map((r) => ({
      id: r.id,
      systemName: r.system_name,
      modelName: r.model_name,
      status: r.status,
    })),
    changes: changes.results || [],
    gates: rows,
    summary: {
      total: rows.length,
      approved: rows.filter((r) => r.status === "approved" && !r.expired)
        .length,
      blocked: rows.filter((r) => r.status === "blocked").length,
      pending: rows.filter((r) => r.status === "requested").length,
      expired: rows.filter((r) => r.expired).length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 24_576)
    return json({ error: "Yayın kapısı isteği çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== "KAPIYI DEĞERLENDİR")
    return json({ error: "KAPIYI DEĞERLENDİR onayı zorunludur." }, 400);
  let v;
  try {
    v = validateReleaseRequest(body);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Yayın isteği geçersiz.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime();
  let gate;
  try {
    gate = await currentGate(DB, v.modelId, v.changeId);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Kapı değerlendirilemedi.",
      },
      409,
    );
  }
  const duplicate = await DB.prepare(
    "SELECT id FROM ai_release_gates WHERE model_id=? AND version=? AND status IN ('requested','approved') LIMIT 1",
  )
    .bind(v.modelId, v.version)
    .first();
  if (duplicate)
    return json(
      { error: "Bu model ve sürüm için etkin yayın kararı zaten var." },
      409,
    );
  const id = `AIG-${crypto.randomUUID()}`,
    now = new Date().toISOString(),
    status = gate.result.ready ? "requested" : "blocked";
  await DB.prepare(
    "INSERT INTO ai_release_gates(id,model_id,change_id,version,environment,release_owner,rollback_owner,rollback_plan,planned_at,readiness_score,checks_json,blockers_json,snapshot_json,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      v.modelId,
      v.changeId,
      v.version,
      v.environment,
      v.releaseOwner,
      v.rollbackOwner,
      v.rollbackPlan,
      v.plannedAt,
      gate.result.score,
      JSON.stringify(gate.result.checks),
      JSON.stringify(gate.result.blockers),
      JSON.stringify(gate.snapshot),
      status,
      access.actor.email,
      now,
      access.actor.email,
      now,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-release-gate-evaluate",
    contextRefs: [v.modelId, v.changeId],
    status: gate.result.ready ? "success" : "denied",
    detail: `${id}; score ${gate.result.score}; blockers ${gate.result.blockers.join(",") || "none"}`,
  });
  return json({ id, status, ...gate.result }, gate.result.ready ? 201 : 409);
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100);
  let decision;
  try {
    decision = validateReleaseDecision(body);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Karar geçersiz." },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,change_id,created_by,status FROM ai_release_gates WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Yayın kapısı bulunamadı." }, 404);
  if (decision.status === "approved") {
    if (row.status !== "requested")
      return json(
        { error: "Yalnız hazır ve karar bekleyen yayın onaylanabilir." },
        409,
      );
    if (row.created_by === access.actor.email)
      return json(
        { error: "Yayın talebini oluşturan kişi aynı yayını onaylayamaz." },
        409,
      );
    const live = await currentGate(
      DB,
      String(row.model_id),
      String(row.change_id),
    );
    if (!live.result.ready)
      return json(
        {
          error:
            "Kontroller talep sonrasında değişti; yayın kapısı artık hazır değil.",
          blockers: live.result.blockers,
        },
        409,
      );
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_release_gates SET status=?,decision_note=?,valid_until=?,decided_by=?,decided_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(
      decision.status,
      decision.note,
      decision.validUntil || null,
      access.actor.email,
      now,
      access.actor.email,
      now,
      id,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-release-${decision.status}`,
    contextRefs: [String(row.model_id), String(row.change_id)],
    status: "success",
    detail: `${id}; human-confirmed; valid until ${decision.validUntil || "n/a"}`,
  });
  return json({ ok: true });
}
