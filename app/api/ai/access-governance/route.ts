import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { accessAttention, validateAiAccess } from "@/app/ai/access-governance";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
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
  map = (r: Record<string, unknown>) => ({
    id: r.id,
    modelId: r.model_id,
    principalType: r.principal_type,
    principal: r.principal,
    displayName: r.display_name,
    accessLevel: r.access_level,
    dataScope: r.data_scope,
    purpose: r.purpose,
    owner: r.owner,
    mfa: Boolean(r.mfa),
    conditionalAccess: Boolean(r.conditional_access),
    jit: Boolean(r.jit),
    managedIdentity: Boolean(r.managed_identity),
    keyRotationDays: Number(r.key_rotation_days),
    riskScore: Number(r.risk_score),
    riskTier: r.risk_tier,
    lastUsed: r.last_used,
    expiresAt: r.expires_at,
    reviewDate: r.review_date,
    status: r.status,
    reviewNote: r.review_note,
    createdBy: r.created_by,
    certifiedBy: r.certified_by,
    attention: accessAttention({
      status: String(r.status),
      principalType: String(r.principal_type),
      lastUsed: String(r.last_used),
      expiresAt: String(r.expires_at),
      reviewDate: String(r.review_date),
    }),
  });
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, assignments] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_access_assignments ORDER BY risk_score DESC,updated_at DESC LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (assignments.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const data = [
      [
        "Kimlik",
        "Ad",
        "Tür",
        "Model",
        "Erişim",
        "Veri kapsamı",
        "Sorumlu",
        "MFA",
        "CA",
        "JIT",
        "Managed ID",
        "Rotasyon",
        "Risk",
        "Son kullanım",
        "Bitiş",
        "İnceleme",
        "Durum",
        "Dikkat",
      ],
      ...rows.map((r) => [
        r.principal,
        r.displayName,
        r.principalType,
        r.modelId,
        r.accessLevel,
        r.dataScope,
        r.owner,
        r.mfa,
        r.conditionalAccess,
        r.jit,
        r.managedIdentity,
        r.keyRotationDays,
        `${r.riskTier} ${r.riskScore}`,
        r.lastUsed,
        r.expiresAt,
        r.reviewDate,
        r.status,
        r.attention,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-access-review.csv",
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
    assignments: rows,
    summary: {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      highRisk: rows.filter((r) =>
        ["Critical", "High"].includes(String(r.riskTier)),
      ).length,
      inactive: rows.filter((r) => r.attention === "inactive").length,
      overdue: rows.filter((r) =>
        ["expired", "review-overdue"].includes(r.attention),
      ).length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 24_576)
    return json({ error: "AI erişim isteği çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateAiAccess(body);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Erişim doğrulanamadı.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime();
  if (
    !(await DB.prepare("SELECT id FROM ai_model_inventory WHERE id=?")
      .bind(v.modelId)
      .first())
  )
    return json({ error: "AI modeli bulunamadı." }, 409);
  const id = `AIA-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_access_assignments(id,model_id,principal_type,principal,display_name,access_level,data_scope,purpose,owner,mfa,conditional_access,jit,managed_identity,key_rotation_days,risk_score,risk_tier,last_used,expires_at,review_date,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?)",
    )
      .bind(
        id,
        v.modelId,
        v.principalType,
        v.principal.toLowerCase(),
        v.displayName,
        v.accessLevel,
        v.dataScope,
        v.purpose,
        v.owner,
        v.mfa ? 1 : 0,
        v.conditionalAccess ? 1 : 0,
        v.jit ? 1 : 0,
        v.managedIdentity ? 1 : 0,
        v.keyRotationDays,
        v.score,
        v.tier,
        v.lastUsed,
        v.expiresAt,
        v.reviewDate,
        access.actor.email,
        now,
        access.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Bu kimliğin aynı AI modeli için erişim kaydı zaten var." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-access-create",
    contextRefs: [v.modelId],
    status: "success",
    detail: `${id}; ${v.principalType}; ${v.accessLevel}; risk ${v.tier}`,
  });
  return json({ id, riskScore: v.score, riskTier: v.tier }, 201);
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    action = cleanAiText(body.action, 20),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 30);
  if (
    !["certify", "revoke"].includes(action) ||
    note.length < 5 ||
    confirmation !==
      (action === "certify" ? "ERİŞİMİ ONAYLA" : "ERİŞİMİ KALDIR")
  )
    return json(
      { error: "İşlem, gerekçe ve doğru onay metni zorunludur." },
      400,
    );
  const { DB } = await aiRuntime(),
    row = await DB.prepare("SELECT * FROM ai_access_assignments WHERE id=?")
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Erişim kaydı bulunamadı." }, 404);
  if (action === "certify") {
    if (row.created_by === access.actor.email)
      return json(
        { error: "Erişim kaydını oluşturan kişi aynı erişimi onaylayamaz." },
        409,
      );
    const attention = accessAttention({
      status: String(row.status),
      principalType: String(row.principal_type),
      lastUsed: String(row.last_used),
      expiresAt: String(row.expires_at),
      reviewDate: String(row.review_date),
    });
    if (attention !== "current")
      return json(
        {
          error:
            "Süresi geçmiş, inaktif veya incelemesi gecikmiş erişim onaylanamaz.",
        },
        409,
      );
    const machine = ["service-account", "workload"].includes(
      String(row.principal_type),
    );
    if (
      machine &&
      !Boolean(row.managed_identity) &&
      Number(row.key_rotation_days) > 90
    )
      return json(
        {
          error:
            "Makine kimliği managed identity veya en fazla 90 günlük anahtar rotasyonu gerektirir.",
        },
        409,
      );
    if (
      !machine &&
      ["admin", "manage"].includes(String(row.access_level)) &&
      (!Boolean(row.mfa) || !Boolean(row.conditional_access))
    )
      return json(
        {
          error:
            "Ayrıcalıklı insan erişimi MFA ve Conditional Access gerektirir.",
        },
        409,
      );
  }
  const now = new Date().toISOString(),
    status = action === "certify" ? "active" : "revoked";
  await DB.prepare(
    "UPDATE ai_access_assignments SET status=?,review_note=?,certified_by=?,certified_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(status, note, access.actor.email, now, access.actor.email, now, id)
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-access-${action}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed; ${row.principal_type}; ${row.access_level}`,
  });
  return json({ ok: true, status });
}
