CREATE TABLE IF NOT EXISTS audit_workpapers(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,revision TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS audit_workpapers_parent_idx ON audit_workpapers(audit_id,updated_at,id);

CREATE TABLE IF NOT EXISTS audit_workpaper_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,workpaper_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS audit_workpaper_events_parent_idx ON audit_workpaper_events(audit_id,workpaper_id,created_at,id);

CREATE TRIGGER IF NOT EXISTS audit_report_audit_workpapers_insert AFTER INSERT ON audit_workpapers BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_report_audit_workpapers_update AFTER UPDATE ON audit_workpapers BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_report_audit_workpapers_delete AFTER DELETE ON audit_workpapers BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_workpapers_insert BEFORE INSERT ON audit_workpapers WHEN EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=NEW.audit_id AND state='closed') BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_workpapers_update BEFORE UPDATE ON audit_workpapers WHEN EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=OLD.audit_id AND state='closed') OR EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=NEW.audit_id AND state='closed') BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_workpapers_delete BEFORE DELETE ON audit_workpapers WHEN EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=OLD.audit_id AND state='closed') BEGIN SELECT RAISE(ABORT,'audit-closed'); END;
