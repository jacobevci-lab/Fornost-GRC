import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { literacyAttention, validateLiteracy } from "@/app/ai/literacy";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
const json = (d: unknown, s = 200) =>
    NextResponse.json(d, {
      status: s,
      headers: { "cache-control": "no-store" },
    }),
  cell = (v: unknown) => {
    const r = String(v ?? ""),
      x = /^[=+\-@]/.test(r) ? `'${r}` : r;
    return `"${x.replace(/"/g, '""')}"`;
  },
  parse = (v: unknown) => {
    try {
      return JSON.parse(String(v || "[]"));
    } catch {
      return [];
    }
  },
  map = (r: Record<string, unknown>) => ({
    id: r.id,
    modelId: r.model_id,
    principal: r.principal,
    displayName: r.display_name,
    role: r.operator_role,
    manager: r.manager,
    requiredModules: parse(r.required_modules_json),
    completedModules: parse(r.completed_modules_json),
    missing: parse(r.missing_json),
    score: Number(r.score),
    attested: !!r.attested,
    trainedAt: r.trained_at,
    validUntil: r.valid_until,
    status: r.status,
    decisionNote: r.decision_note,
    createdBy: r.created_by,
    approvedBy: r.approved_by,
    attention: literacyAttention(String(r.status), String(r.valid_until)),
  });
export async function GET(req: NextRequest) {
  const a = await requireRole(req, ["Admin"]);
  if (a.response) return a.response;
  const { DB } = await aiRuntime(),
    [models, result] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,risk_tier FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_literacy_records ORDER BY valid_until,status LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (result.results || []).map(map);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const data = [
      [
        "Kayıt",
        "Model",
        "Çalışan",
        "Rol",
        "Yönetici",
        "Skor",
        "Eksikler",
        "Eğitim",
        "Geçerlilik",
        "Durum",
      ],
      ...rows.map((x) => [
        x.id,
        x.modelId,
        x.principal,
        x.role,
        x.manager,
        x.score,
        x.missing.join("; "),
        x.trainedAt,
        x.validUntil,
        x.status,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((r) => r.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=fornost-ai-literacy.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    records: rows,
    summary: {
      total: rows.length,
      approved: rows.filter(
        (x) => x.status === "approved" && x.attention === "current",
      ).length,
      gaps: rows.filter((x) => x.missing.length).length,
      expiring: rows.filter((x) => x.attention === "expires-soon").length,
      expired: rows.filter((x) => x.attention === "expired").length,
    },
  });
}
export async function POST(req: NextRequest) {
  const a = await requireRole(req, ["Admin"]);
  if (a.response) return a.response;
  const body = await req.json().catch(() => ({})),
    { DB } = await aiRuntime(),
    m = await DB.prepare(
      "SELECT risk_tier FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(cleanAiText(body.modelId, 100))
      .first<Record<string, unknown>>();
  if (!m) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
  let v;
  try {
    v = validateLiteracy(body, String(m.risk_tier || "Medium"));
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Kayıt geçersiz." },
      400,
    );
  }
  const id = `AIL-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  try {
    await DB.prepare(
      "INSERT INTO ai_literacy_records(id,model_id,principal,display_name,operator_role,manager,required_modules_json,completed_modules_json,missing_json,score,attested,limitations_acknowledged,incident_duty_acknowledged,trained_at,valid_until,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?)",
    )
      .bind(
        id,
        v.modelId,
        v.principal,
        v.displayName,
        v.role,
        v.manager,
        JSON.stringify(v.requiredModules),
        JSON.stringify(v.completedModules),
        JSON.stringify(v.missing),
        v.score,
        v.attested ? 1 : 0,
        v.limitationsAcknowledged ? 1 : 0,
        v.incidentDutyAcknowledged ? 1 : 0,
        v.trainedAt,
        v.validUntil,
        a.actor.email,
        now,
        a.actor.email,
        now,
      )
      .run();
  } catch {
    return json(
      { error: "Bu model, çalışan ve rol için etkin kayıt zaten var." },
      409,
    );
  }
  await recordAiEvent(DB, {
    actor: a.actor.email,
    action: "ai-literacy-record",
    contextRefs: [v.modelId],
    status: v.missing.length ? "denied" : "success",
    detail: `${id}; ${v.role}; score ${v.score}; missing ${v.missing.join(",") || "none"}`,
  });
  return json({ id, required: v.requiredModules, missing: v.missing }, 201);
}
export async function PATCH(req: NextRequest) {
  const a = await requireRole(req, ["Admin"]);
  if (a.response) return a.response;
  const b = await req.json().catch(() => ({})),
    id = cleanAiText(b.id, 100),
    status = cleanAiText(b.status, 20),
    note = redactSensitiveText(b.note, 1000),
    confirmation = cleanAiText(b.confirmation, 50),
    phrases: Record<string, string> = {
      approved: "YETKİNLİĞİ ONAYLA",
      rejected: "YETKİNLİĞİ REDDET",
      revoked: "YETKİYİ GERİ ÇEK",
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
      "SELECT model_id,created_by,missing_json,valid_until FROM ai_literacy_records WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Yetkinlik kaydı bulunamadı." }, 404);
  if (status === "approved") {
    if (row.created_by === a.actor.email)
      return json(
        { error: "Kaydı oluşturan kişi aynı yetkinliği onaylayamaz." },
        409,
      );
    if (parse(row.missing_json).length)
      return json(
        { error: "Eksik eğitim veya attestation varken onay verilemez." },
        409,
      );
    if (String(row.valid_until) < new Date().toISOString().slice(0, 10))
      return json({ error: "Süresi geçmiş yetkinlik onaylanamaz." }, 409);
  }
  const now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_literacy_records SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
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
    action: `ai-literacy-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id}; human-confirmed`,
  });
  return json({ ok: true });
}
