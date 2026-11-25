import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  transparencyAttention,
  validateOversightEvent,
  validateTransparencyProfile,
} from "@/app/ai/transparency";
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
  profile = (row: Record<string, unknown>) => ({
    id: row.id,
    modelId: row.model_id,
    intendedUse: row.intended_use,
    prohibitedUses: row.prohibited_uses,
    capabilities: row.capabilities,
    limitations: row.limitations,
    explanationMethod: row.explanation_method,
    humanOversight: row.human_oversight,
    noticeText: row.notice_text,
    appealChannel: row.appeal_channel,
    owner: row.owner,
    affectedGroups: row.affected_groups,
    languages: parse(row.languages_json),
    reviewDate: row.review_date,
    gaps: parse(row.gaps_json),
    status: row.status,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    attention: transparencyAttention(
      String(row.status),
      String(row.review_date),
    ),
  }),
  event = (row: Record<string, unknown>) => ({
    id: row.id,
    modelId: row.model_id,
    decisionReference: row.decision_reference,
    action: row.action,
    severity: row.severity,
    reason: row.reason,
    outcome: row.outcome,
    controlOwner: row.control_owner,
    status: row.status,
    resolutionNote: row.resolution_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
  });

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, profilesResult, eventsResult] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_transparency_profiles ORDER BY review_date,status LIMIT 1000",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_oversight_events ORDER BY created_at DESC LIMIT 1000",
      ).all<Record<string, unknown>>(),
    ]),
    profiles = (profilesResult.results || []).map(profile),
    events = (eventsResult.results || []).map(event);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const rows = [
      [
        "Tür",
        "Kayıt",
        "Model",
        "Durum",
        "Review/oluşturma",
        "Sahip",
        "Açık/gerekçe",
      ],
      ...profiles.map((x) => [
        "system-card",
        x.id,
        x.modelId,
        x.status,
        x.reviewDate,
        x.owner,
        x.gaps.join("; "),
      ]),
      ...events.map((x) => [
        "oversight",
        x.id,
        x.modelId,
        x.status,
        x.createdAt,
        x.controlOwner,
        `${x.severity}; ${x.action}; ${x.reason}`,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-transparency-oversight.csv",
        },
      },
    );
  }
  return json({
    models: models.results || [],
    profiles,
    events,
    summary: {
      profiles: profiles.length,
      current: profiles.filter(
        (x) => x.status === "approved" && x.attention === "current",
      ).length,
      gaps: profiles.filter((x) => x.gaps.length).length,
      openOversight: events.filter((x) => x.status === "open").length,
      highRisk: events.filter(
        (x) =>
          x.status === "open" &&
          ["high", "critical"].includes(String(x.severity)),
      ).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    type = cleanAiText(body.type, 30),
    { DB } = await aiRuntime();
  if (type === "profile") {
    let value;
    try {
      value = validateTransparencyProfile(body);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Sistem kartı geçersiz.",
        },
        400,
      );
    }
    const model = await DB.prepare(
      "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(value.modelId)
      .first();
    if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
    const id = `AITP-${crypto.randomUUID()}`,
      now = new Date().toISOString();
    try {
      await DB.prepare(
        "INSERT INTO ai_transparency_profiles(id,model_id,intended_use,prohibited_uses,capabilities,limitations,explanation_method,human_oversight,notice_text,appeal_channel,owner,affected_groups,languages_json,review_date,gaps_json,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
      )
        .bind(
          id,
          value.modelId,
          value.intendedUse,
          value.prohibitedUses,
          value.capabilities,
          value.limitations,
          value.explanationMethod,
          value.humanOversight,
          value.noticeText,
          value.appealChannel,
          value.owner,
          value.affectedGroups,
          JSON.stringify(value.languages),
          value.reviewDate,
          JSON.stringify(value.gaps),
          access.actor.email,
          now,
          access.actor.email,
          now,
        )
        .run();
    } catch {
      return json(
        { error: "Bu AI modeli için sistem kartı zaten mevcut." },
        409,
      );
    }
    await recordAiEvent(DB, {
      actor: access.actor.email,
      action: "ai-transparency-profile-create",
      contextRefs: [value.modelId],
      status: value.gaps.length ? "denied" : "success",
      detail: `${id}; gaps ${value.gaps.join(",") || "none"}`,
    });
    return json({ id, gaps: value.gaps }, 201);
  }
  if (type === "oversight") {
    let value;
    try {
      value = validateOversightEvent(body);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Gözetim kaydı geçersiz.",
        },
        400,
      );
    }
    const model = await DB.prepare(
      "SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'",
    )
      .bind(value.modelId)
      .first();
    if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 404);
    const id = `AIOV-${crypto.randomUUID()}`,
      now = new Date().toISOString();
    try {
      await DB.prepare(
        "INSERT INTO ai_oversight_events(id,model_id,decision_reference,action,severity,reason,outcome,control_owner,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,'open',?,?)",
      )
        .bind(
          id,
          value.modelId,
          value.decisionReference,
          value.action,
          value.severity,
          value.reason,
          value.outcome,
          value.controlOwner,
          access.actor.email,
          now,
        )
        .run();
    } catch {
      return json(
        { error: "Aynı karar ve insan aksiyonu zaten kayıtlı." },
        409,
      );
    }
    await recordAiEvent(DB, {
      actor: access.actor.email,
      action: `ai-human-oversight-${value.action}`,
      contextRefs: [value.modelId],
      status: ["high", "critical"].includes(value.severity)
        ? "denied"
        : "success",
      detail: `${id}; ${value.severity}; decision-ref only`,
    });
    return json({ id }, 201);
  }
  return json({ error: "Geçerli kayıt türü zorunludur." }, 400);
}

