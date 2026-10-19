CREATE TABLE IF NOT EXISTS audit_reminder_profiles(audit_id TEXT PRIMARY KEY,revision TEXT NOT NULL,data_json TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_reminder_profiles_insert BEFORE INSERT ON audit_reminder_profiles WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_reminder_profiles_update BEFORE UPDATE ON audit_reminder_profiles WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.audit_id)) OR EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_reminder_profiles_delete BEFORE DELETE ON audit_reminder_profiles WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;
