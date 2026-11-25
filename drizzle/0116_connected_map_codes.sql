CREATE TABLE IF NOT EXISTS connected_map_context_links(
 id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,source_module TEXT NOT NULL,
 target_module TEXT NOT NULL,relation TEXT NOT NULL,UNIQUE(source_id,target_id,relation)
);

-- Canonical display codes. Internal identities, references and historical decisions stay intact.
CREATE VIEW IF NOT EXISTS connected_map_code_input AS SELECT '' AS id,'' AS module,'' AS prefix,'' AS native WHERE 0;
CREATE TRIGGER IF NOT EXISTS connected_map_allocate INSTEAD OF INSERT ON connected_map_code_input
WHEN NOT EXISTS (SELECT 1 FROM simple_grc_record_codes WHERE record_id=NEW.id AND code<>record_id)
 AND NOT EXISTS (SELECT 1 FROM simple_grc_record_codes WHERE record_id=NEW.id AND code GLOB NEW.prefix||'-[0-9][0-9][0-9]*' AND substr(code,length(NEW.prefix)+2) NOT GLOB '*[^0-9]*')
BEGIN
 INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
 SELECT 'map:'||NEW.prefix,MAX(n) + CASE WHEN NEW.native GLOB NEW.prefix||'-[0-9][0-9][0-9]*' AND substr(NEW.native,length(NEW.prefix)+2) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM simple_grc_record_codes WHERE code=NEW.native AND record_id<>NEW.id)
 AND NOT EXISTS(SELECT 1 FROM simple_grc_records WHERE id=NEW.native AND id<>NEW.id)
 THEN 0 ELSE 1 END,CURRENT_TIMESTAMP FROM (
   SELECT coalesce(max(value),0) n FROM simple_grc_record_code_counters WHERE module IN ('map:'||NEW.prefix,'work:'||NEW.prefix,NEW.module)
   UNION ALL SELECT coalesce(max(cast(substr(code,length(NEW.prefix)+2) as integer)),0) FROM simple_grc_record_codes WHERE code GLOB NEW.prefix||'-[0-9]*' AND substr(code,length(NEW.prefix)+2) NOT GLOB '*[^0-9]*'
   UNION ALL SELECT coalesce(max(cast(substr(id,length(NEW.prefix)+2) as integer)),0) FROM simple_grc_records WHERE id GLOB NEW.prefix||'-[0-9]*' AND substr(id,length(NEW.prefix)+2) NOT GLOB '*[^0-9]*'
 ) WHERE 1 ON CONFLICT(module) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
 INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT NEW.id,NEW.module,CASE WHEN NEW.native GLOB NEW.prefix||'-[0-9][0-9][0-9]*' AND substr(NEW.native,length(NEW.prefix)+2) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM simple_grc_record_codes WHERE code=NEW.native AND record_id<>NEW.id)
 AND NOT EXISTS(SELECT 1 FROM simple_grc_records WHERE id=NEW.native AND id<>NEW.id)
 THEN NEW.native ELSE printf('%s-%03d',NEW.prefix,value) END,CURRENT_TIMESTAMP FROM simple_grc_record_code_counters WHERE module='map:'||NEW.prefix
 ON CONFLICT(record_id) DO UPDATE SET code=excluded.code WHERE simple_grc_record_codes.code=simple_grc_record_codes.record_id;
 -- Publish reservations to native register writers in the same transaction.
 INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
 SELECT NEW.module,cast(substr(code,length(NEW.prefix)+2) AS INTEGER),CURRENT_TIMESTAMP
 FROM simple_grc_record_codes WHERE record_id=NEW.id AND NEW.prefix IN ('RSK','BIA','AST','CMP','VEN','CTL','EVD','AUD')
 ON CONFLICT(module) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
 WHERE excluded.value>simple_grc_record_code_counters.value;
END;

WITH prefixes(module,prefix) AS (VALUES ('Risk Assessment','RSK'),('BIA','BIA'),('Varlık Envanteri','AST'),('Uyum','CMP'),('Tedarikçiler','VEN'),('Kontroller','CTL'),('Kanıtlar','EVD'),('Denetim Yönetimi','AUD'))
INSERT INTO connected_map_code_input SELECT r.id,r.module,p.prefix,r.id FROM simple_grc_records r JOIN prefixes p USING(module) ORDER BY r.created_at,r.id;

-- Template-generated requirements are inserted in batches outside the ordinary register allocator.
CREATE TRIGGER IF NOT EXISTS map_code_audit_requirement AFTER INSERT ON simple_grc_records
WHEN NEW.module='Denetim Yönetimi' AND NEW.id GLOB '*-REQ-[0-9]*'
 AND EXISTS(SELECT 1 FROM simple_audits WHERE id=substr(NEW.id,1,instr(NEW.id,'-REQ-')-1))
BEGIN
 INSERT INTO connected_map_code_input VALUES(NEW.id,NEW.module,'AUD','');
END;

