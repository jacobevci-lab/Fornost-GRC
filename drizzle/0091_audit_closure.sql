CREATE TABLE IF NOT EXISTS audit_closure_state(audit_id TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('open','pending','closed')),revision TEXT NOT NULL,submission_id TEXT NOT NULL,report_id TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit_closure_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,payload_json TEXT NOT NULL,snapshot_sha256 TEXT NOT NULL,input_sha256 TEXT NOT NULL,write_token TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS audit_closure_events_parent_idx ON audit_closure_events(audit_id,created_at,id);

CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_audit_status_reports_update AFTER UPDATE ON audit_status_reports BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_audit_status_reports_delete AFTER DELETE ON audit_status_reports BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_audit_status_report_items_update AFTER UPDATE ON audit_status_report_items BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_audit_status_report_items_delete AFTER DELETE ON audit_status_report_items BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_item_insert AFTER INSERT ON audit_status_report_items WHEN EXISTS(SELECT 1 FROM audit_closure_state WHERE report_id=NEW.report_id) BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_audits_insert BEFORE INSERT ON simple_audits WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_audits_update BEFORE UPDATE ON simple_audits WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.id)) OR EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_audits_delete BEFORE DELETE ON simple_audits WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_records_insert BEFORE INSERT ON simple_grc_records WHEN (NEW.module='Denetim Yönetimi' AND EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE name=json_extract(NEW.data_json,'$.auditName')))) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_records_update BEFORE UPDATE ON simple_grc_records WHEN (OLD.module='Denetim Yönetimi' AND EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE name=json_extract(OLD.data_json,'$.auditName')))) OR (NEW.module='Denetim Yönetimi' AND EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE name=json_extract(NEW.data_json,'$.auditName')))) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_records_delete BEFORE DELETE ON simple_grc_records WHEN (OLD.module='Denetim Yönetimi' AND EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE name=json_extract(OLD.data_json,'$.auditName')))) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_record_codes_insert BEFORE INSERT ON simple_grc_record_codes WHEN EXISTS(SELECT 1 FROM simple_grc_record_codes WHERE record_id=NEW.record_id) AND EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT a.id FROM simple_audits a JOIN simple_grc_records r ON r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=a.name WHERE r.id=NEW.record_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_record_codes_update BEFORE UPDATE ON simple_grc_record_codes WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT a.id FROM simple_audits a JOIN simple_grc_records r ON r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=a.name WHERE r.id=OLD.record_id)) OR EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT a.id FROM simple_audits a JOIN simple_grc_records r ON r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=a.name WHERE r.id=NEW.record_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_record_codes_delete BEFORE DELETE ON simple_grc_record_codes WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT a.id FROM simple_audits a JOIN simple_grc_records r ON r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=a.name WHERE r.id=OLD.record_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_metadata_insert BEFORE INSERT ON simple_grc_metadata WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE NEW.key='audit_plan_'||id OR NEW.key='audit_catalog_'||id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_metadata_update BEFORE UPDATE ON simple_grc_metadata WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE OLD.key='audit_plan_'||id OR OLD.key='audit_catalog_'||id)) OR EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE NEW.key='audit_plan_'||id OR NEW.key='audit_catalog_'||id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_metadata_delete BEFORE DELETE ON simple_grc_metadata WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT id FROM simple_audits WHERE OLD.key='audit_plan_'||id OR OLD.key='audit_catalog_'||id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_requests_insert BEFORE INSERT ON audit_requests WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_requests_update BEFORE UPDATE ON audit_requests WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.audit_id)) OR EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_requests_delete BEFORE DELETE ON audit_requests WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_request_workflows_insert BEFORE INSERT ON audit_request_workflows WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_request_workflows_update BEFORE UPDATE ON audit_request_workflows WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.audit_id)) OR EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT NEW.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;

CREATE TRIGGER IF NOT EXISTS audit_closure_audit_request_workflows_delete BEFORE DELETE ON audit_request_workflows WHEN EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (SELECT OLD.audit_id)) BEGIN SELECT RAISE(ABORT,'audit-closed'); END;
