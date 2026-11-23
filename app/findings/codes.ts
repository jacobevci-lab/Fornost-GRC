// The native finding ID and its historical code remain resolvable after numbering.
export const findingCodeSchema = [
  `CREATE TABLE IF NOT EXISTS enterprise_finding_code_aliases(
    legacy_code TEXT PRIMARY KEY NOT NULL, finding_id TEXT NOT NULL UNIQUE)`,
  `INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
    SELECT 'work:FND',MAX(n),CURRENT_TIMESTAMP FROM (
      SELECT 0 AS n UNION ALL SELECT CAST(substr(code,5) AS INTEGER) FROM enterprise_findings
        WHERE code=printf('FND-%03d',CAST(substr(code,5) AS INTEGER))
      UNION ALL SELECT CAST(substr(code,5) AS INTEGER) FROM simple_grc_record_codes WHERE code GLOB 'FND-[0-9]*')
    WHERE 1 ON CONFLICT(module) DO UPDATE SET value=MAX(value,excluded.value)`,
  `CREATE TRIGGER IF NOT EXISTS allocate_enterprise_finding_code AFTER INSERT ON enterprise_finding_code_aliases
    BEGIN
      UPDATE simple_grc_record_code_counters SET value=CASE
        WHEN NEW.legacy_code=printf('FND-%03d',CAST(substr(NEW.legacy_code,5) AS INTEGER))
        THEN MAX(value,CAST(substr(NEW.legacy_code,5) AS INTEGER)) ELSE value+1 END,updated_at=CURRENT_TIMESTAMP WHERE module='work:FND';
      INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
        SELECT 'work:finding:'||NEW.finding_id,'Bulgular ve CAPA',
          CASE WHEN NEW.legacy_code=printf('FND-%03d',CAST(substr(NEW.legacy_code,5) AS INTEGER))
          THEN NEW.legacy_code ELSE printf('FND-%03d',value) END,CURRENT_TIMESTAMP
        FROM simple_grc_record_code_counters WHERE module='work:FND';
      UPDATE enterprise_findings SET code=(SELECT code FROM simple_grc_record_codes WHERE record_id='work:finding:'||NEW.finding_id)
        WHERE id=NEW.finding_id;
    END`,
  `INSERT INTO enterprise_finding_code_aliases(legacy_code,finding_id)
    SELECT code,id FROM enterprise_findings f WHERE NOT EXISTS
      (SELECT 1 FROM enterprise_finding_code_aliases a WHERE a.finding_id=f.id) ORDER BY detected_at,id`,
  `CREATE TRIGGER IF NOT EXISTS code_for_enterprise_findings AFTER INSERT ON enterprise_findings
    BEGIN INSERT INTO enterprise_finding_code_aliases VALUES(NEW.code,NEW.id); END`,
];
export async function storedFindingCode(db:D1Database,id:string) {
  const row=await db.prepare('SELECT code FROM enterprise_findings WHERE id=?').bind(id).first<{code:string}>();
  if(!row)throw new Error('Finding code unavailable');
  return row.code;
}
