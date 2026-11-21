-- Allocate once on creation (and once for existing work). Inbox reads stay read-only.
-- Keep native task namespaces separate from the canonical core record IDs.
CREATE VIEW work_record_code_input AS
  SELECT '' AS record_id, '' AS module, '' AS prefix WHERE 0;
CREATE TRIGGER allocate_work_record_code INSTEAD OF INSERT ON work_record_code_input
WHEN NOT EXISTS (SELECT 1 FROM simple_grc_record_codes WHERE record_id=NEW.record_id)
BEGIN
  INSERT INTO simple_grc_record_code_counters(module,value,updated_at) VALUES('work:' || NEW.prefix,1,CURRENT_TIMESTAMP)
    ON CONFLICT(module) DO UPDATE SET value=value+1,updated_at=CURRENT_TIMESTAMP;
  INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
    SELECT NEW.record_id,NEW.module,printf('%s-%03d',NEW.prefix,value),CURRENT_TIMESTAMP
    FROM simple_grc_record_code_counters WHERE module='work:' || NEW.prefix;
END;

INSERT INTO work_record_code_input
  SELECT 'work:audit-request:' || id,'Denetim Yönetimi','ARQ' FROM audit_requests ORDER BY rowid;
CREATE TRIGGER code_for_audit_requests AFTER INSERT ON audit_requests
BEGIN
  INSERT INTO work_record_code_input VALUES('work:audit-request:' || NEW.id,'Denetim Yönetimi','ARQ');
END;

INSERT INTO work_record_code_input
  SELECT 'work:audit-workpaper:' || id,'Denetim Yönetimi','WKP' FROM audit_workpapers ORDER BY rowid;
CREATE TRIGGER code_for_audit_workpapers AFTER INSERT ON audit_workpapers
BEGIN
  INSERT INTO work_record_code_input VALUES('work:audit-workpaper:' || NEW.id,'Denetim Yönetimi','WKP');
END;

INSERT INTO work_record_code_input
  SELECT 'work:audit-milestone:' || id,'Denetim Yönetimi','MSL' FROM audit_milestones ORDER BY rowid;
CREATE TRIGGER code_for_audit_milestones AFTER INSERT ON audit_milestones
BEGIN
  INSERT INTO work_record_code_input VALUES('work:audit-milestone:' || NEW.id,'Denetim Yönetimi','MSL');
END;

INSERT INTO work_record_code_input
  SELECT 'work:audit-closure:' || id,'Denetim Yönetimi','ACL' FROM audit_closure_events ORDER BY rowid;
CREATE TRIGGER code_for_audit_closure_events AFTER INSERT ON audit_closure_events
BEGIN
  INSERT INTO work_record_code_input VALUES('work:audit-closure:' || NEW.id,'Denetim Yönetimi','ACL');
END;

INSERT INTO work_record_code_input
  SELECT 'work:vendor-assessment:' || id,'Tedarikçiler','VSA' FROM third_party_assessments ORDER BY rowid;
CREATE TRIGGER code_for_third_party_assessments AFTER INSERT ON third_party_assessments
BEGIN
  INSERT INTO work_record_code_input VALUES('work:vendor-assessment:' || NEW.id,'Tedarikçiler','VSA');
END;

INSERT INTO work_record_code_input
  SELECT 'work:vendor-finding:' || id,'Tedarikçiler','VSF' FROM third_party_findings ORDER BY rowid;
CREATE TRIGGER code_for_third_party_findings AFTER INSERT ON third_party_findings
BEGIN
  INSERT INTO work_record_code_input VALUES('work:vendor-finding:' || NEW.id,'Tedarikçiler','VSF');
END;

INSERT INTO work_record_code_input
  SELECT 'work:regulatory-change:' || id,'Regülasyon Merkezi','RGC' FROM regulatory_changes ORDER BY rowid;
CREATE TRIGGER code_for_regulatory_changes AFTER INSERT ON regulatory_changes
BEGIN
  INSERT INTO work_record_code_input VALUES('work:regulatory-change:' || NEW.id,'Regülasyon Merkezi','RGC');
