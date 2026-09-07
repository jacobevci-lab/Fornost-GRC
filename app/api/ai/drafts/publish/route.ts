import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../auth/security";
import { isAiDraftKind, validateAiDraftInput } from "@/app/ai/drafts";
import { applyAiDraftToRecord, publicationModule, type PublishableDraftKind } from "@/app/ai/publication";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

function parseObject(value: unknown) {
  try { const parsed=JSON.parse(String(value || "{}")); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string,unknown> : {}; }
  catch { return {}; }
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 4096) return json({ error: "Yayın isteği izin verilen boyutu aşıyor." }, 413);
  const body = await req.json().catch(() => ({}));
  const id = cleanAiText(body.id, 100), targetRecordId = cleanAiText(body.targetRecordId, 100), note = redactSensitiveText(body.note, 800);
  if (!id || !targetRecordId || body.confirmation !== "YAYINLA") return json({ error: "Yayın onayı veya hedef kayıt eksik." }, 400);
  if (note.length < 5) return json({ error: "Yayın için en az 5 karakterlik açıklama gereklidir." }, 400);
  const env = await aiRuntime();
  const draft = await env.DB.prepare("SELECT * FROM ai_action_drafts WHERE id=?").bind(id).first<Record<string,unknown>>();
  if (!draft) return json({ error: "AI taslağı bulunamadı." }, 404);
  if (draft.status !== "approved") return json({ error: "Yalnız onaylanmış taslaklar yayınlanabilir." }, 409);
  if (!isAiDraftKind(draft.kind)) return json({ error: "Taslak türü desteklenmiyor." }, 409);
  const targetModule = publicationModule(draft.kind);
  if (!targetModule) return json({ error: "Bu taslak türü doğrudan yayınlanamaz; görev entegrasyonu kullanılmalıdır." }, 409);
  const existingPublication = await env.DB.prepare("SELECT record_id,module,published_at FROM ai_draft_publications WHERE draft_id=?").bind(id).first<Record<string,unknown>>();
  if (existingPublication) return json({ error: "Bu taslak daha önce yayınlanmış.", publication: existingPublication }, 409);
  const target = await env.DB.prepare("SELECT id,module,data_json,updated_at FROM simple_grc_records WHERE id=? AND module=?").bind(targetRecordId,targetModule).first<Record<string,unknown>>();
  if (!target) return json({ error: `Seçilen hedef ${targetModule} modülünde bulunamadı.` }, 404);
  let merged: Record<string,unknown>;
  try {
    const checked = validateAiDraftInput(draft.kind, { title:draft.title, rationale:draft.rationale, payload:parseObject(draft.payload_json) });
    merged = applyAiDraftToRecord(draft.kind as PublishableDraftKind, checked.payload, parseObject(target.data_json), id, note);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Taslak yayın şemasına uymuyor." }, 409);
  }
  const now = new Date().toISOString(), publicationId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module=? AND updated_at=?
        AND NOT EXISTS(SELECT 1 FROM ai_draft_publications WHERE draft_id=?)`).bind(JSON.stringify(merged),now,targetRecordId,targetModule,target.updated_at,id),
      env.DB.prepare(`INSERT INTO ai_draft_publications(id,draft_id,record_id,module,publication_note,published_by,published_at)
        SELECT ?,?,?,?,?,?,? FROM simple_grc_records WHERE id=? AND module=? AND updated_at=?
        AND NOT EXISTS(SELECT 1 FROM ai_draft_publications WHERE draft_id=?)`).bind(publicationId,id,targetRecordId,targetModule,note,access.actor.email,now,targetRecordId,targetModule,now,id),
    ]);
    if (Number(results[0]?.meta.changes || 0) !== 1 || Number(results[1]?.meta.changes || 0) !== 1) return json({ error: "Hedef kayıt yayın sırasında değişti. Yenileyip tekrar deneyin." }, 409);
  } catch {
    return json({ error: "Taslak daha önce yayınlandı veya hedef kayıt eşzamanlı değişti." }, 409);
  }
  await env.DB.prepare("INSERT INTO ai_draft_events(id,draft_id,action,actor,detail,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),id,"published",access.actor.email,`${targetModule}:${targetRecordId}`,now).run();
  await recordAiEvent(env.DB, { actor: access.actor.email, action: "draft-publish", provider: String(draft.provider || ""), model: String(draft.model || ""), status: "success", detail: `${id} published to ${targetModule}:${targetRecordId}` });
  return json({ ok:true, publication:{ id:publicationId, draftId:id, recordId:targetRecordId, module:targetModule, publishedBy:access.actor.email, publishedAt:now } });
}
