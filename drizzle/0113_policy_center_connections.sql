CREATE TABLE IF NOT EXISTS policy_exception_connections (
 exception_id TEXT PRIMARY KEY NOT NULL,scope_kind TEXT NOT NULL,scope_ref TEXT NOT NULL,control_refs TEXT NOT NULL DEFAULT '[]',risk_ref TEXT);

INSERT OR IGNORE INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT id,'Politika Merkezi',code,created_at FROM policy_documents WHERE code GLOB 'POL-[0-9][0-9][0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*' AND length(code)<=17;

INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT id,'Politika Merkezi',printf('POL-%03d',(SELECT COALESCE(MAX(n),0) FROM (
 SELECT CAST(substr(code,5) AS INTEGER) n FROM simple_grc_record_codes WHERE code GLOB 'POL-[0-9][0-9][0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*' AND length(code)<=17
 UNION ALL SELECT CAST(substr(code,5) AS INTEGER) FROM policy_documents WHERE code GLOB 'POL-[0-9][0-9][0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*' AND length(code)<=17
 UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='Politika Merkezi'))+row_number() OVER(ORDER BY created_at,id)),created_at
 FROM policy_documents p WHERE NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=p.id);

CREATE TRIGGER IF NOT EXISTS policy_register_short_code AFTER INSERT ON policy_documents BEGIN
 INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(NEW.id,'Politika Merkezi',
 CASE WHEN NEW.code GLOB 'POL-[0-9][0-9][0-9]*' AND substr(NEW.code,5) NOT GLOB '*[^0-9]*' AND length(NEW.code)<=17 THEN NEW.code ELSE (SELECT printf('POL-%03d',1+(SELECT COALESCE(MAX(n),0) FROM (
 SELECT CAST(substr(code,5) AS INTEGER) n FROM simple_grc_record_codes WHERE code GLOB 'POL-[0-9][0-9][0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*' AND length(code)<=17
 UNION ALL SELECT CAST(substr(code,5) AS INTEGER) FROM policy_documents WHERE code GLOB 'POL-[0-9][0-9][0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*' AND length(code)<=17
 UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='Politika Merkezi')))) END,NEW.created_at);
 INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
 SELECT 'Politika Merkezi',CAST(substr(code,5) AS INTEGER),NEW.created_at FROM simple_grc_record_codes WHERE record_id=NEW.id
 ON CONFLICT(module) DO UPDATE SET value=max(value,excluded.value),updated_at=excluded.updated_at;
 END;