END;

INSERT INTO work_record_code_input
  SELECT 'work:regulatory-impact:' || id,'Regülasyon Merkezi','RGI' FROM regulatory_change_impacts ORDER BY rowid;
CREATE TRIGGER code_for_regulatory_change_impacts AFTER INSERT ON regulatory_change_impacts
BEGIN
  INSERT INTO work_record_code_input VALUES('work:regulatory-impact:' || NEW.id,'Regülasyon Merkezi','RGI');
END;

INSERT INTO work_record_code_input
  SELECT 'work:continuity-gap:' || id,'İş Sürekliliği','BCG' FROM enterprise_continuity_gaps ORDER BY rowid;
CREATE TRIGGER code_for_enterprise_continuity_gaps AFTER INSERT ON enterprise_continuity_gaps
BEGIN
  INSERT INTO work_record_code_input VALUES('work:continuity-gap:' || NEW.id,'İş Sürekliliği','BCG');
END;

INSERT INTO work_record_code_input
  SELECT 'work:policy-version:' || id,'Politika Merkezi','PVR' FROM policy_versions ORDER BY rowid;
CREATE TRIGGER code_for_policy_versions AFTER INSERT ON policy_versions
BEGIN
  INSERT INTO work_record_code_input VALUES('work:policy-version:' || NEW.id,'Politika Merkezi','PVR');
END;

INSERT INTO work_record_code_input
  SELECT 'work:policy-attestation:' || id,'Politika Merkezi','PAT' FROM policy_attestations ORDER BY rowid;
CREATE TRIGGER code_for_policy_attestations AFTER INSERT ON policy_attestations
BEGIN
  INSERT INTO work_record_code_input VALUES('work:policy-attestation:' || NEW.id,'Politika Merkezi','PAT');
END;

INSERT INTO work_record_code_input
  SELECT 'work:policy-exception:' || id,'Politika Merkezi','PEX' FROM policy_exceptions ORDER BY rowid;
CREATE TRIGGER code_for_policy_exceptions AFTER INSERT ON policy_exceptions
BEGIN
  INSERT INTO work_record_code_input VALUES('work:policy-exception:' || NEW.id,'Politika Merkezi','PEX');
END;

-- Keep existing numbered IDs and allocate the next free number for uncoded legacy core records.
WITH prefixes(module,prefix) AS (VALUES
  ('Risk Assessment','RSK'),('BIA','BIA'),('Varlık Envanteri','AST'),('Uyum','CMP'),
  ('Tedarikçiler','VEN'),('Kontroller','CTL'),('Kanıtlar','EVD'),('Denetim Yönetimi','AUD'))
INSERT OR IGNORE INTO simple_grc_record_codes(record_id,module,code,created_at)
SELECT r.id,r.module,r.id,r.created_at FROM simple_grc_records r JOIN prefixes p USING(module)
WHERE r.id GLOB p.prefix || '-[0-9]*' AND substr(r.id,5) NOT GLOB '*[^0-9]*';

WITH prefixes(module,prefix) AS (VALUES
  ('Risk Assessment','RSK'),('BIA','BIA'),('Varlık Envanteri','AST'),('Uyum','CMP'),
  ('Tedarikçiler','VEN'),('Kontroller','CTL'),('Kanıtlar','EVD'),('Denetim Yönetimi','AUD')),
highest AS (
  SELECT p.module,p.prefix,MAX(COALESCE(c.value,0),
    COALESCE((SELECT MAX(CAST(substr(code,5) AS INTEGER)) FROM simple_grc_record_codes
      WHERE code GLOB p.prefix || '-[0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*'),0)) AS n
  FROM prefixes p LEFT JOIN simple_grc_record_code_counters c USING(module)),
missing AS (
  SELECT r.id,r.module,r.created_at,h.prefix,h.n+row_number() OVER(PARTITION BY r.module ORDER BY r.created_at,r.id) AS n
  FROM simple_grc_records r JOIN highest h USING(module)
  WHERE NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=r.id))
INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
SELECT id,module,printf('%s-%03d',prefix,n),created_at FROM missing;
