CREATE TABLE IF NOT EXISTS vendor_invitation_details (digest TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS trust_request_details (request_id TEXT PRIMARY KEY NOT NULL, reason TEXT NOT NULL, nda_required INTEGER NOT NULL, accepted_at TEXT);
