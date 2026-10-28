CREATE TABLE IF NOT EXISTS policy_periodic_reviews(id TEXT PRIMARY KEY NOT NULL,policy_id TEXT NOT NULL,version_id TEXT NOT NULL,source_revision TEXT NOT NULL,previous_date TEXT NOT NULL,next_date TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,actor TEXT NOT NULL,reviewed_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS policy_periodic_reviews_parent_idx ON policy_periodic_reviews(policy_id,reviewed_at,id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS policy_periodic_review_no_update BEFORE UPDATE ON policy_periodic_reviews BEGIN SELECT RAISE(ABORT,'immutable-policy-review'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS policy_periodic_review_no_delete BEFORE DELETE ON policy_periodic_reviews BEGIN SELECT RAISE(ABORT,'immutable-policy-review'); END;
