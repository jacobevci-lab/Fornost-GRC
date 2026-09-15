import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
import { dossierDomain, dossierWindow, sha256Json } from "@/app/ai/assurance-dossier";

const json = (data: unknown, status = 200) =>
    NextResponse.json(data, { status, headers: { "cache-control": "no-store" } }),
  csvCell = (value: unknown) => {
    const raw = String(value ?? ""), safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  try {
    const modelId = String(req.nextUrl.searchParams.get("modelId") || "").trim(),
      days = dossierWindow(req.nextUrl.searchParams.get("days"));
    if (!modelId || modelId.length > 100) return json({ error: "Geçerli AI modeli zorunludur." }, 400);
    const { DB } = await aiRuntime(),
      now = new Date(),
      generatedAt = now.toISOString(),
      today = generatedAt.slice(0, 10),
      since = new Date(now.getTime() - days * 86_400_000).toISOString(),
      model = await DB.prepare("SELECT id,system_name,model_name,vendor,owner,status,risk_tier,review_date,updated_at FROM ai_model_inventory WHERE id=?").bind(modelId).first<Record<string, unknown>>();
    if (!model) return json({ error: "AI modeli bulunamadı." }, 404);
    const specs = [
      ["controls", "Uyum kontrolleri", "ai_control_assessments", "updated_at", "status IN ('implemented','not-applicable')"],
      ["risks", "AI riskleri", "ai_risks", "updated_at", "status IN ('closed','accepted')"],
      ["incidents", "AI olayları", "ai_incidents", "updated_at", "status='resolved'"],
      ["evidence", "Doğrulanmış kanıt", "ai_evidence", "updated_at", `status='approved' AND integrity_status='verified' AND valid_until>='${today}'`],
      ["vendors", "Tedarikçi güvencesi", "ai_vendor_assessments", "updated_at", `status IN ('approved','conditional') AND review_date>='${today}'`],
      ["access", "Erişim yönetişimi", "ai_access_assignments", "updated_at", `status='active' AND expires_at>='${today}' AND review_date>='${today}'`],
      ["impact", "Etki değerlendirmesi", "ai_impact_assessments", "updated_at", `status IN ('approved','conditional') AND review_date>='${today}'`],
      ["datasets", "Veri seti yönetişimi", "ai_datasets", "updated_at", `status='approved' AND review_date>='${today}'`],
      ["regulatory", "Regülasyon profili", "ai_regulatory_profiles", "updated_at", `status='approved' AND review_date>='${today}' AND gaps_json='[]'`],
      ["literacy", "Operatör yetkinliği", "ai_literacy_records", "updated_at", `status='approved' AND valid_until>='${today}' AND missing_json='[]'`],
      ["supplyChain", "Model supply chain", "ai_model_artifacts", "updated_at", `status='approved' AND valid_until>='${today}' AND blockers_json='[]'`],
      ["redTeam", "Red-team doğrulaması", "ai_red_team_campaigns", "updated_at", `status='approved' AND retest_at>='${today}' AND blockers_json='[]'`],
      ["transparency", "Şeffaflık ve sistem kartı", "ai_transparency_profiles", "updated_at", `status='approved' AND review_date>='${today}' AND gaps_json='[]'`],
      ["assurance", "Sürekli güvence", "ai_assurance_policies", "updated_at", `status='approved' AND review_date>='${today}'`],
      ["changes", "Değişiklik yaşam döngüsü", "ai_model_changes", "updated_at", "status IN ('approved','deployed')"],
      ["releases", "Üretim yayın kapısı", "ai_release_gates", "updated_at", `status='approved' AND valid_until>='${today}'`],
      ["exceptions", "AI istisna ve waiver", "ai_exceptions", "updated_at", `status='approved' AND expires_at>='${today}' AND review_at>='${today}'`],
      ["decommission", "AI emeklilik ve güvenli imha", "ai_decommission_plans", "updated_at", "status='completed'"],
      ["findings", "AI bulgu ve CAPA", "ai_findings", "updated_at", "status='resolved'"],
    ] as const;
    const rowSets = await Promise.all(specs.map((spec) => DB.prepare(`SELECT id,status,${spec[3]} AS event_at,CASE WHEN ${spec[4]} THEN 1 ELSE 0 END AS is_current FROM ${spec[2]} WHERE model_id=? AND ${spec[3]}>=? ORDER BY ${spec[3]} DESC LIMIT 200`).bind(modelId, since).all<Record<string, unknown>>()));
    const domains = specs.map((spec, index) => dossierDomain({ key: spec[0], label: spec[1], rows: rowSets[index].results || [], current: (row) => Number(row.is_current) === 1, dateKey: "event_at" })),
      evidenceRows = await DB.prepare("SELECT id,evidence_type,expected_sha256,integrity_status,collected_at,valid_until,status FROM ai_evidence WHERE model_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 200").bind(modelId, since).all<Record<string, unknown>>(),
      latestRelease = await DB.prepare("SELECT id,version,environment,readiness_score,status,valid_until,decided_by,decided_at,blockers_json FROM ai_release_gates WHERE model_id=? ORDER BY created_at DESC LIMIT 1").bind(modelId).first<Record<string, unknown>>(),
      payload = {
        schemaVersion: "1.0",
        generatedAt,
        generatedBy: access.actor.email,
        period: { days, since, until: generatedAt },
        model: { id: model.id, systemName: model.system_name, modelName: model.model_name, vendor: model.vendor, owner: model.owner, status: model.status, riskTier: model.risk_tier, reviewDate: model.review_date, updatedAt: model.updated_at },
        summary: { domains: domains.length, ready: domains.filter((item) => item.state === "ready").length, attention: domains.filter((item) => item.state === "attention").length, missing: domains.filter((item) => item.state === "missing").length, sourceRecords: domains.reduce((sum, item) => sum + item.records, 0) },
        domains,
        evidenceManifest: (evidenceRows.results || []).map((row) => ({ id: row.id, type: row.evidence_type, sha256: row.expected_sha256, integrity: row.integrity_status, collectedAt: row.collected_at, validUntil: row.valid_until, status: row.status })),
        latestRelease: latestRelease ? { id: latestRelease.id, version: latestRelease.version, environment: latestRelease.environment, readinessScore: Number(latestRelease.readiness_score), status: latestRelease.status, validUntil: latestRelease.valid_until, decidedBy: latestRelease.decided_by, decidedAt: latestRelease.decided_at, blockers: (() => { try { return JSON.parse(String(latestRelease.blockers_json || "[]")); } catch { return []; } })() } : null,
        limitations: ["Bu dosya belirtilen tarih aralığındaki yönetişim kayıtlarının deterministik özetidir.", "Kaynak kayıt içerikleri yerine kimlik, durum ve bütünlük referansları taşınır.", "Denetçi değerlendirmesinin veya insan onayının yerine geçmez."],
      },
      digest = await sha256Json(payload), dossier = { ...payload, integrity: { algorithm: "SHA-256", canonicalization: "sorted-json-v1", digest } },
      format = req.nextUrl.searchParams.get("format") || "json";
    await recordAiEvent(DB, { actor: access.actor.email, action: "assurance-dossier-export", model: String(model.model_name), promptHash: digest, contextRefs: domains.flatMap((item) => item.references).slice(0, 80), status: "success", detail: `${days} days; ${format}; ${domains.length} domains` });
    if (format === "csv") {
      const rows = [["Alan", "Durum", "Güncel kayıt", "Dönem kaydı", "Son kayıt", "Referanslar"], ...domains.map((item) => [item.label, item.state, item.current, item.records, item.latestAt || "", item.references.join("; ")]), ["Dosya bütünlüğü", "SHA-256", digest, "", generatedAt, modelId]];
      return new NextResponse(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`, { headers: { "cache-control": "no-store", "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=fornost-ai-dossier-${modelId}.csv` } });
    }
    return new NextResponse(JSON.stringify(dossier, null, 2), { headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename=fornost-ai-dossier-${modelId}.json` } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Denetim dosyası üretilemedi." }, 400);
  }
}
