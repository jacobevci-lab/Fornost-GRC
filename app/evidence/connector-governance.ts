import {coreReferenceGuard} from "../core-reference-write";

export const freshnessOptions = [24, 168, 720, 2160] as const;
export const policyTable = "CREATE TABLE IF NOT EXISTS evidence_rule_review_policy (rule_id TEXT PRIMARY KEY, reviewer TEXT NOT NULL)";
export const signalTable = `CREATE TABLE IF NOT EXISTS evidence_source_signals (
  source_id TEXT NOT NULL, asset_id TEXT NOT NULL, signal TEXT NOT NULL,
  PRIMARY KEY(source_id,signal))`;
export const signalIndex = "CREATE INDEX IF NOT EXISTS evidence_source_signals_asset ON evidence_source_signals(asset_id,signal)";
export const clearSignals = `CREATE TRIGGER IF NOT EXISTS evidence_source_signals_reset AFTER UPDATE ON evidence_automation_sources
  WHEN NEW.enabled<>OLD.enabled OR NEW.driver<>OLD.driver OR NEW.config_json<>OLD.config_json
    OR NEW.secret_ciphertext IS NOT OLD.secret_ciphertext OR NEW.last_test_status IS NOT 'success'
  BEGIN DELETE FROM evidence_source_signals WHERE source_id=OLD.id; END`;

export function sourceAssetGuard(config:string){
  const asset=JSON.parse(config).assetRef;
  return coreReferenceGuard(asset?[{sourceId:"",field:"assetRef",value:asset.toLowerCase(),modules:["Varlık Envanteri"]}]:[]);
}

export function detectedCoverage(config:Record<string,string>,paths:{path:string;type:string}[],payload:unknown){
  const fields=paths.filter(p=>!p.path.startsWith("$.fornostCollection")&&!["object","array","null"].includes(p.type)).map(p=>p.path.toLowerCase());
  const signals=new Set<string>();
  for(const field of fields){
    if(/\b(?:edr|xdr)|sensorhealthstate|onboardingstatus/.test(field))signals.add("EDR");
    if(/\bsiem|logingestion|logsource/.test(field))signals.add("SIEM");
    if(/\bscan|vulnerabil/.test(field))signals.add("scan");
  }
  const meta=(payload as {fornostCollection?:{recordCount?:number}}|null)?.fornostCollection;
  if(config.providerId && Number(meta?.recordCount)>0){
    if(["defender-endpoint","defender-xdr","crowdstrike"].includes(config.providerId))signals.add("EDR");
    if(config.providerId==="sentinel")signals.add("SIEM");
    if(config.providerId==="tenable"&&config.dataset==="scans")signals.add("scan");
  }
  return [...signals];
}

export function reviewerGuard(reviewer:string,owner:string,actor:string){
  return {sql:`EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id
    WHERE lower(u.email)=lower(?) AND u.status='Active' AND u.role IN ('Admin','Editor')
      AND lower(u.email) NOT IN (lower(?),lower(?)) AND lower(u.name)<>lower(?)
      AND (u.role='Admin' OR a.user_id IS NULL OR CASE WHEN json_valid(a.policy_json)
        THEN (json_extract(a.policy_json,'$.mode')='full' OR json_extract(a.policy_json,'$.modules.Kanıtlar')='write') END))`,
    values:[reviewer,owner,actor,owner]};
}
export async function automationSummary(db:D1Database,now:Date){
  return db.prepare(`SELECT
    (SELECT COUNT(*) FROM evidence_automation_sources WHERE enabled=1 AND last_test_status='success') connected,
    (SELECT COUNT(*) FROM evidence_automation_rules r JOIN evidence_automation_sources s ON s.id=r.source_id WHERE r.enabled=1 AND s.enabled=1) active,
    (SELECT COUNT(*) FROM evidence_automation_rules WHERE last_status IN ('fail','error')) failed,
    (SELECT COUNT(*) FROM simple_grc_records e WHERE e.module='Kanıtlar' AND json_extract(e.data_json,'$.reviewStatus')='pending-review'
      AND EXISTS(SELECT 1 FROM evidence_automation_runs run WHERE run.evidence_id=e.id)) pending,
    (SELECT COUNT(DISTINCT run.evidence_id) FROM evidence_automation_runs run JOIN simple_grc_records e ON e.id=run.evidence_id AND e.module='Kanıtlar'
      WHERE run.created_at>=? AND run.created_at<=?) generated`)
    .bind(new Date(now.getTime()-86400000).toISOString(),now.toISOString()).first();
}
