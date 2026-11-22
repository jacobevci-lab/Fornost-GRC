CREATE TABLE IF NOT EXISTS enterprise_continuity_plan_settings (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL UNIQUE,
  exercise_frequency TEXT, next_exercise_date TEXT, asset_refs TEXT NOT NULL DEFAULT '[]', supplier_refs TEXT NOT NULL DEFAULT '[]'
);

INSERT OR IGNORE INTO enterprise_continuity_plan_settings(sequence,plan_id)
SELECT CAST(substr(code,5) AS INTEGER),id FROM enterprise_continuity_plans
WHERE code GLOB 'BCP-[0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*'
  AND code=printf('BCP-%03d',CAST(substr(code,5) AS INTEGER)) AND CAST(substr(code,5) AS INTEGER)>0
ORDER BY created_at,id;

INSERT INTO enterprise_continuity_plan_settings(plan_id)
SELECT id FROM enterprise_continuity_plans p WHERE NOT EXISTS
  (SELECT 1 FROM enterprise_continuity_plan_settings s WHERE s.plan_id=p.id) ORDER BY created_at,id;

CREATE TRIGGER IF NOT EXISTS continuity_plan_settings_insert AFTER INSERT ON enterprise_continuity_plans
BEGIN
  INSERT OR IGNORE INTO enterprise_continuity_plan_settings(sequence,plan_id)
  SELECT CAST(substr(NEW.code,5) AS INTEGER),NEW.id
    WHERE NEW.code=printf('BCP-%03d',CAST(substr(NEW.code,5) AS INTEGER)) AND CAST(substr(NEW.code,5) AS INTEGER)>0;
  INSERT INTO enterprise_continuity_plan_settings(plan_id) SELECT NEW.id
    WHERE NOT EXISTS(SELECT 1 FROM enterprise_continuity_plan_settings WHERE plan_id=NEW.id);
END;
