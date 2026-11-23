-- Earlier imports may have saved a technical or external reference in the code
-- column itself. Preserve those lookups and reserve a short display identity.
CREATE VIEW IF NOT EXISTS connected_map_display_candidates AS
SELECT c.record_id,c.module,c.code,
  CASE
    WHEN c.record_id LIKE 'work:finding:%' THEN 'FND'
    WHEN c.record_id LIKE 'work:vendor-assessment:%' THEN 'VSA'
    WHEN c.record_id LIKE 'work:vendor-finding:%' THEN 'VSF'
    WHEN c.record_id LIKE 'work:policy-version:%' THEN 'PVR'
    WHEN c.record_id LIKE 'work:policy-exception:%' THEN 'PEX'
    WHEN c.record_id LIKE 'work:regulatory-change:%' THEN 'RGC'
    WHEN c.record_id LIKE 'work:regulatory-impact:%' THEN 'RGI'
    WHEN c.record_id LIKE 'work:continuity-gap:%' THEN 'BCG'
    WHEN c.record_id LIKE 'work:%' THEN NULL
    WHEN c.record_id LIKE 'enterprise:%' THEN CASE substr(c.record_id,12,instr(substr(c.record_id,12),':')-1)
      WHEN 'audit' THEN 'AUD' WHEN 'incident' THEN 'INC' WHEN 'remediation' THEN 'CAP'
      WHEN 'continuity-plan' THEN 'BCP' WHEN 'continuity-exercise' THEN 'BCX'
      WHEN 'risk-appetite' THEN 'RAP' WHEN 'risk-scenario' THEN 'RSC' WHEN 'kri-measurement' THEN 'KRM' WHEN 'kri-breach' THEN 'KRB'
      WHEN 'regulatory-source' THEN 'RGS' WHEN 'automation-rule' THEN 'CCR' WHEN 'automation-run' THEN 'RUN'
      WHEN 'automation-source' THEN 'CON' WHEN 'automation-assurance' THEN 'CAS' WHEN 'automation-finding' THEN 'CCF' WHEN 'automation-remediation' THEN 'CAR'
      WHEN 'ai-alert' THEN 'AAL' WHEN 'ai-finding' THEN 'AIF' END
    ELSE CASE c.module WHEN 'Risk Assessment' THEN 'RSK' WHEN 'BIA' THEN 'BIA' WHEN 'Varlık Envanteri' THEN 'AST'
      WHEN 'Uyum' THEN 'CMP' WHEN 'Tedarikçiler' THEN 'VEN' WHEN 'Kontroller' THEN 'CTL' WHEN 'Kanıtlar' THEN 'EVD'
      WHEN 'Denetim Yönetimi' THEN 'AUD' WHEN 'Politika Merkezi' THEN 'POL' WHEN 'AI Yönetişimi' THEN 'AIS'
      WHEN 'Bulgular ve CAPA' THEN 'FND' WHEN 'Güvenlik Olayları' THEN 'INC' END
  END AS prefix
FROM simple_grc_record_codes c WHERE c.record_id NOT LIKE 'map:display:%';

CREATE TRIGGER IF NOT EXISTS map_display_counter AFTER INSERT ON simple_grc_record_codes
WHEN NEW.record_id LIKE 'map:display:%'
BEGIN
  INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
  VALUES('work:'||substr(NEW.code,1,instr(NEW.code,'-')-1),cast(substr(NEW.code,instr(NEW.code,'-')+1) AS INTEGER),CURRENT_TIMESTAMP)
  ON CONFLICT(module) DO UPDATE SET value=max(value,excluded.value),updated_at=excluded.updated_at;
END;

WITH prefixes(module,prefix) AS (VALUES
  ('Politika Merkezi','POL'),('Güvenlik Olayları','INC'),('Bulgular ve CAPA','FND'),('AI Yönetişimi','AIS'))
INSERT INTO connected_map_code_input
SELECT r.id,r.module,p.prefix,r.id FROM simple_grc_records r JOIN prefixes p USING(module)
WHERE NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=r.id)
ORDER BY r.created_at,r.id;

INSERT INTO connected_map_code_input
SELECT 'map:display:'||record_id,module,prefix,'' FROM connected_map_display_candidates
WHERE prefix IS NOT NULL AND (code NOT GLOB prefix||'-[0-9][0-9][0-9]*' OR substr(code,length(prefix)+2) GLOB '*[^0-9]*')
ORDER BY record_id;

-- Native inserts keep their existing identity and counter allocation. This
-- hook only runs for legacy imports which explicitly write a malformed code.
CREATE TRIGGER IF NOT EXISTS map_import_display_identity AFTER INSERT ON simple_grc_record_codes
WHEN NEW.record_id NOT LIKE 'map:display:%' AND EXISTS(SELECT 1 FROM connected_map_display_candidates WHERE record_id=NEW.record_id AND prefix IS NOT NULL
  AND (code NOT GLOB prefix||'-[0-9][0-9][0-9]*' OR substr(code,length(prefix)+2) GLOB '*[^0-9]*'))
BEGIN
  INSERT INTO connected_map_code_input
  SELECT 'map:display:'||record_id,module,prefix,'' FROM connected_map_display_candidates
  WHERE record_id=NEW.record_id AND prefix IS NOT NULL;
END;
