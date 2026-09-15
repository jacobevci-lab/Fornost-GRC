import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { redTeamAttention, validateCampaign } from "@/app/ai/red-team";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "cache-control": "no-store" },
    }),
  parse = (value: unknown) => {
    try {
      return JSON.parse(String(value || "[]"));
    } catch {
      return [];
    }
  },
  cell = (value: unknown) => {
    const raw = String(value ?? ""),
      safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  },
  map = (row: Record<string, unknown>) => ({
    id: row.id,
    modelId: row.model_id,
    name: row.name,
    scope: row.scope,
    methodology: row.methodology,
    lead: row.lead,
    independentTester: row.independent_tester,
    environment: row.environment,
    categories: parse(row.categories_json),
    plannedAt: row.planned_at,
    completedAt: row.completed_at,
    totalTests: Number(row.total_tests),
    passedTests: Number(row.passed_tests),
    passRate: Number(row.pass_rate),
    criticalFindings: Number(row.critical_findings),
    highFindings: Number(row.high_findings),
    mediumFindings: Number(row.medium_findings),
    reportReference: row.report_reference,
    remediationPlan: row.remediation_plan,
    retestAt: row.retest_at,
    blockers: parse(row.blockers_json),
    status: row.status,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    attention: redTeamAttention(String(row.status), String(row.retest_at)),
  });

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, result] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_red_team_campaigns ORDER BY completed_at DESC LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (result.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const table = [
      [
        "Kampanya",
        "Model",
        "Ad",
        "Ortam",
        "Kategoriler",
        "Test",
        "Başarılı",
        "Oran",
        "Kritik",
        "Yüksek",
        "Orta",
        "Yeniden test",
        "Durum",
        "Engeller",
      ],
      ...rows.map((row) => [
        row.id,
        row.modelId,
        row.name,
        row.environment,
        row.categories.join("; "),
        row.totalTests,
        row.passedTests,
        row.passRate,
        row.criticalFindings,
        row.highFindings,
        row.mediumFindings,
        row.retestAt,
        row.status,
        row.blockers.join("; "),
      ]),
    ];
    return new NextResponse(
      `\uFEFF${table.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-red-team-evidence.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    campaigns: rows,
    summary: {
      total: rows.length,
      approved: rows.filter(
        (row) => row.status === "approved" && row.attention === "current",
      ).length,
      blocked: rows.filter((row) => row.blockers.length > 0).length,
      critical: rows.reduce((sum, row) => sum + row.criticalFindings, 0),
      retest: rows.filter((row) =>
        ["retest-due", "retest-overdue"].includes(row.attention),
      ).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({}));
  let campaign;
  try {
    campaign = validateCampaign(body);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Red-team kampanyası geçersiz.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    model = await DB.prepare(
      "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(campaign.modelId)
      .first();
  if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
  const id = `AIRT-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_red_team_campaigns(id,model_id,name,scope,methodology,lead,independent_tester,environment,categories_json,planned_at,completed_at,total_tests,passed_tests,pass_rate,critical_findings,high_findings,medium_findings,report_reference,remediation_plan,retest_at,blockers_json,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
    )
      .bind(
        id,
        campaign.modelId,
        campaign.name,
        campaign.scope,
        campaign.methodology,
        campaign.lead,
        campaign.independentTester,
        campaign.environment,
        JSON.stringify(campaign.categories),
        campaign.plannedAt,
        campaign.completedAt,
        campaign.totalTests,
        campaign.passedTests,
        campaign.passRate,
        campaign.criticalFindings,
        campaign.highFindings,
        campaign.mediumFindings,
        campaign.reportReference,
        campaign.remediationPlan,
        campaign.retestAt,
        JSON.stringify(campaign.blockers),
        access.actor.email,
        now,
        access.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Aynı model, kampanya adı ve tamamlanma tarihi zaten kayıtlı." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-red-team-campaign-create",
    contextRefs: [campaign.modelId],
    status: campaign.blockers.length ? "denied" : "success",
    detail: `${id}; pass-rate ${campaign.passRate}; findings C${campaign.criticalFindings}/H${campaign.highFindings}/M${campaign.mediumFindings}`,
  });
  return json(
    { id, passRate: campaign.passRate, blockers: campaign.blockers },
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
    confirmation = cleanAiText(body.confirmation, 50),
    phrases: Record<string, string> = {
      approved: "RED TEAMİ ONAYLA",
      rejected: "RED TEAMİ REDDET",
      retired: "KAMPANYAYI EMEKLİ ET",
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
      "SELECT model_id,created_by,blockers_json,retest_at FROM ai_red_team_campaigns WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Red-team kampanyası bulunamadı." }, 404);
  if (status === "approved") {
    if (row.created_by === access.actor.email)
      return json(
        {
          error: "Kaydı oluşturan kişi aynı red-team kampanyasını onaylayamaz.",
        },
        409,
      );
    if (parse(row.blockers_json).length)
      return json(
        { error: "Red-team engelleri giderilmeden onay verilemez." },
        409,
      );
    if (String(row.retest_at) < new Date().toISOString().slice(0, 10))
      return json(
        { error: "Yeniden test tarihi geçmiş kampanya onaylanamaz." },
        409,
      );
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_red_team_campaigns SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
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
    action: `ai-red-team-campaign-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed`,
  });
  return json({ ok: true });
}
