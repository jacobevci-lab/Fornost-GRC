CREATE TABLE IF NOT EXISTS policy_import_sources (
 version_id TEXT PRIMARY KEY NOT NULL,
 policy_id TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 imported_by TEXT NOT NULL,
 file_name TEXT NOT NULL,
 file_type TEXT NOT NULL,
 file_size INTEGER NOT NULL,
 file_sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy_import_chunks (
 version_id TEXT NOT NULL,
 part INTEGER NOT NULL,
 content BLOB NOT NULL,
 PRIMARY KEY(version_id,part)
);
