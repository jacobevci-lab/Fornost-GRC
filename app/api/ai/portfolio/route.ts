import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime } from "@/app/ai/storage";

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
  mapCounts = (rows: Record<string, unknown>[], key: string) =>
    new Map(rows.map((row) => [String(row.model_id), Number(row[key] || 0)]));
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    today = new Date().toISOString().slice(0, 10),
    [
      models,
      risks,
      incidents,
      controls,
      evidence,
      releases,
      redTeams,
      transparency,
      assurance,
    ] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,owner,status,risk_tier,review_date FROM ai_model_inventory WHERE status!='retired' ORDER BY risk_score DESC,system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,COUNT(*) total FROM ai_risks WHERE status NOT IN ('closed','accepted') AND risk_tier IN ('Critical','High') GROUP BY model_id",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,COUNT(*) total FROM ai_incidents WHERE status!='resolved' AND severity IN ('critical','high') GROUP BY model_id",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,SUM(CASE WHEN status NOT IN ('implemented','not-applicable') THEN 1 ELSE 0 END) open,COUNT(*) total FROM ai_control_assessments GROUP BY model_id",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,COUNT(*) total FROM ai_evidence WHERE status='approved' AND integrity_status='verified' AND valid_until>=? GROUP BY model_id",
      )
        .bind(today)
        .all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,status,readiness_score,blockers_json,created_at FROM ai_release_gates ORDER BY created_at DESC LIMIT 2000",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,COUNT(*) total FROM ai_red_team_campaigns WHERE status='approved' AND retest_at>=? AND blockers_json='[]' GROUP BY model_id",
      )
        .bind(today)
        .all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,COUNT(*) total FROM ai_transparency_profiles WHERE status='approved' AND review_date>=? AND gaps_json='[]' GROUP BY model_id",
      )
        .bind(today)
        .all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT model_id,COUNT(*) total FROM ai_assurance_policies WHERE status='approved' AND review_date>=? GROUP BY model_id",
      )
        .bind(today)
        .all<Record<string, unknown>>(),
    ]),
    riskMap = mapCounts(risks.results || [], "total"),
    incidentMap = mapCounts(incidents.results || [], "total"),
    controlOpen = mapCounts(controls.results || [], "open"),
    controlTotal = mapCounts(controls.results || [], "total"),
    evidenceMap = mapCounts(evidence.results || [], "total"),
    redMap = mapCounts(redTeams.results || [], "total"),
    transparencyMap = mapCounts(transparency.results || [], "total"),
    assuranceMap = mapCounts(assurance.results || [], "total"),
    latestRelease = new Map<string, Record<string, unknown>>();
  for (const row of releases.results || [])
    if (!latestRelease.has(String(row.model_id)))
      latestRelease.set(String(row.model_id), row);
  const portfolio = (models.results || []).map((model) => {
      const id = String(model.id),
        release = latestRelease.get(id),
        highRisks = riskMap.get(id) || 0,
        criticalIncidents = incidentMap.get(id) || 0,
        openControls = controlOpen.get(id) || 0,
        totalControls = controlTotal.get(id) || 0,
        evidenceCurrent = evidenceMap.get(id) || 0,
        redTeamCurrent = (redMap.get(id) || 0) > 0,
        transparencyCurrent = (transparencyMap.get(id) || 0) > 0,
        assuranceCurrent = (assuranceMap.get(id) || 0) > 0,
        actions: string[] = [];
      if (model.status !== "approved") actions.push("Model envanter onayı");
      if (highRisks) actions.push(`${highRisks} yüksek/kritik risk`);
      if (criticalIncidents)
        actions.push(`${criticalIncidents} yüksek/kritik olay`);
      if (!totalControls || openControls)
        actions.push(`${openControls || "Eksik"} kontrol aksiyonu`);
      if (!evidenceCurrent) actions.push("Güncel doğrulanmış kanıt");
      if (!redTeamCurrent) actions.push("Red-team doğrulaması");
      if (!transparencyCurrent) actions.push("AI sistem kartı");
      if (!assuranceCurrent) actions.push("Sürekli güvence baseline'ı");
      if (!release || release.status !== "approved")
        actions.push("Üretim release onayı");
      return {
        id,
        systemName: model.system_name,
        modelName: model.model_name,
        owner: model.owner,
        status: model.status,
        riskTier: model.risk_tier,
        reviewDate: model.review_date,
        highRisks,
        criticalIncidents,
        openControls,
        totalControls,
        evidenceCurrent,
        redTeamCurrent,
        transparencyCurrent,
        assuranceCurrent,
        releaseStatus: release?.status || "none",
        releaseScore: Number(release?.readiness_score || 0),
        actions,
        readiness: Math.max(
          0,
          Math.round(((9 - Math.min(9, actions.length)) * 100) / 9),
        ),
      };
    }),
    actions = portfolio
      .flatMap((item) =>
        item.actions.map((action) => ({
          modelId: item.id,
          systemName: item.systemName,
          riskTier: item.riskTier,
          owner: item.owner,
          action,
        })),
      )
      .sort((a, b) => String(a.riskTier).localeCompare(String(b.riskTier)))
      .slice(0, 100);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const rows = [
      [
        "Model",
        "Sistem",
        "Sahip",
        "Risk",
        "Hazırlık",
        "Release",
        "Açık risk",
        "Açık olay",
        "Kontroller",
        "Kanıt",
        "Red-team",
        "Şeffaflık",
        "Güvence",
        "Aksiyonlar",
      ],
      ...portfolio.map((item) => [
        item.id,
        item.systemName,
        item.owner,
        item.riskTier,
        item.readiness,
        item.releaseStatus,
        item.highRisks,
        item.criticalIncidents,
        `${item.totalControls - item.openControls}/${item.totalControls}`,
        item.evidenceCurrent,
        item.redTeamCurrent,
        item.transparencyCurrent,
        item.assuranceCurrent,
        item.actions.join("; "),
      ]),
    ];
    return new NextResponse(
      `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-executive-portfolio.csv",
        },
      },
    );
  }
  return json({
    generatedAt: new Date().toISOString(),
    portfolio,
    actions,
    summary: {
      models: portfolio.length,
      approved: portfolio.filter((item) => item.status === "approved").length,
      releaseReady: portfolio.filter(
        (item) => item.releaseStatus === "approved",
      ).length,
      criticalAttention: portfolio.filter(
        (item) => item.highRisks > 0 || item.criticalIncidents > 0,
      ).length,
      openActions: actions.length,
      averageReadiness: portfolio.length
        ? Math.round(
            portfolio.reduce((sum, item) => sum + item.readiness, 0) /
              portfolio.length,
          )
        : 0,
    },
  });
}
