import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime } from "@/app/ai/storage";

function safeLimit(value: string | null) {
  const parsed = Number(value || 30);
  return Number.isInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 30;
}

function parseRefs(value: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 80) : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), limit = safeLimit(req.nextUrl.searchParams.get("limit"));
  const result = await env.DB.prepare(`SELECT id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at
    FROM ai_activity_logs ORDER BY created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>();
  return NextResponse.json({
    logs: (result.results || []).map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      provider: row.provider,
      model: row.model,
      promptHash: row.prompt_hash,
      contextRefs: parseRefs(String(row.context_refs_json || "[]")),
      status: row.status,
      latencyMs: Number(row.latency_ms || 0),
      detail: row.detail,
      createdAt: row.created_at,
    })),
  }, { headers: { "cache-control": "no-store" } });
}
