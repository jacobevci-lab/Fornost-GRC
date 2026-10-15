export class EvidenceExecutionConflict extends Error {
  constructor() { super('Kaynak veya kontrol değişti ya da başka bir çalışma tamamlandı. Eski sonuç kaydedilmedi; güncel kaydı inceleyip yeniden çalıştırın.'); }
}

const ruleKeys = ['id','name','source_id','control_refs','json_path','operator','expected','schedule','enabled','template_id','template_version','freshness_hours','failure_threshold','consecutive_failures','auto_finding','remediation_owner','remediation_due_days','next_run_at','last_status','last_run_at','last_evidence_at','last_run_id','updated_at'];
// Connection-test timestamps are diagnostics, not changes to collection identity.
const sourceKeys = ['id','name','vendor','category','driver','enabled','config_json','secret_ciphertext'];
export function observedExecutionGuard(kind: 'rule' | 'source', row: object, alias: 'r' | 's') {
  const keys = kind === 'rule' ? ruleKeys : sourceKeys, values = row as Record<string, unknown>;
  return { sql: keys.map(key => `${alias}.${key} IS ?`).join(' AND '), values: keys.map(key => values[key] ?? null) };
}

export function executionReceipt(ruleId: string, runId: string) {
  return { sql: 'EXISTS(SELECT 1 FROM evidence_automation_rules WHERE id=? AND last_run_id=?)', values: [ruleId, runId] };
}
