CREATE TABLE IF NOT EXISTS ai_red_team_campaigns (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, name TEXT NOT NULL, scope TEXT NOT NULL, methodology TEXT NOT NULL,
 lead TEXT NOT NULL, independent_tester TEXT NOT NULL, environment TEXT NOT NULL, categories_json TEXT NOT NULL,
 planned_at TEXT NOT NULL, completed_at TEXT NOT NULL, total_tests INTEGER NOT NULL, passed_tests INTEGER NOT NULL,
 pass_rate INTEGER NOT NULL, critical_findings INTEGER NOT NULL, high_findings INTEGER NOT NULL, medium_findings INTEGER NOT NULL,
 report_reference TEXT NOT NULL, remediation_plan TEXT NOT NULL, retest_at TEXT NOT NULL, blockers_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT, UNIQUE(model_id,name,completed_at)
);
CREATE INDEX IF NOT EXISTS ai_red_team_release_idx ON ai_red_team_campaigns(model_id,status,retest_at);
