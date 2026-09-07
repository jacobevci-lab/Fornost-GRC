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

const draftsSql = `CREATE TABLE IF NOT EXISTS ai_action_drafts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const draftsStatusIndexSql = "CREATE INDEX IF NOT EXISTS ai_action_drafts_status_idx ON ai_action_drafts(status,created_at)";
const draftsCreatorIndexSql = "CREATE INDEX IF NOT EXISTS ai_action_drafts_creator_idx ON ai_action_drafts(created_by,created_at)";
const draftEventsSql = `CREATE TABLE IF NOT EXISTS ai_draft_events (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;
const draftEventsIndexSql = "CREATE INDEX IF NOT EXISTS ai_draft_events_draft_idx ON ai_draft_events(draft_id,created_at)";
const draftPublicationsSql = `CREATE TABLE IF NOT EXISTS ai_draft_publications (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  record_id TEXT NOT NULL,
  module TEXT NOT NULL,
  publication_note TEXT NOT NULL,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL
)`;
const draftPublicationsRecordIndexSql = "CREATE INDEX IF NOT EXISTS ai_draft_publications_record_idx ON ai_draft_publications(record_id,published_at)";
const draftTicketsSql = `CREATE TABLE IF NOT EXISTS ai_draft_tickets (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  provider TEXT,
  external_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL,
  publication_note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
)`;
const draftTicketsStatusIndexSql = "CREATE INDEX IF NOT EXISTS ai_draft_tickets_status_idx ON ai_draft_tickets(status,created_at)";
const fallbackSql = `CREATE TABLE IF NOT EXISTS ai_provider_fallbacks (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0, config_json TEXT NOT NULL DEFAULT '{}', secret_ciphertext TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
)`;
const providerHealthSql = `CREATE TABLE IF NOT EXISTS ai_provider_health (
  id TEXT PRIMARY KEY, profile TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  operation TEXT NOT NULL, status TEXT NOT NULL, latency_ms INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL, created_at TEXT NOT NULL
)`;
const providerHealthIndexSql = "CREATE INDEX IF NOT EXISTS ai_provider_health_created_idx ON ai_provider_health(created_at,status)";
const useCasesSql = `CREATE TABLE IF NOT EXISTS ai_use_cases (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, purpose TEXT NOT NULL, owner TEXT NOT NULL,
  data_classification TEXT NOT NULL, impact_level TEXT NOT NULL, decision_role TEXT NOT NULL,
  controls_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', review_date TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  approved_by TEXT, approved_at TEXT, decision_note TEXT
)`;
const useCasesIndexSql = "CREATE INDEX IF NOT EXISTS ai_use_cases_status_review_idx ON ai_use_cases(status,review_date)";
const evalCasesSql = `CREATE TABLE IF NOT EXISTS ai_eval_cases (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, input_text TEXT NOT NULL, expected_terms_json TEXT NOT NULL DEFAULT '[]',
  forbidden_terms_json TEXT NOT NULL DEFAULT '[]', max_latency_ms INTEGER NOT NULL DEFAULT 30000,
  enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const evalRunsSql = `CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  status TEXT NOT NULL, score INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
  output_hash TEXT, failure_reason TEXT NOT NULL, run_by TEXT NOT NULL, created_at TEXT NOT NULL
)`;
const evalRunsIndexSql = "CREATE INDEX IF NOT EXISTS ai_eval_runs_case_created_idx ON ai_eval_runs(case_id,created_at)";
const agentRunsSql = `CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id TEXT PRIMARY KEY, agent_kind TEXT NOT NULL, objective TEXT NOT NULL, status TEXT NOT NULL,
  report_json TEXT NOT NULL, source_refs_json TEXT NOT NULL DEFAULT '[]', output_hash TEXT,
  provider TEXT NOT NULL, model TEXT NOT NULL, provider_profile TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  completed_at TEXT, reviewed_by TEXT, reviewed_at TEXT, review_note TEXT
)`;
const agentRunsIndexSql = "CREATE INDEX IF NOT EXISTS ai_agent_runs_status_created_idx ON ai_agent_runs(status,created_at)";
const agentDraftLinksSql = `CREATE TABLE IF NOT EXISTS ai_agent_draft_links (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, finding_id TEXT NOT NULL, draft_id TEXT NOT NULL UNIQUE,
  conversion_note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(run_id,finding_id)
)`;
const agentDraftLinksIndexSql = "CREATE INDEX IF NOT EXISTS ai_agent_draft_links_run_idx ON ai_agent_draft_links(run_id,created_at)";

let schemaReady: Promise<void> | null = null;

export async function aiRuntime() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB: D1Database };
  if (!schemaReady) {
    schemaReady = runtime.DB.batch([
      runtime.DB.prepare(settingsSql),
      runtime.DB.prepare(auditSql),
      runtime.DB.prepare(draftsSql),
      runtime.DB.prepare(draftsStatusIndexSql),
      runtime.DB.prepare(draftsCreatorIndexSql),
      runtime.DB.prepare(draftEventsSql),
      runtime.DB.prepare(draftEventsIndexSql),
      runtime.DB.prepare(draftPublicationsSql),
      runtime.DB.prepare(draftPublicationsRecordIndexSql),
      runtime.DB.prepare(draftTicketsSql),
      runtime.DB.prepare(draftTicketsStatusIndexSql),
      runtime.DB.prepare(fallbackSql),
      runtime.DB.prepare(providerHealthSql),
      runtime.DB.prepare(providerHealthIndexSql),
      runtime.DB.prepare(useCasesSql),
      runtime.DB.prepare(useCasesIndexSql),
      runtime.DB.prepare(evalCasesSql),
      runtime.DB.prepare(evalRunsSql),
      runtime.DB.prepare(evalRunsIndexSql),
      runtime.DB.prepare(agentRunsSql),
      runtime.DB.prepare(agentRunsIndexSql),
      runtime.DB.prepare(agentDraftLinksSql),
      runtime.DB.prepare(agentDraftLinksIndexSql),
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
