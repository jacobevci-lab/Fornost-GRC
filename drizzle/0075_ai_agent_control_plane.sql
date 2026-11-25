CREATE TABLE IF NOT EXISTS ai_agent_controls (
  trace_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  agent_kind TEXT NOT NULL,
  policy_decision TEXT NOT NULL,
  policy_code TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  context_char_budget INTEGER NOT NULL,
  finding_budget INTEGER NOT NULL,
  human_approval_required INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_agent_controls_created_idx ON ai_agent_controls(created_at,policy_decision);
CREATE TABLE IF NOT EXISTS ai_agent_trace_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_agent_trace_events_trace_idx ON ai_agent_trace_events(trace_id,created_at);
