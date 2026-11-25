CREATE TABLE IF NOT EXISTS framework_requirement_work(
 program TEXT NOT NULL,ref TEXT NOT NULL,org_entity_id TEXT NOT NULL DEFAULT 'root',
 implementation TEXT NOT NULL,evidence_ids TEXT NOT NULL,policy_ids TEXT NOT NULL,
 revision TEXT NOT NULL,actor TEXT NOT NULL,contributors TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(program,ref));

CREATE TABLE IF NOT EXISTS framework_requirement_reviews(
 id TEXT PRIMARY KEY NOT NULL,program TEXT NOT NULL,ref TEXT NOT NULL,work_revision TEXT NOT NULL,
 source_fingerprint TEXT NOT NULL,reviewer TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS framework_requirement_review_source ON framework_requirement_reviews(program,ref,work_revision);
