import { completedInitialization } from '../../completed-initialization';
export const agenticSchema = [
    `CREATE TABLE IF NOT EXISTS ai_hitl_proposals(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,actor TEXT NOT NULL,kind TEXT NOT NULL,params_json TEXT NOT NULL,source_json TEXT NOT NULL,revision TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',expires_at TEXT NOT NULL,result_json TEXT,created_at TEXT NOT NULL,applied_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS ai_hitl_actor_idx ON ai_hitl_proposals(actor_id,status,created_at)`,
    `CREATE TABLE IF NOT EXISTS ai_work_reminders(id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL,finding_id TEXT NOT NULL,finding_code TEXT NOT NULL,owner TEXT NOT NULL,note TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_by TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,UNIQUE(proposal_id,finding_id))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ai_reminder_active_idx ON ai_work_reminders(finding_id,owner) WHERE status='open'`,
    `CREATE TABLE IF NOT EXISTS ai_governance_extensions(model_id TEXT PRIMARY KEY,wizard_json TEXT,bom_json TEXT,revision TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ai_shadow_discoveries(fingerprint TEXT PRIMARY KEY,shadow_id TEXT NOT NULL,source TEXT NOT NULL,details_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL)`,
    `CREATE TRIGGER IF NOT EXISTS ai_hitl_receipt AFTER UPDATE OF status ON ai_hitl_proposals WHEN NEW.status='applied' AND OLD.status='pending' BEGIN
 INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at) VALUES(NEW.id,NEW.actor,'Ask Fornost (Kullanıcı Onaylı)','rules','',NULL,'[]','success',0,NEW.kind||' · '||NEW.result_json,NEW.applied_at); END`,
    ...['model', 'profile'].map(kind => `CREATE TRIGGER IF NOT EXISTS ai_deep_${kind}_approval BEFORE UPDATE OF ${kind === 'model' ? 'status' : 'phase'} ON ${kind === 'model' ? 'ai_model_inventory' : 'ai_system_profiles'}
 WHEN NEW.${kind === 'model' ? 'status' : 'phase'} IN ('approved','production','conditional') AND EXISTS(
 SELECT 1 FROM ai_governance_extensions e WHERE e.model_id=NEW.${kind === 'model' ? 'id' : 'model_id'} AND (
 (e.wizard_json IS NOT NULL AND (json_extract(e.wizard_json,'$.risk') IN ('unresolved','prohibited') OR json_extract(e.wizard_json,'$.needsReview')=1
 OR EXISTS(SELECT 1 FROM json_each(e.wizard_json,'$.checklist') c WHERE NOT EXISTS(SELECT 1 FROM json_each(e.wizard_json,'$.completed') d WHERE d.value=json_extract(c.value,'$.key')))
 OR (json_extract(e.wizard_json,'$.governingRisk')='high' AND NOT EXISTS(SELECT 1 FROM ai_system_profiles p WHERE p.model_id=e.model_id AND json_extract(p.profile_json,'$.risk') IN ('high','prohibited')))
 OR (json_extract(e.wizard_json,'$.governingRisk')='limited' AND NOT EXISTS(SELECT 1 FROM ai_system_profiles p WHERE p.model_id=e.model_id AND json_extract(p.profile_json,'$.risk') IN ('limited','high','prohibited')))))
 OR EXISTS(SELECT 1 FROM json_each(e.bom_json,'$.tools') tool WHERE json_extract(tool.value,'$.permission') IN ('write','admin') AND COALESCE(trim(json_extract(tool.value,'$.hitl')),'')='')))
 BEGIN SELECT RAISE(ABORT,'AI_DEEP_REVIEW_REQUIRED'); END`)
];
const initialize = completedInitialization();
export const ensureAgentic = (db: D1Database) => initialize(db, () => db.batch(agenticSchema.map(sql => db.prepare(sql))));
