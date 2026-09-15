import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { AI_EXCEPTION_RISKS, AI_EXCEPTION_TYPES, exceptionState, validateAiException, validateAiExceptionDecision } from "@/app/ai/exceptions";
import { cleanAiText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } }),
  cell = (value: unknown) => { const raw = String(value ?? ""), safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; },
  map = (row: Record<string, unknown>) => ({ id: row.id, modelId: row.model_id, parentId: row.parent_id, type: row.exception_type, reference: row.reference, title: row.title, justification: row.justification, scope: row.scope, compensatingControls: row.compensating_controls, owner: row.owner, riskTier: row.risk_tier, expiresAt: row.expires_at, reviewAt: row.review_at, status: row.status, state: exceptionState(String(row.status), String(row.expires_at), String(row.review_at)), decisionNote: row.decision_note, createdBy: row.created_by, createdAt: row.created_at, decidedBy: row.decided_by, decidedAt: row.decided_at });

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const { DB } = await aiRuntime(), [models, records] = await Promise.all([
    DB.prepare("SELECT id,system_name,model_name,status FROM ai_model_inventory WHERE status!='retired' ORDER BY system_name LIMIT 500").all<Record<string, unknown>>(),
    DB.prepare("SELECT * FROM ai_exceptions ORDER BY CASE risk_tier WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,updated_at DESC LIMIT 500").all<Record<string, unknown>>(),
  ]), items = (records.results || []).map(map), format = req.nextUrl.searchParams.get("format");
  if (format) {
    if (access.actor.role !== "Admin") return json({ error: "İstisna kanıt çıktısı yalnız Admin tarafından alınabilir." }, 403);
    const rows = [["İstisna", "Model", "Tür", "Referans", "Başlık", "Risk", "Sorumlu", "Durum", "İnceleme", "Süre sonu", "Karar veren"], ...items.map((item) => [item.id, item.modelId, item.type, item.reference, item.title, item.riskTier, item.owner, item.state, item.reviewAt, item.expiresAt, item.decidedBy || ""])];
    await recordAiEvent(DB, { actor: access.actor.email, action: "ai-exception-export", contextRefs: items.map((item) => String(item.id)).slice(0, 80), status: "success", detail: `${items.length} bounded records; formula-safe csv` });
    return new NextResponse(`\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\n")}`, { headers: { "cache-control": "no-store", "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=fornost-ai-exceptions.csv" } });
  }
  return json({ types: AI_EXCEPTION_TYPES, riskTiers: AI_EXCEPTION_RISKS, models: (models.results || []).map((row) => ({ id: row.id, systemName: row.system_name, modelName: row.model_name, status: row.status })), exceptions: items, summary: { total: items.length, pending: items.filter((item) => item.status === "draft").length, active: items.filter((item) => item.state === "approved").length, overdue: items.filter((item) => ["expired", "review-overdue"].includes(item.state)).length, highRisk: items.filter((item) => ["High", "Critical"].includes(String(item.riskTier)) && ["draft", "approved", "expired", "review-overdue"].includes(item.state)).length } });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 32_768) return json({ error: "İstisna talebi çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  let value;
  try { value = validateAiException(body); } catch (error) { return json({ error: error instanceof Error ? error.message : "İstisna doğrulanamadı." }, 400); }
  const { DB } = await aiRuntime(), model = await DB.prepare("SELECT id FROM ai_model_inventory WHERE id=? AND status!='retired'").bind(value.modelId).first();
  if (!model) return json({ error: "Etkin AI modeli bulunamadı." }, 409);
  if (value.parentId) {
    const parent = await DB.prepare("SELECT id FROM ai_exceptions WHERE id=? AND model_id=? AND status IN ('approved','rejected','revoked')").bind(value.parentId, value.modelId).first();
    if (!parent) return json({ error: "Yenileme kaynağı bu modele ait kapalı bir istisna olmalıdır." }, 409);
  }
  const duplicate = await DB.prepare("SELECT id FROM ai_exceptions WHERE model_id=? AND exception_type=? AND reference=? AND status IN ('draft','approved') LIMIT 1").bind(value.modelId, value.type, value.reference).first();
  if (duplicate) return json({ error: "Bu model ve referans için etkin istisna zaten var." }, 409);
  const id = `AIX-${crypto.randomUUID()}`, now = new Date().toISOString();
  await DB.prepare("INSERT INTO ai_exceptions(id,model_id,parent_id,exception_type,reference,title,justification,scope,compensating_controls,owner,risk_tier,expires_at,review_at,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)").bind(id, value.modelId, value.parentId || null, value.type, value.reference, value.title, value.justification, value.scope, value.compensatingControls, value.owner, value.riskTier, value.expiresAt, value.reviewAt, access.actor.email, now, access.actor.email, now).run();
  await recordAiEvent(DB, { actor: access.actor.email, action: "ai-exception-create", contextRefs: [value.modelId, id], status: "success", detail: `${value.type}; ${value.reference}; ${value.riskTier}; expires ${value.expiresAt}` });
  return json({ id }, 201);
}

export async function PATCH(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})), id = cleanAiText(body.id, 100);
  let decision;
  try { decision = validateAiExceptionDecision(body); } catch (error) { return json({ error: error instanceof Error ? error.message : "Karar geçersiz." }, 400); }
  const { DB } = await aiRuntime(), row = await DB.prepare("SELECT model_id,status,risk_tier,expires_at,review_at,created_by FROM ai_exceptions WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!row) return json({ error: "AI istisnası bulunamadı." }, 404);
  if (decision.status === "approved" && row.status !== "draft") return json({ error: "Yalnız taslak istisna onaylanabilir." }, 409);
  if (decision.status === "approved" && row.created_by === access.actor.email) return json({ error: "İstisnayı oluşturan kişi aynı kaydı onaylayamaz." }, 409);
  if (decision.status === "approved" && row.risk_tier === "Critical") return json({ error: "Kritik AI riski istisna ile kabul edilemez." }, 409);
  const today = new Date().toISOString().slice(0, 10);
  if (decision.status === "approved" && (String(row.expires_at) <= today || String(row.review_at) < today)) return json({ error: "Süresi veya inceleme tarihi geçmiş istisna onaylanamaz." }, 409);
  if (decision.status === "revoked" && row.status !== "approved") return json({ error: "Yalnız onaylı istisna geri çekilebilir." }, 409);
  if (decision.status === "rejected" && row.status !== "draft") return json({ error: "Yalnız taslak istisna reddedilebilir." }, 409);
  const now = new Date().toISOString();
  await DB.prepare("UPDATE ai_exceptions SET status=?,decision_note=?,decided_by=?,decided_at=?,updated_by=?,updated_at=? WHERE id=?").bind(decision.status, decision.note, access.actor.email, now, access.actor.email, now, id).run();
  await recordAiEvent(DB, { actor: access.actor.email, action: `ai-exception-${decision.status}`, contextRefs: [String(row.model_id), id], status: "success", detail: `${row.risk_tier}; human-confirmed; maker-checker` });
  return json({ ok: true });
}