INSERT INTO connected_map_code_input SELECT vendor_id,'Tedarikçiler','VEN',vendor_id FROM third_party_profiles ORDER BY vendor_id;
CREATE TRIGGER IF NOT EXISTS map_code_vendor_profile AFTER INSERT ON third_party_profiles
WHEN NOT EXISTS(SELECT 1 FROM simple_grc_record_codes WHERE record_id=NEW.vendor_id)
BEGIN
 INSERT INTO connected_map_code_input VALUES(NEW.vendor_id,'Tedarikçiler','VEN',NEW.vendor_id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:audit:'||id,'Denetim Yönetimi','AUD',id FROM simple_audits ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_audit AFTER INSERT ON simple_audits BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:audit:'||NEW.id,'Denetim Yönetimi','AUD',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:incident:'||id,'Güvenlik Olayları','INC',code FROM enterprise_incidents ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_incident AFTER INSERT ON enterprise_incidents BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:incident:'||NEW.id,'Güvenlik Olayları','INC',NEW.code);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:continuity-plan:'||id,'İş Sürekliliği','BCP',id FROM enterprise_continuity_plans ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_continuity_plan AFTER INSERT ON enterprise_continuity_plans BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:continuity-plan:'||NEW.id,'İş Sürekliliği','BCP',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:continuity-exercise:'||id,'İş Sürekliliği','BCX',id FROM enterprise_continuity_exercises ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_continuity_exercise AFTER INSERT ON enterprise_continuity_exercises BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:continuity-exercise:'||NEW.id,'İş Sürekliliği','BCX',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:risk-appetite:'||id,'Risk İştahı ve KRI','RAP',id FROM risk_appetite_statements ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_risk_appetite AFTER INSERT ON risk_appetite_statements BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:risk-appetite:'||NEW.id,'Risk İştahı ve KRI','RAP',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:kri-measurement:'||id,'Risk İştahı ve KRI','KRM',id FROM risk_kri_measurements ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_kri_measurement AFTER INSERT ON risk_kri_measurements BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:kri-measurement:'||NEW.id,'Risk İştahı ve KRI','KRM',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:kri-breach:'||id,'Risk İştahı ve KRI','KRB',id FROM risk_kri_breaches ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_kri_breach AFTER INSERT ON risk_kri_breaches BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:kri-breach:'||NEW.id,'Risk İştahı ve KRI','KRB',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:risk-scenario:'||id,'Risk İştahı ve KRI','RSC',id FROM risk_appetite_scenarios ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_risk_scenario AFTER INSERT ON risk_appetite_scenarios BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:risk-scenario:'||NEW.id,'Risk İştahı ve KRI','RSC',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:regulatory-source:'||id,'Regülasyon Merkezi','RGS',id FROM regulatory_intelligence_sources ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_regulatory_source AFTER INSERT ON regulatory_intelligence_sources BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:regulatory-source:'||NEW.id,'Regülasyon Merkezi','RGS',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:automation-rule:'||id,'Kanıt Otomasyonu','CCR',id FROM evidence_automation_rules ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_automation_rule AFTER INSERT ON evidence_automation_rules BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:automation-rule:'||NEW.id,'Kanıt Otomasyonu','CCR',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:automation-run:'||id,'Kanıt Otomasyonu','RUN',id FROM evidence_automation_runs ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_automation_run AFTER INSERT ON evidence_automation_runs BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:automation-run:'||NEW.id,'Kanıt Otomasyonu','RUN',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:automation-source:'||id,'Kanıt Otomasyonu','CON',id FROM evidence_automation_sources ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_automation_source AFTER INSERT ON evidence_automation_sources BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:automation-source:'||NEW.id,'Kanıt Otomasyonu','CON',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:automation-finding:'||id,'Kanıt Otomasyonu','CCF',id FROM evidence_automation_findings ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_automation_finding AFTER INSERT ON evidence_automation_findings BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:automation-finding:'||NEW.id,'Kanıt Otomasyonu','CCF',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:automation-assurance:ASSURANCE:'||id,'Kanıt Otomasyonu','CAS',id FROM evidence_automation_rules ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_automation_assurance AFTER INSERT ON evidence_automation_rules BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:automation-assurance:ASSURANCE:'||NEW.id,'Kanıt Otomasyonu','CAS',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:automation-remediation:REMEDIATION:'||id,'Kanıt Otomasyonu','CAR',id FROM evidence_automation_findings ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_automation_remediation AFTER INSERT ON evidence_automation_findings BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:automation-remediation:REMEDIATION:'||NEW.id,'Kanıt Otomasyonu','CAR',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:remediation:REMEDIATION:'||id,'Bulgular ve CAPA','CAP',id FROM enterprise_findings ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_remediation AFTER INSERT ON enterprise_findings BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:remediation:REMEDIATION:'||NEW.id,'Bulgular ve CAPA','CAP',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:ai-alert:'||id,'AI Yönetişimi','AAL',id FROM ai_assurance_alerts ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_ai_alert AFTER INSERT ON ai_assurance_alerts BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:ai-alert:'||NEW.id,'AI Yönetişimi','AAL',NEW.id);
END;

INSERT INTO connected_map_code_input SELECT 'enterprise:ai-finding:'||id,'AI Yönetişimi','AIF',id FROM ai_findings ORDER BY id;
CREATE TRIGGER IF NOT EXISTS map_code_ai_finding AFTER INSERT ON ai_findings BEGIN
 INSERT INTO connected_map_code_input VALUES('enterprise:ai-finding:'||NEW.id,'AI Yönetişimi','AIF',NEW.id);
END;
