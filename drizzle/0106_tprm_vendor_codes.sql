-- Preserve short legacy IDs when free, then allocate from the shared vendor sequence.
INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
SELECT r.id,r.module,upper(r.id),r.created_at FROM simple_grc_records r
WHERE r.module='Tedarikçiler' AND upper(r.id) GLOB 'VEN-[0-9]*'
  AND length(substr(r.id,5))>=3 AND substr(r.id,5) NOT GLOB '*[^0-9]*'
  AND NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=r.id OR upper(c.code)=upper(r.id))
ON CONFLICT DO NOTHING;

WITH reserved(value) AS (
  SELECT value FROM simple_grc_record_code_counters WHERE module='Tedarikçiler'
  UNION ALL SELECT CAST(substr(code,5) AS INTEGER) FROM simple_grc_record_codes
    WHERE upper(code) GLOB 'VEN-[0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*'
  UNION ALL SELECT CAST(substr(id,5) AS INTEGER) FROM simple_grc_records
    WHERE upper(id) GLOB 'VEN-[0-9]*' AND substr(id,5) NOT GLOB '*[^0-9]*'
), missing AS (
 SELECT r.id,r.created_at,row_number() OVER(ORDER BY r.created_at,r.id) AS n
 FROM simple_grc_records r WHERE r.module='Tedarikçiler'
   AND NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=r.id)
)
INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
SELECT id,'Tedarikçiler',printf('VEN-%03d',n+(SELECT coalesce(max(value),0) FROM reserved)),created_at FROM missing;

INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
SELECT 'Tedarikçiler',max(CAST(substr(code,5) AS INTEGER)),CURRENT_TIMESTAMP
FROM simple_grc_record_codes WHERE upper(code) GLOB 'VEN-[0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*'
HAVING count(*)>0
ON CONFLICT(module) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
WHERE excluded.value>simple_grc_record_code_counters.value;
