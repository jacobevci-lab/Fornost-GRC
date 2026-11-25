CREATE TABLE IF NOT EXISTS ai_model_inventory (
 id TEXT PRIMARY KEY, system_name TEXT NOT NULL, model_name TEXT NOT NULL, vendor TEXT NOT NULL,
 purpose TEXT NOT NULL, owner TEXT NOT NULL, deployment TEXT NOT NULL, region TEXT NOT NULL,
 data_classification TEXT NOT NULL, autonomy TEXT NOT NULL, affected_users INTEGER NOT NULL DEFAULT 0,
 impact INTEGER NOT NULL, likelihood INTEGER NOT NULL, data_sensitivity INTEGER NOT NULL,
 autonomy_risk INTEGER NOT NULL, control_maturity INTEGER NOT NULL, inherent_score INTEGER NOT NULL,
 residual_score INTEGER NOT NULL, risk_tier TEXT NOT NULL, controls TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', review_date TEXT NOT NULL, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, decision_note TEXT
);
CREATE INDEX IF NOT EXISTS ai_model_inventory_status_risk_idx ON ai_model_inventory(status,risk_tier,review_date);
