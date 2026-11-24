CREATE TABLE IF NOT EXISTS exchange_connectors (kind TEXT PRIMARY KEY, config TEXT NOT NULL, secret TEXT, hook_hash TEXT, enabled INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS exchange_signals (kind TEXT NOT NULL, event_id TEXT NOT NULL, observed_at TEXT NOT NULL, summary TEXT NOT NULL, PRIMARY KEY(kind,event_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS exchange_tickets (finding_id TEXT PRIMARY KEY, provider TEXT NOT NULL, ticket TEXT UNIQUE, url TEXT, state TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS exchange_notices (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vendor_invitations (digest TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, email TEXT NOT NULL, expires_at TEXT NOT NULL, created_by TEXT NOT NULL, draft_id TEXT, draft_revision TEXT, receipt TEXT UNIQUE);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vendor_invitations_vendor ON vendor_invitations(vendor_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS trust_publication (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS trust_requests (id TEXT PRIMARY KEY, version_id TEXT NOT NULL, name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL, acknowledged_at TEXT NOT NULL, nda_version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', grant_hash TEXT UNIQUE, expires_at TEXT, decided_by TEXT, decided_at TEXT);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trust_requests_queue ON trust_requests(status, acknowledged_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS exchange_rate (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS board_packages (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, digest TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
