import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../auth/security";
import { isAiAgentKind, parseAgentResponse } from "@/app/ai/agents";
import { validateAiDraftInput } from "@/app/ai/drafts";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
function refs(value: unknown) { try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : []; } catch { return []; } }

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 16_384) return json({ error: "Taslak dönüşüm isteği çok büyük." }, 413);
  const body = await req.json().catch(() => ({})), runId = cleanAiText(body.runId, 100), findingId = cleanAiText(body.findingId, 30), note = redactSensitiveText(body.note, 800);
  if (!runId || !findingId || note.length < 5 || body.confirmation !== "TASLAK OLUŞTUR") return json({ error: "Bulgu, açıklama ve TASLAK OLUŞTUR onayı gereklidir." }, 400);
  const env = await aiRuntime(), run = await env.DB.prepare("SELECT * FROM ai_agent_runs WHERE id=?").bind(runId).first<Record<string, unknown>>();
  if (!run) return json({ error: "Agent çalışması bulunamadı." }, 404);
  if (run.status !== "approved" || !isAiAgentKind(run.agent_kind)) return json({ error: "Yalnız Admin tarafından onaylanmış agent çalışmaları taslağa dönüştürülebilir." }, 409);
  let report;
  try { report = parseAgentResponse(run.agent_kind, String(run.report_json || "{}"), refs(run.source_refs_json)); }
  catch { return json({ error: "Saklanan agent raporu doğrulanamadı." }, 409); }
  const finding = report.findings.find(item => item.id === findingId);
  if (!finding) return json({ error: "Agent bulgusu bulunamadı." }, 404);
  const draft = validateAiDraftInput(finding.draft.kind, finding.draft), draftId = `AID-${crypto.randomUUID()}`, linkId = crypto.randomUUID(), now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ai_action_drafts(id,kind,title,payload_json,rationale,source_refs_json,status,provider,model,prompt_hash,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(draftId, finding.draft.kind, draft.title, JSON.stringify(draft.payload), draft.rationale, JSON.stringify(finding.sourceRefs), "pending", run.provider, run.model, run.output_hash || null, access.actor.email, now, now),
      env.DB.prepare("INSERT INTO ai_agent_draft_links(id,run_id,finding_id,draft_id,conversion_note,created_by,created_at) VALUES(?,?,?,?,?,?,?)").bind(linkId, runId, findingId, draftId, note, access.actor.email, now),
      env.DB.prepare("INSERT INTO ai_draft_events(id,draft_id,action,actor,detail,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), draftId, "agent-converted", access.actor.email, `Created from ${runId}/${findingId}; ${note}`.slice(0, 500), now),
    ]);
  } catch { return json({ error: "Bu bulgu daha önce taslağa dönüştürülmüş veya eşzamanlı işlem oluşmuş." }, 409); }
  await recordAiEvent(env.DB, { actor: access.actor.email, action: "agent-draft-create", provider: String(run.provider || ""), model: String(run.model || ""), contextRefs: finding.sourceRefs, status: "success", detail: `${runId}/${findingId} converted to governed draft ${draftId}; no live record changed` });
  return json({ ok: true, draftId }, 201);
}
