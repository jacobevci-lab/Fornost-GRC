import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  evidenceExpiryState,
  normalizeSha256,
  validateAiEvidence,
} from "@/app/ai/evidence";
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
    controlId: r.control_id,
    changeId: r.change_id,
    incidentId: r.incident_id,
    type: r.evidence_type,
    title: r.title,
    description: r.description,
    source: r.source,
    collectionMethod: r.collection_method,
    classification: r.classification,
    owner: r.owner,
    expectedHash: r.expected_sha256,
    integrityStatus: r.integrity_status,
    verifiedAt: r.verified_at,
    collectedAt: r.collected_at,
    validUntil: r.valid_until,
    status: r.status,
    expiryState: evidenceExpiryState(String(r.valid_until), String(r.status)),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    decisionNote: r.decision_note,
  });
async function linked(
  db: D1Database,
  v: {
    modelId: string;
    controlId: string;
    changeId: string;
    incidentId: string;
  },
) {
  if (
    !(await db
      .prepare("SELECT id FROM ai_model_inventory WHERE id=?")
      .bind(v.modelId)
      .first())
  )
    throw new Error("AI modeli bulunamadı.");
  for (const [id, sql, message] of [
    [
      v.controlId,
      "SELECT id FROM ai_control_assessments WHERE id=? AND model_id=?",
      "Kontrol bu modele ait değil.",
    ],
    [
      v.changeId,
      "SELECT id FROM ai_model_changes WHERE id=? AND model_id=?",
      "Değişiklik bu modele ait değil.",
    ],
    [
      v.incidentId,
      "SELECT id FROM ai_incidents WHERE id=? AND model_id=?",
      "Olay bu modele ait değil.",
    ],
  ] as const) {
    if (id && !(await db.prepare(sql).bind(id, v.modelId).first()))
      throw new Error(message);
  }
}
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(),
    [models, controls, changes, incidents, evidence] = await Promise.all([
      DB.prepare(
        "SELECT id,system_name,model_name,status FROM ai_model_inventory ORDER BY system_name LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT id,model_id,framework,control_id,title FROM ai_control_assessments ORDER BY updated_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT id,model_id,from_version,to_version,status FROM ai_model_changes ORDER BY created_at DESC LIMIT 300",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT id,model_id,title,status FROM ai_incidents ORDER BY created_at DESC LIMIT 300",
      ).all<Record<string, unknown>>(),
      DB.prepare(
        "SELECT * FROM ai_evidence ORDER BY created_at DESC LIMIT 500",
      ).all<Record<string, unknown>>(),
    ]),
    rows = (evidence.results || []).map(map);
  if (
    req.nextUrl.searchParams.get("format") === "csv" ||
    req.nextUrl.searchParams.get("format") === "manifest"
  ) {
    if (access.actor.role !== "Admin")
      return json(
        { error: "Denetim paketi yalnız Admin tarafından alınabilir." },
        403,
      );
    if (req.nextUrl.searchParams.get("format") === "manifest")
      return json({
        generatedAt: new Date().toISOString(),
        generatedBy: access.actor.email,
        records: rows.map((x) => ({
          id: x.id,
          modelId: x.modelId,
          links: {
            controlId: x.controlId,
            changeId: x.changeId,
            incidentId: x.incidentId,
          },
          title: x.title,
          type: x.type,
          classification: x.classification,
          expectedSha256: x.expectedHash,
          integrityStatus: x.integrityStatus,
          status: x.status,
          validUntil: x.validUntil,
          expiryState: x.expiryState,
        })),
      });
    const data = [
      [
        "Kanıt",
        "Model",
        "Kontrol",
        "Değişiklik",
        "Olay",
        "Tür",
        "Başlık",
        "Sınıf",
        "Sorumlu",
        "Hash",
        "Bütünlük",
        "Durum",
        "Geçerlilik",
      ],
      ...rows.map((x) => [
        x.id,
        x.modelId,
        x.controlId,
        x.changeId,
        x.incidentId,
        x.type,
        x.title,
        x.classification,
        x.owner,
        x.expectedHash,
        x.integrityStatus,
        x.status,
        x.validUntil,
      ]),
    ];
    return new NextResponse(
      `\uFEFF${data.map((r) => r.map(cell).join(",")).join("\n")}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            "attachment; filename=fornost-ai-evidence-pack.csv",
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
    controls: controls.results || [],
    changes: changes.results || [],
    incidents: incidents.results || [],
    evidence: rows,
    summary: {
      total: rows.length,
      approved: rows.filter((x) => x.status === "approved").length,
      expired: rows.filter((x) => x.expiryState === "expired").length,
      expiring: rows.filter((x) => x.expiryState === "expiring").length,
      integrityMismatch: rows.filter((x) => x.integrityStatus === "mismatch")
        .length,
    },
  });
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 24_576)
    return json({ error: "AI kanıt isteği çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let v;
  try {
    v = validateAiEvidence(body);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Kanıt doğrulanamadı.",
      },
      400,
    );
  }
  const { DB } = await aiRuntime();
  try {
    await linked(DB, v);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Kanıt ilişkisi geçersiz.",
      },
      409,
    );
  }
  const duplicate = await DB.prepare(
    "SELECT id,title FROM ai_evidence WHERE model_id=? AND expected_sha256=? LIMIT 1",
  )
    .bind(v.modelId, v.expectedHash)
    .first<{ id: string; title: string }>();
  if (duplicate)
    return json(
      { error: `Aynı hash ${duplicate.title} kanıtında kayıtlı.`, duplicate },
      409,
    );
  const id = `AIE-${crypto.randomUUID()}`,
    now = new Date().toISOString();
  await DB.prepare(
    "INSERT INTO ai_evidence(id,model_id,control_id,change_id,incident_id,evidence_type,title,description,source,collection_method,classification,owner,expected_sha256,collected_at,valid_until,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)",
  )
    .bind(
      id,
      v.modelId,
      v.controlId || null,
      v.changeId || null,
      v.incidentId || null,
      v.type,
      v.title,
      v.description,
      v.source,
      v.collectionMethod,
      v.classification,
      v.owner,
      v.expectedHash,
      v.collectedAt,
      v.validUntil,
      access.actor.email,
      now,
      access.actor.email,
      now,
    )
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-evidence-create",
    contextRefs: [v.modelId],
    status: "success",
    detail: `${id} ${v.type}; content not retained; SHA-256 registered`,
  });
  return json({ id }, 201);
}
export async function PUT(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100);
  let observed;
  try {
    observed = normalizeSha256(body.observedHash);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Hash geçersiz." },
      400,
    );
  }
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,expected_sha256 FROM ai_evidence WHERE id=?",
    )
      .bind(id)
      .first<{ model_id: string; expected_sha256: string }>();
  if (!row) return json({ error: "Kanıt bulunamadı." }, 404);
  const integrity = observed === row.expected_sha256 ? "verified" : "mismatch",
    now = new Date().toISOString();
  await DB.prepare(
    "UPDATE ai_evidence SET integrity_status=?,verified_at=?,updated_by=?,updated_at=? WHERE id=?",
  )
    .bind(integrity, now, access.actor.email, now, id)
    .run();
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: "ai-evidence-integrity",
    contextRefs: [row.model_id],
    status: integrity === "verified" ? "success" : "error",
    detail: `${id} ${integrity}; observed content not retained`,
  });
  return json(
    { integrityStatus: integrity },
    integrity === "verified" ? 200 : 409,
  );
}
export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})),
    id = cleanAiText(body.id, 100),
    status = cleanAiText(body.status, 20),
    note = redactSensitiveText(body.note, 800),
    confirmation = cleanAiText(body.confirmation, 30);
  if (
    !["approved", "rejected"].includes(status) ||
    note.length < 5 ||
    confirmation !== (status === "approved" ? "KANITI ONAYLA" : "REDDET")
  )
    return json({ error: "Karar notu ve doğru onay metni gereklidir." }, 400);
  const { DB } = await aiRuntime(),
    row = await DB.prepare(
      "SELECT model_id,integrity_status,status FROM ai_evidence WHERE id=?",
    )
      .bind(id)
      .first<Record<string, unknown>>();
  if (!row) return json({ error: "Kanıt bulunamadı." }, 404);
  if (status === "approved" && row.integrity_status !== "verified")
    return json({ error: "Bütünlüğü doğrulanmamış kanıt onaylanamaz." }, 409);
  const now = new Date().toISOString(),
    result = await DB.prepare(
      "UPDATE ai_evidence SET status=?,approved_by=?,approved_at=?,decision_note=?,updated_by=?,updated_at=? WHERE id=? AND status='draft'",
    )
      .bind(
        status,
        status === "approved" ? access.actor.email : null,
        status === "approved" ? now : null,
        note,
        access.actor.email,
        now,
        id,
      )
      .run();
  if (Number(result.meta?.changes || 0) !== 1)
    return json({ error: "Yalnız taslak kanıt karara bağlanabilir." }, 409);
  await recordAiEvent(DB, {
    actor: access.actor.email,
    action: `ai-evidence-${status}`,
    contextRefs: [String(row.model_id)],
    status: "success",
    detail: `${id} ${status}; integrity ${row.integrity_status}`,
  });
  return json({ ok: true });
}
