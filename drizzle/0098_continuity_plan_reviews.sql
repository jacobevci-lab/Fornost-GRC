CREATE TABLE IF NOT EXISTS enterprise_continuity_plan_reviews(id TEXT PRIMARY KEY NOT NULL,plan_id TEXT NOT NULL,source_revision TEXT NOT NULL,previous_date TEXT NOT NULL,next_date TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,actor TEXT NOT NULL,reviewed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS enterprise_continuity_plan_reviews_parent_idx ON enterprise_continuity_plan_reviews(plan_id,reviewed_at,id);
CREATE TRIGGER IF NOT EXISTS continuity_plan_review_no_update BEFORE UPDATE ON enterprise_continuity_plan_reviews BEGIN SELECT RAISE(ABORT,'immutable-plan-review'); END;
CREATE TRIGGER IF NOT EXISTS continuity_plan_review_no_delete BEFORE DELETE ON enterprise_continuity_plan_reviews BEGIN SELECT RAISE(ABORT,'immutable-plan-review'); END;