export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    type = cleanAiText(body.type, 30),
    id = cleanAiText(body.id, 100),
    note = redactSensitiveText(body.note, 1000),
    confirmation = cleanAiText(body.confirmation, 50),
    { DB } = await aiRuntime();
  if (type === "profile-decision") {
    const status = cleanAiText(body.status, 20),
      phrases: Record<string, string> = {
        approved: "SİSTEM KARTINI ONAYLA",
        rejected: "SİSTEM KARTINI REDDET",
        retired: "SİSTEM KARTINI EMEKLİ ET",
      };
    if (!phrases[status] || note.length < 5 || confirmation !== phrases[status])
      return json(
        {
          error: `Geçerli karar, gerekçe ve ${phrases[status] || "onay metni"} zorunludur.`,
        },
        400,
      );
    const row = await DB.prepare(
      "SELECT model_id,created_by,gaps_json,review_date FROM ai_transparency_profiles WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row) return json({ error: "Sistem kartı bulunamadı." }, 404);
    if (status === "approved") {
      if (row.created_by === access.actor.email)
        return json(
          { error: "Kaydı oluşturan kişi aynı sistem kartını onaylayamaz." },
          409,
        );
      if (parse(row.gaps_json).length)
        return json(
          { error: "Şeffaflık boşlukları kapanmadan onay verilemez." },
          409,
        );
      if (String(row.review_date) < new Date().toISOString().slice(0, 10))
        return json(
          { error: "Review tarihi geçmiş sistem kartı onaylanamaz." },
          409,
        );
    }
    const now = new Date().toISOString();
    await DB.prepare(
      "UPDATE ai_transparency_profiles SET status=?,decision_note=?,approved_by=?,approved_at=?,updated_by=?,updated_at=? WHERE id=?",
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
      action: `ai-transparency-profile-${status}`,
      contextRefs: [String(row.model_id)],
      status: "success",
      detail: `${id}; human-confirmed`,
    });
    return json({ ok: true });
  }
  if (type === "oversight-resolve") {
    if (note.length < 10 || confirmation !== "GÖZETİM BULGUSUNU KAPAT")
      return json(
        {
          error:
            "En az 10 karakter çözüm kanıtı ve GÖZETİM BULGUSUNU KAPAT onayı zorunludur.",
        },
        400,
      );
    const row = await DB.prepare(
      "SELECT model_id,created_by,status,severity FROM ai_oversight_events WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row) return json({ error: "Gözetim kaydı bulunamadı." }, 404);
    if (row.status !== "open")
      return json({ error: "Gözetim kaydı zaten kapalı." }, 409);
    if (
      ["high", "critical"].includes(String(row.severity)) &&
      row.created_by === access.actor.email
    )
      return json(
        { error: "Yüksek/kritik gözetim kaydını açan kişi kapatamaz." },
        409,
      );
    const now = new Date().toISOString();
    await DB.prepare(
      "UPDATE ai_oversight_events SET status='resolved',resolution_note=?,resolved_by=?,resolved_at=? WHERE id=?",
    )
      .bind(note, access.actor.email, now, id)
      .run();
    await recordAiEvent(DB, {
      actor: access.actor.email,
      action: "ai-human-oversight-resolved",
      contextRefs: [String(row.model_id)],
      status: "success",
      detail: `${id}; independently-resolved`,
    });
    return json({ ok: true });
  }
  return json({ error: "Geçerli işlem türü zorunludur." }, 400);
}
