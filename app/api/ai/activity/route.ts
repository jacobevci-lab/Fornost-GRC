import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime } from "@/app/ai/storage";

function boundedLimit(value: string | null) {
  const parsed = Number(value || 50);
  return Number.isInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const env = await aiRuntime();
  const limit = boundedLimit(req.nextUrl.searchParams.get("limit"));
  const result = await env.DB.prepare(`SELECT id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at
    FROM ai_activity_logs ORDER BY created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>();
  const events = (result.results || []).map((row) => {
    let contextRefs: string[] = [];
    try {
      const parsed = JSON.parse(String(row.context_refs_json || "[]"));
      if (Array.isArray(parsed)) contextRefs = parsed.slice(0, 80).map((item) => String(item));
    } catch {}
    return {
      id: row.id,
      actor: row.actor,
      action: row.action,
      provider: row.provider,
      model: row.model,
      promptHash: row.prompt_hash,
      contextRefs,
      status: row.status,
      latencyMs: row.latency_ms,
      detail: row.detail,
      createdAt: row.created_at,
    };
  });
  return NextResponse.json({ events }, { headers: { "cache-control": "no-store" } });
}
