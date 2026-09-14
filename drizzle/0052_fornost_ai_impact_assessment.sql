CREATE TABLE IF NOT EXISTS ai_impact_assessments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, risk_id TEXT, assessment_type TEXT NOT NULL,
 title TEXT NOT NULL, context TEXT NOT NULL, affected_groups TEXT NOT NULL, jurisdictions TEXT NOT NULL,
 necessity TEXT NOT NULL, proportionality TEXT NOT NULL, mitigations TEXT NOT NULL,
 monitoring_plan TEXT NOT NULL, consultation TEXT NOT NULL, owner TEXT NOT NULL, dpo TEXT NOT NULL,
 privacy INTEGER NOT NULL, fundamental_rights INTEGER NOT NULL, safety INTEGER NOT NULL,
 workforce INTEGER NOT NULL, vulnerable_groups INTEGER NOT NULL, autonomy INTEGER NOT NULL,
 scale INTEGER NOT NULL, control_maturity INTEGER NOT NULL, personal_data INTEGER NOT NULL,
 special_category_data INTEGER NOT NULL, automated_decision INTEGER NOT NULL, children INTEGER NOT NULL,
 workers INTEGER NOT NULL, public_services INTEGER NOT NULL, has_transparency INTEGER NOT NULL,
 has_human_oversight INTEGER NOT NULL, has_appeal INTEGER NOT NULL, dpo_consulted INTEGER NOT NULL,
 inherent_score INTEGER NOT NULL, residual_score INTEGER NOT NULL, impact_tier TEXT NOT NULL,
 critical_gaps TEXT NOT NULL, review_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_impact_model_status_idx ON ai_impact_assessments(model_id,status,review_date);
