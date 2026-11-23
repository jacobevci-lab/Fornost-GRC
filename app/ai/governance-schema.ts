export const aiWorkspaceSchema=[
`CREATE TABLE IF NOT EXISTS simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS simple_grc_record_code_counters(module TEXT PRIMARY KEY,value INTEGER NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS ai_system_profiles (
 model_id TEXT PRIMARY KEY REFERENCES ai_model_inventory(id) ON DELETE CASCADE,
 profile_json TEXT NOT NULL, assessment_json TEXT NOT NULL DEFAULT '{}', evidence_json TEXT,
 phase TEXT NOT NULL DEFAULT 'draft', submitted_by TEXT, decided_by TEXT, decision_note TEXT, updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS ai_system_decisions(id TEXT PRIMARY KEY,model_id TEXT NOT NULL REFERENCES ai_model_inventory(id),action TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,snapshot_json TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS ai_shadow_register (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, context TEXT NOT NULL, discovered_by TEXT NOT NULL, discovered_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'unreviewed', model_id TEXT, decided_by TEXT, decision_note TEXT, decided_at TEXT
)`,
`CREATE TABLE IF NOT EXISTS ai_monitor_details (
 observation_id TEXT PRIMARY KEY REFERENCES ai_model_monitoring(id), hallucination REAL,
 leakage INTEGER, finding_id TEXT, incident_id TEXT, acknowledged_at TEXT
)`,
`CREATE INDEX IF NOT EXISTS ai_shadow_status_idx ON ai_shadow_register(status,discovered_at)`,
`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT id,'AI Yönetişimi',printf('AIS-%03d',(SELECT max(n)+1 FROM (SELECT COALESCE(MAX(CAST(substr(code,5) AS INTEGER)),0) n FROM simple_grc_record_codes WHERE code GLOB 'AIS-[0-9]*' UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='AI Yönetişimi'))-1+row_number() OVER(ORDER BY created_at,id)),created_at FROM ai_model_inventory m
 WHERE NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=m.id)`,
`CREATE TRIGGER IF NOT EXISTS ai_system_register_code AFTER INSERT ON ai_model_inventory BEGIN
 INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(NEW.id,'AI Yönetişimi',printf('AIS-%03d',(SELECT max(n)+1 FROM (SELECT COALESCE(MAX(CAST(substr(code,5) AS INTEGER)),0) n FROM simple_grc_record_codes WHERE code GLOB 'AIS-[0-9]*' UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='AI Yönetişimi'))),NEW.created_at);
 INSERT INTO simple_grc_record_code_counters(module,value,updated_at) SELECT 'AI Yönetişimi',CAST(substr(code,5) AS INTEGER),NEW.created_at FROM simple_grc_record_codes WHERE record_id=NEW.id ON CONFLICT(module) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
 END`,
...['INSERT','UPDATE OF classification'].map((verb,index)=>`CREATE TRIGGER IF NOT EXISTS ai_system_regulatory_class_${index} AFTER ${verb} ON ai_regulatory_profiles
 WHEN NEW.classification IN ('prohibited','high-risk','limited-risk') BEGIN
 UPDATE ai_model_inventory SET status='suspended',approved_by=NULL,approved_at=NULL,decision_note='Regulatory classification requires reassessment',updated_at=NEW.updated_at,updated_by=NEW.updated_by
 WHERE id=NEW.model_id AND status='approved' AND (NEW.classification='prohibited' OR NOT EXISTS(SELECT 1 FROM ai_system_profiles p WHERE p.model_id=NEW.model_id AND (json_extract(p.profile_json,'$.risk')='high' OR (NEW.classification='limited-risk' AND json_extract(p.profile_json,'$.risk')='limited')))); END`),
 `CREATE TRIGGER IF NOT EXISTS ai_system_independent_signoff BEFORE UPDATE OF phase ON ai_system_profiles
 WHEN NEW.phase IN ('production','conditional') AND NOT COALESCE(
 OLD.phase='review' AND OLD.submitted_by IS NOT NULL AND NEW.decided_by IS NOT NULL
 AND lower(NEW.decided_by)=lower(json_extract(NEW.profile_json,'$.reviewer'))
 AND lower(NEW.decided_by) NOT IN (lower(OLD.submitted_by),lower(json_extract(NEW.profile_json,'$.owner')),lower(json_extract(NEW.profile_json,'$.technical')))
 AND json_extract(NEW.profile_json,'$.risk') IN ('minimal','limited','high')
 AND (json_extract(NEW.profile_json,'$.risk')!='high' OR (length(json_extract(NEW.assessment_json,'$.impact'))>=20 AND length(json_extract(NEW.assessment_json,'$.mitigation'))>=20))
 AND (json_extract(NEW.profile_json,'$.risk')='minimal' OR
 (json_extract(NEW.assessment_json,'$.reportType') IN ('redteam','bias','dpia') AND json_extract(NEW.evidence_json,'$.evidenceId') LIKE 'EVD-%'
 AND length(json_extract(NEW.evidence_json,'$.contentSha256'))=64
 AND (SELECT COUNT(DISTINCT value) FROM json_each(NEW.assessment_json,'$.checks') WHERE value IN ('injection','dlp','output','access'))=4)),0)
 BEGIN SELECT RAISE(ABORT,'AI_GATE_REQUIRED'); END`,
`CREATE TRIGGER IF NOT EXISTS ai_system_go_live BEFORE UPDATE OF status ON ai_model_inventory WHEN NEW.status='approved' AND OLD.status!='approved' AND NOT EXISTS(SELECT 1 FROM ai_system_profiles p WHERE p.model_id=NEW.id AND p.phase IN ('production','conditional') AND lower(p.decided_by)=lower(NEW.approved_by) AND json_extract(p.profile_json,'$.risk')!='prohibited' AND NOT EXISTS(SELECT 1 FROM ai_regulatory_profiles r WHERE r.model_id=p.model_id AND (r.classification='prohibited' OR (r.classification='high-risk' AND json_extract(p.profile_json,'$.risk')!='high') OR (r.classification='limited-risk' AND json_extract(p.profile_json,'$.risk')='minimal'))))
 BEGIN SELECT RAISE(ABORT,'AI_GATE_REQUIRED'); END`,
`CREATE TRIGGER IF NOT EXISTS ai_system_release_guard BEFORE UPDATE OF status ON ai_release_gates WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM ai_model_inventory m JOIN ai_system_profiles p ON p.model_id=m.id WHERE m.id=NEW.model_id AND m.status='approved' AND p.phase IN ('production','conditional') AND json_extract(p.profile_json,'$.risk')!='prohibited' AND p.decided_by IS NOT NULL AND (p.phase='production' OR NEW.environment='restricted-production'))
 BEGIN SELECT RAISE(ABORT,'AI_GATE_REQUIRED'); END`,
`CREATE TRIGGER IF NOT EXISTS ai_system_deploy_guard BEFORE UPDATE OF status ON ai_model_changes WHEN NEW.status='deployed' AND NOT EXISTS(SELECT 1 FROM ai_model_inventory m JOIN ai_system_profiles p ON p.model_id=m.id WHERE m.id=NEW.model_id AND m.status='approved' AND p.phase='production' AND json_extract(p.profile_json,'$.risk')!='prohibited')
 BEGIN SELECT RAISE(ABORT,'AI_GATE_REQUIRED'); END`,
`CREATE TRIGGER IF NOT EXISTS ai_system_withdraw_releases AFTER UPDATE OF status ON ai_model_inventory WHEN OLD.status='approved' AND NEW.status!='approved' BEGIN
 UPDATE ai_release_gates SET status='revoked',updated_by=NEW.updated_by,updated_at=NEW.updated_at WHERE model_id=NEW.id AND status IN ('approved','requested');
 END`,
`CREATE TRIGGER IF NOT EXISTS ai_system_stop AFTER UPDATE OF status ON ai_model_inventory WHEN NEW.status IN ('retired','suspended') BEGIN
 UPDATE ai_system_profiles SET phase=NEW.status,submitted_by=NULL,decided_by=NULL,updated_at=NEW.updated_at WHERE model_id=NEW.id;
 END`,
`CREATE TRIGGER IF NOT EXISTS ai_system_profile_history BEFORE DELETE ON ai_model_inventory
 WHEN EXISTS(SELECT 1 FROM ai_system_profiles WHERE model_id=OLD.id) BEGIN SELECT RAISE(ABORT,'AI_PROFILE_MANAGED'); END`
];
