CREATE UNIQUE INDEX IF NOT EXISTS audit_milestones_evidence_change_unique ON audit_milestones(json_extract(data_json,'$.evidenceChangeOrigin.key')) WHERE json_type(data_json,'$.evidenceChangeOrigin')='object';

CREATE TRIGGER IF NOT EXISTS audit_milestone_evidence_origin_immutable BEFORE UPDATE ON audit_milestones WHEN json_extract(OLD.data_json,'$.evidenceChangeOrigin') IS NOT json_extract(NEW.data_json,'$.evidenceChangeOrigin') BEGIN SELECT RAISE(ABORT,'immutable-evidence-origin'); END;
