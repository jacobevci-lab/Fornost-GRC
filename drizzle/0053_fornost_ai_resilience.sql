CREATE TABLE IF NOT EXISTS ai_resilience_plans (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, scenario TEXT NOT NULL, owner TEXT NOT NULL,
 technical_owner TEXT NOT NULL, rto_minutes INTEGER NOT NULL, rpo_minutes INTEGER NOT NULL,
 max_degraded_minutes INTEGER NOT NULL, fallback_plan TEXT NOT NULL, manual_plan TEXT NOT NULL,
 shutdown_procedure TEXT NOT NULL, communication_plan TEXT NOT NULL, dependencies TEXT NOT NULL,
 next_exercise TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, UNIQUE(model_id,scenario)
);
CREATE INDEX IF NOT EXISTS ai_resilience_plan_review_idx ON ai_resilience_plans(model_id,status,next_exercise);
CREATE TABLE IF NOT EXISTS ai_resilience_exercises (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, model_id TEXT NOT NULL, actual_recovery_minutes INTEGER NOT NULL,
 actual_data_loss_minutes INTEGER NOT NULL, kill_switch_passed INTEGER NOT NULL, fallback_passed INTEGER NOT NULL,
 manual_mode_passed INTEGER NOT NULL, communication_passed INTEGER NOT NULL, score INTEGER NOT NULL,
 result TEXT NOT NULL, checks_json TEXT NOT NULL, critical_failures TEXT NOT NULL, findings TEXT NOT NULL,
 corrective_actions TEXT NOT NULL, exercised_at TEXT NOT NULL, next_retest TEXT NOT NULL,
 recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_resilience_exercise_model_idx ON ai_resilience_exercises(model_id,result,exercised_at);
