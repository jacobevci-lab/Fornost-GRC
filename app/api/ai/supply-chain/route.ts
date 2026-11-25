import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  artifactAttention,
  validateModelArtifact,
} from "@/app/ai/supply-chain";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
const json = (d: unknown, s = 200) =>
    NextResponse.json(d, {
      status: s,
      headers: { "cache-control": "no-store" },
    }),
  parse = (v: unknown) => {
    try {
      return JSON.parse(String(v || "[]"));
    } catch {
      return [];
    }
  },
  cell = (v: unknown) => {
    const r = String(v ?? ""),
      x = /^[=+\-@]/.test(r) ? `'${r}` : r;
    return `"${x.replace(/"/g, '""')}"`;
  },
  map = (r: Record<string, unknown>) => ({
    id: r.id,
    modelId: r.model_id,
    version: r.version,
    artifactType: r.artifact_type,
    source: r.source,
    supplier: r.supplier,
    sha256: r.sha256,
    signatureVerified: !!r.signature_verified,
    signatureIssuer: r.signature_issuer,
    license: r.license,
    sbomReference: r.sbom_reference,
    scanner: r.scanner,
    scanDate: r.scan_date,
    malwareClean: !!r.malware_clean,
    criticalVulnerabilities: Number(r.critical_vulnerabilities),
    highVulnerabilities: Number(r.high_vulnerabilities),
    unsafeFormats: !!r.unsafe_formats,
    reproducible: !!r.reproducible,
    provenance: r.provenance,
    validUntil: r.valid_until,
    blockers: parse(r.blockers_json),
    status: r.status,
    createdBy: r.created_by,
    approvedBy: r.approved_by,
    attention: artifactAttention(String(r.status), String(r.valid_until)),
  });
export async function GET(req: NextRequest) {
  const a = await requireRole(req, ["Admin"]);
  if (a.response) return a.response;
  const { DB } = await aiRuntime(),
    [models, result] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_model_artifacts ORDER BY valid_until,status LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (result.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const d = [
      [
        "Artifact",
        "Model",
        "Sürüm",
        "Tür",
        "Tedarikçi",
        "SHA-256",
        "İmza",
        "SBOM",
        "Tarayıcı",
        "Kritik",
        "Yüksek",
        "Geçerlilik",
        "Durum",
        "Engeller",
      ],
      ...rows.map((x) => [
        x.id,
        x.modelId,
        x.version,
        x.artifactType,
        x.supplier,
        x.sha256,
        x.signatureVerified,
        x.sbomReference,
        x.scanner,
        x.criticalVulnerabilities,
        x.highVulnerabilities,
        x.validUntil,
        x.status,
        x.blockers.join("; "),
      ]),
    ];
    return new NextResponse(
      `\uFEFF${d.map((r) => r.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-model-supply-chain.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    artifacts: rows,
    summary: {
      total: rows.length,
      approved: rows.filter(
        (x) => x.status === "approved" && x.attention === "current",
      ).length,
      blocked: rows.filter((x) => x.blockers.length).length,
      expiring: rows.filter((x) => x.attention === "expires-soon").length,
      vulnerable: rows.filter(
        (x) => x.criticalVulnerabilities + x.highVulnerabilities > 0,
      ).length,
    },
  });
}
export async function POST(req: NextRequest) {
  const a = await requireRole(req, ["Admin"]);
  if (a.response) return a.response;
  const b = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateModelArtifact(b);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Artifact geçersiz." },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    m = await DB.prepare(
      "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(v.modelId)
      .first();
  if (!m) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
  const id = `AIMA-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_model_artifacts(id,model_id,version,artifact_type,source,supplier,sha256,signature_verified,signature_issuer,license,sbom_reference,scanner,scan_date,malware_clean,critical_vulnerabilities,high_vulnerabilities,unsafe_formats,reproducible,provenance,valid_until,blockers_json,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
    )
      .bind(
        id,
        v.modelId,
        v.version,
        v.artifactType,
        v.source,
        v.supplier,
        v.sha256,
        v.signatureVerified ? 1 : 0,
        v.signatureIssuer,
        v.license,
        v.sbomReference,
        v.scanner,
        v.scanDate,
        v.malwareClean ? 1 : 0,
        v.criticalVulnerabilities,
        v.highVulnerabilities,
        v.unsafeFormats ? 1 : 0,
        v.reproducible ? 1 : 0,
        v.provenance,
        v.validUntil,
        JSON.stringify(v.blockers),
        a.actor.email,
        now,
        a.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Aynı model sürümü ve artifact hash'i zaten kayıtlı." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: a.actor.email,
    action: "ai-model-artifact-create",
    contextRefs: [v.modelId],
    status: v.blockers.length ? "denied" : "success",
    detail: `${id}; sha256 ${v.sha256.slice(0, 12)}; blockers ${v.blockers.join(",") || "none"}`,
  });
  return json({ id, blockers: v.blockers }, 201);
}
export async function PATCH(req: NextRequest) {
  const a = await requireRole(req, ["Admin"]);
  if (a.response) return a.response;
  const b = await req.json().catch(() => ({})),
    id = cleanAiText(b.id, 100),
    status = cleanAiText(b.status, 20),
    note = redactSensitiveText(b.note, 1000),
    confirmation = cleanAiText(b.confirmation, 50),
    p: Record<string, string> = {
      approved: "ARTIFACTI ONAYLA",
      rejected: "ARTIFACTI REDDET",
      retired: "ARTIFACTI EMEKLİ ET",
    };
  if (!p[status] || note.length < 5 || confirmation !== p[status])
    return json(
      {
        error: `Geçerli karar, gerekçe ve ${p[status] || "onay metni"} zorunludur.`,
      },
      400,
    );
  const { DB } = await aiRuntime(),
    r = await DB.prepare(
      "SELECT model_id,created_by,blockers_json,valid_until FROM ai_model_artifacts WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!r) return json({ error: "Artifact bulunamadı." }, 404);
  if (status === "approved") {
    if (r.created_by === a.actor.email)
      return json(
        { error: "Kaydı oluşturan kişi aynı artifactı onaylayamaz." },
        409,
      );
    if (parse(r.blockers_json).length)
      return json(
        { error: "Supply-chain engelleri giderilmeden onay verilemez." },
        409,
      );
    if (String(r.valid_until) < new Date().toISOString().slice(0, 10))
      return json({ error: "Süresi geçmiş tarama onaylanamaz." }, 409);
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_model_artifacts SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(
      status,
      note,
      status === "approved" ? a.actor.email : null,
      status === "approved" ? now : null,
      a.actor.email,
      now,
      id,
    )
    .run();
  await recordAiEvent(DB, {
    actor: a.actor.email,
    action: `ai-model-artifact-${status}`,
    contextRefs: [String(r.model_id)],
    status: "success",
    detail: `${id}; human-confirmed`,
  });
  return json({ ok: true });
}
