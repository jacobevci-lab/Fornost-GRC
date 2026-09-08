CREATE TABLE IF NOT EXISTS ai_knowledge_governance (source_id TEXT PRIMARY KEY,owner TEXT NOT NULL,review_due_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ai_knowledge_governance_review_idx ON ai_knowledge_governance(review_due_at);
