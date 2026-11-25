import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
import {
  dossierDomain,
  dossierSigningKeyId,
  dossierWindow,
  sha256Json,
  signDossierDigest,
  verifyDossierDigest,
} from "@/app/ai/assurance-dossier";

const json = (data: unknown, status = 200) =>
    NextResponse.json(data, { status, headers: { "cache-control": "no-store" } }),
  csvCell = (value: unknown) => {
    const raw = String(value ?? ""), safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  },
  validId = (value: string) => /^[A-Za-z0-9-]{8,100}$/.test(value);

async function buildDossierPayload(
  DB: D1Database,
  modelId: string,
  days: 30 | 90 | 365,
  generatedBy: string,
  generatedAt = new Date().toISOString(),
  packageId?: string,
) {
  const now = new Date(generatedAt),
    today = generatedAt.slice(0, 10),
    since = new Date(now.getTime() - days * 86_400_000).toISOString(),
    model = await DB.prepare("SELECT id,system_name,model_name,vendor,owner,status,risk_tier,review_date,updated_at FROM ai_model_inventory WHERE id=?").bind(modelId).first<Record<string, unknown>>();
  if (!model) throw new Error("AI modeli bulunamadı.");
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
    ["regulatoryObligations", "Regülasyon yükümlülükleri", "ai_regulatory_obligations", "updated_at", "status='completed'"],
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
    ["assuranceAlerts", "AI güvence alarmları", "ai_assurance_alerts", "last_seen_at", "status='resolved'"],
  ] as const;
  const rowSets = await Promise.all(specs.map((spec) => DB.prepare(`SELECT id,status,${spec[3]} AS event_at,CASE WHEN ${spec[4]} THEN 1 ELSE 0 END AS is_current FROM ${spec[2]} WHERE model_id=? AND ${spec[3]}>=? ORDER BY ${spec[3]} DESC LIMIT 200`).bind(modelId, since).all<Record<string, unknown>>()));
  const domains = specs.map((spec, index) => dossierDomain({ key: spec[0], label: spec[1], rows: rowSets[index].results || [], current: (row) => Number(row.is_current) === 1, dateKey: "event_at" })),
    evidenceRows = await DB.prepare("SELECT id,evidence_type,expected_sha256,integrity_status,collected_at,valid_until,status FROM ai_evidence WHERE model_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 200").bind(modelId, since).all<Record<string, unknown>>(),
    latestRelease = await DB.prepare("SELECT id,version,environment,readiness_score,status,valid_until,decided_by,decided_at,blockers_json FROM ai_release_gates WHERE model_id=? ORDER BY created_at DESC LIMIT 1").bind(modelId).first<Record<string, unknown>>(),
    payload = {
      schemaVersion: "1.1",
      ...(packageId ? { package: { id: packageId, sealedAt: generatedAt } } : {}),
      generatedAt,
      generatedBy,
      period: { days, since, until: generatedAt },
      model: { id: model.id, systemName: model.system_name, modelName: model.model_name, vendor: model.vendor, owner: model.owner, status: model.status, riskTier: model.risk_tier, reviewDate: model.review_date, updatedAt: model.updated_at },
      summary: { domains: domains.length, ready: domains.filter((item) => item.state === "ready").length, attention: domains.filter((item) => item.state === "attention").length, missing: domains.filter((item) => item.state === "missing").length, sourceRecords: domains.reduce((sum, item) => sum + item.records, 0) },
      domains,
      evidenceManifest: (evidenceRows.results || []).map((row) => ({ id: row.id, type: row.evidence_type, sha256: row.expected_sha256, integrity: row.integrity_status, collectedAt: row.collected_at, validUntil: row.valid_until, status: row.status })),
      latestRelease: latestRelease ? { id: latestRelease.id, version: latestRelease.version, environment: latestRelease.environment, readinessScore: Number(latestRelease.readiness_score), status: latestRelease.status, validUntil: latestRelease.valid_until, decidedBy: latestRelease.decided_by, decidedAt: latestRelease.decided_at, blockers: (() => { try { return JSON.parse(String(latestRelease.blockers_json || "[]")); } catch { return []; } })() } : null,
      limitations: ["Bu dosya belirtilen tarih aralığındaki yönetişim kayıtlarının deterministik özetidir.", "Kaynak kayıt içerikleri yerine kimlik, durum ve bütünlük referansları taşınır.", "HMAC mührü sunucu kaynaklı bütünlük ve özgünlük kontrolüdür; nitelikli elektronik imza veya bağımsız regülasyon sertifikası değildir.", "Denetçi değerlendirmesinin veya insan onayının yerine geçmez."],
    };
  return { model, domains, payload, since };
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  try {
    const { DB } = await aiRuntime(), packageId = String(req.nextUrl.searchParams.get("packageId") || "").trim();
    if (packageId) {
      if (!validId(packageId)) return json({ error: "Geçerli paket kimliği zorunludur." }, 400);
      const stored = await DB.prepare("SELECT model_id,manifest_json,manifest_sha256 FROM ai_assurance_packages WHERE id=?").bind(packageId).first<Record<string, unknown>>();
      if (!stored) return json({ error: "Mühürlü denetim paketi bulunamadı." }, 404);
      await recordAiEvent(DB, { actor: access.actor.email, action: "assurance-package-download", promptHash: String(stored.manifest_sha256), contextRefs: [packageId, String(stored.model_id)], status: "success", detail: "Immutable sealed manifest downloaded" });
      return new NextResponse(String(stored.manifest_json), { headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename=fornost-ai-assurance-package-${packageId}.json` } });
    }
    const modelId = String(req.nextUrl.searchParams.get("modelId") || "").trim();
    if (!modelId || modelId.length > 100) return json({ error: "Geçerli AI modeli zorunludur." }, 400);
    if (req.nextUrl.searchParams.get("list") === "1") {
      const packages = await DB.prepare("SELECT id,model_id,period_days,manifest_sha256,signature_algorithm,signing_key_id,generated_by,generated_at,verification_count,last_verified_at FROM ai_assurance_packages WHERE model_id=? ORDER BY generated_at DESC LIMIT 20").bind(modelId).all<Record<string, unknown>>();
      return json({ packages: packages.results || [] });
    }
    const days = dossierWindow(req.nextUrl.searchParams.get("days")),
      { model, domains, payload } = await buildDossierPayload(DB, modelId, days, access.actor.email),
      digest = await sha256Json(payload),
      dossier = { ...payload, integrity: { algorithm: "SHA-256", canonicalization: "sorted-json-v1", digest, sealed: false } },
      format = req.nextUrl.searchParams.get("format") || "json";
    await recordAiEvent(DB, { actor: access.actor.email, action: "assurance-dossier-export", model: String(model.model_name), promptHash: digest, contextRefs: domains.flatMap((item) => item.references).slice(0, 80), status: "success", detail: `${days} days; ${format}; ${domains.length} domains; ephemeral` });
    if (format === "csv") {
      const rows = [["Alan", "Durum", "Güncel kayıt", "Dönem kaydı", "Son kayıt", "Referanslar"], ...domains.map((item) => [item.label, item.state, item.current, item.records, item.latestAt || "", item.references.join("; ")]), ["Dosya bütünlüğü", "SHA-256", digest, "", payload.generatedAt, modelId]];
      return new NextResponse(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`, { headers: { "cache-control": "no-store", "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=fornost-ai-dossier-${modelId}.csv` } });
    }
    return new NextResponse(JSON.stringify(dossier, null, 2), { headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename=fornost-ai-dossier-${modelId}.json` } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Denetim dosyası üretilemedi." }, 400);
  }
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  try {
    const body = await req.json() as Record<string, unknown>, action = String(body.action || ""), env = await aiRuntime(), secret = String(env.FORNOST_DOSSIER_SIGNING_KEY || "").trim();
    if (secret.length < 32) return json({ error: "Denetim paketi imzalama anahtarı yapılandırılmamış." }, 503);
    if (action === "seal") {
      const modelId = String(body.modelId || "").trim(), days = dossierWindow(body.days);
      if (!modelId || modelId.length > 100 || body.confirmation !== "DENETİM PAKETİNİ MÜHÜRLE") return json({ error: "Model ve DENETİM PAKETİNİ MÜHÜRLE onayı zorunludur." }, 400);
      const id = `AIDP-${crypto.randomUUID()}`, generatedAt = new Date().toISOString(),
        { model, domains, payload, since } = await buildDossierPayload(env.DB, modelId, days, access.actor.email, generatedAt, id),
        digest = await sha256Json(payload), signature = await signDossierDigest(digest, secret), keyId = await dossierSigningKeyId(secret),
        dossier = { ...payload, integrity: { algorithm: "SHA-256", canonicalization: "sorted-json-v1", digest, sealed: true, seal: { algorithm: "HMAC-SHA-256", keyId, signature, signedAt: generatedAt } } },
        manifest = JSON.stringify(dossier, null, 2);
      await env.DB.prepare("INSERT INTO ai_assurance_packages(id,model_id,period_days,period_since,period_until,schema_version,manifest_json,manifest_sha256,signature_algorithm,signature_value,signing_key_id,generated_by,generated_at) VALUES(?,?,?,?,?,'1.1',?,?,?,?,?,?,?)").bind(id, modelId, days, since, generatedAt, manifest, digest, "HMAC-SHA-256", signature, keyId, access.actor.email, generatedAt).run();
      await recordAiEvent(env.DB, { actor: access.actor.email, action: "assurance-package-seal", model: String(model.model_name), promptHash: digest, contextRefs: [id, ...domains.flatMap((item) => item.references).slice(0, 79)], status: "success", detail: `${days} days; ${domains.length} domains; ${keyId}; immutable` });
      return json({ ok: true, id, digest, signatureAlgorithm: "HMAC-SHA-256", keyId, downloadUrl: `/api/ai/dossier?packageId=${encodeURIComponent(id)}` }, 201);
    }
    if (action === "verify") {
      const id = String(body.packageId || "").trim();
      if (!validId(id)) return json({ error: "Geçerli paket kimliği zorunludur." }, 400);
      const stored = await env.DB.prepare("SELECT * FROM ai_assurance_packages WHERE id=?").bind(id).first<Record<string, unknown>>();
      if (!stored) return json({ error: "Mühürlü denetim paketi bulunamadı." }, 404);
      const manifest = JSON.parse(String(stored.manifest_json)) as Record<string, unknown>, unsignedPayload = { ...manifest };
      delete unsignedPayload.integrity;
      const recomputedDigest = await sha256Json(unsignedPayload), keyId = await dossierSigningKeyId(secret),
        digestMatch = recomputedDigest === stored.manifest_sha256, keyMatch = keyId === stored.signing_key_id,
        signatureValid = keyMatch && await verifyDossierDigest(String(stored.manifest_sha256), String(stored.signature_value), secret), valid = digestMatch && signatureValid,
        verifiedAt = new Date().toISOString();
      if (valid) await env.DB.prepare("UPDATE ai_assurance_packages SET verification_count=verification_count+1,last_verified_by=?,last_verified_at=? WHERE id=?").bind(access.actor.email, verifiedAt, id).run();
      await recordAiEvent(env.DB, { actor: access.actor.email, action: "assurance-package-verify", promptHash: recomputedDigest, contextRefs: [id, String(stored.model_id)], status: valid ? "success" : "error", detail: `digest ${digestMatch}; signature ${signatureValid}; key ${keyMatch}` });
      return json({ valid, packageId: id, digestMatch, signatureValid, keyMatch, keyId: stored.signing_key_id, verifiedAt });
    }
    return json({ error: "Geçerli işlem zorunludur." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Denetim paketi işlemi tamamlanamadı." }, 400);
  }
}
