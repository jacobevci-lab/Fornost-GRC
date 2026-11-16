CREATE TRIGGER IF NOT EXISTS audit_requirement_link_audit_requests_insert BEFORE INSERT ON audit_requests
 WHEN COALESCE(json_extract(NEW.data_json,'$.requirementId'),'')<>'' AND NOT EXISTS(
 SELECT 1 FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName') WHERE r.id=json_extract(NEW.data_json,'$.requirementId') AND r.module='Denetim Yönetimi' AND a.id=NEW.audit_id)
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END;

CREATE TRIGGER IF NOT EXISTS audit_requirement_link_audit_requests_update BEFORE UPDATE ON audit_requests
 WHEN COALESCE(json_extract(NEW.data_json,'$.requirementId'),'')<>'' AND NOT EXISTS(
 SELECT 1 FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName') WHERE r.id=json_extract(NEW.data_json,'$.requirementId') AND r.module='Denetim Yönetimi' AND a.id=NEW.audit_id)
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END;

CREATE TRIGGER IF NOT EXISTS audit_requirement_parent_audit_requests_update BEFORE UPDATE OF data_json,module ON simple_grc_records
 WHEN EXISTS(SELECT 1 FROM audit_requests w JOIN simple_audits a ON a.id=w.audit_id WHERE json_extract(w.data_json,'$.requirementId')=OLD.id AND (NEW.module<>'Denetim Yönetimi' OR COALESCE(json_extract(NEW.data_json,'$.auditName'),'')<>a.name))
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END;

CREATE TRIGGER IF NOT EXISTS audit_requirement_link_audit_workpapers_insert BEFORE INSERT ON audit_workpapers
 WHEN COALESCE(json_extract(NEW.data_json,'$.requirementId'),'')<>'' AND NOT EXISTS(
 SELECT 1 FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName') WHERE r.id=json_extract(NEW.data_json,'$.requirementId') AND r.module='Denetim Yönetimi' AND a.id=NEW.audit_id)
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END;

CREATE TRIGGER IF NOT EXISTS audit_requirement_link_audit_workpapers_update BEFORE UPDATE ON audit_workpapers
 WHEN COALESCE(json_extract(NEW.data_json,'$.requirementId'),'')<>'' AND NOT EXISTS(
 SELECT 1 FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName') WHERE r.id=json_extract(NEW.data_json,'$.requirementId') AND r.module='Denetim Yönetimi' AND a.id=NEW.audit_id)
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END;

CREATE TRIGGER IF NOT EXISTS audit_requirement_parent_audit_workpapers_update BEFORE UPDATE OF data_json,module ON simple_grc_records
 WHEN EXISTS(SELECT 1 FROM audit_workpapers w JOIN simple_audits a ON a.id=w.audit_id WHERE json_extract(w.data_json,'$.requirementId')=OLD.id AND (NEW.module<>'Denetim Yönetimi' OR COALESCE(json_extract(NEW.data_json,'$.auditName'),'')<>a.name))
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END;
