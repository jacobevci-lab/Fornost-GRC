CREATE TABLE IF NOT EXISTS control_effectiveness_reviews(
 id TEXT PRIMARY KEY NOT NULL,control_id TEXT NOT NULL,evidence_version TEXT NOT NULL,
 control_snapshot TEXT NOT NULL,evidence_snapshot TEXT NOT NULL,
 control_revision TEXT NOT NULL,evidence_revision TEXT NOT NULL,
 reviewer TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS control_effectiveness_source ON control_effectiveness_reviews(control_id,evidence_version);
