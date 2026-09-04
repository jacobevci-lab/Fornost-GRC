import { cleanAiText } from "./security";

export type AiProviderKind = "openai-compatible" | "ollama";

export type AiSettingsRow = {
  id: string;
  provider: AiProviderKind;
  base_url: string;
  model: string;
  enabled: number;
  config_json: string;
  secret_ciphertext: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
};

const settingsSql = `CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  secret_ciphertext TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)`;

const auditSql = `CREATE TABLE IF NOT EXISTS ai_activity_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT,
  context_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

let schemaReady: Promise<void> | null = null;

export async function aiRuntime() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB: D1Database };
  if (!schemaReady) {
    schemaReady = runtime.DB.batch([
      runtime.DB.prepare(settingsSql),
      runtime.DB.prepare(auditSql),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return runtime;
}

export async function getAiSettings(db: D1Database) {
  return db.prepare("SELECT * FROM ai_provider_settings WHERE id='default'").first<AiSettingsRow>();
}

export async function recordAiEvent(db: D1Database, input: {
  actor: string;
  action: string;
  provider?: string;
  model?: string;
  promptHash?: string;
  contextRefs?: string[];
  status: "success" | "error" | "denied";
  latencyMs?: number;
  detail?: string;
}) {
  await db.prepare(`INSERT INTO ai_activity_logs(
    id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(),
    cleanAiText(input.actor, 320) || "unknown",
    cleanAiText(input.action, 80),
    cleanAiText(input.provider, 80),
    cleanAiText(input.model, 200),
    cleanAiText(input.promptHash, 128) || null,
    JSON.stringify((input.contextRefs || []).slice(0, 80)),
    input.status,
    Math.max(0, Math.round(input.latencyMs || 0)),
    cleanAiText(input.detail, 500),
    new Date().toISOString(),
  ).run();
}
