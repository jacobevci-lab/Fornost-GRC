import { EvidenceExecutionConflict, observedExecutionGuard } from './execution-guard';

type Configuration = { name:string; vendor:string; category:string; driver:string; config_json:string; secret_ciphertext:string|null };

/** Preserve history while requiring a new assessment for a changed collector identity. */
export async function updateEvidenceSource(db:D1Database, observed:Configuration & {id:string;enabled:number}, next:Configuration, stamp:string, actor:string) {
  const guard=observedExecutionGuard('source',observed,'s');
  const changed=['driver','config_json','secret_ciphertext'].some(key=>observed[key as keyof Configuration]!==next[key as keyof Configuration]);
  const statements=[db.prepare(`UPDATE evidence_automation_sources AS s SET name=?,vendor=?,category=?,driver=?,config_json=?,secret_ciphertext=?,last_test_status=NULL,last_test_at=NULL,updated_at=?,updated_by=? WHERE ${guard.sql}`)
    .bind(next.name,next.vendor,next.category,next.driver,next.config_json,next.secret_ciphertext,stamp,actor,...guard.values)];
  if(changed) statements.push(db.prepare(`UPDATE evidence_automation_rules SET last_status=NULL,last_evidence_at=NULL,last_run_id=NULL,consecutive_failures=0,next_run_at=CASE WHEN enabled=1 THEN ? ELSE NULL END,updated_at=?,updated_by=? WHERE source_id=? AND changes()=1`).bind(stamp,stamp,actor,observed.id));
  const result=await db.batch(statements);
  if(!result[0].meta?.changes)throw new EvidenceExecutionConflict();
  return { reassessmentRequired:changed };
}

/** A response for old credentials/configuration cannot certify the current source. */
export async function recordEvidenceSourceTest(db:D1Database, observed:object, status:'success'|'error', stamp:string) {
  const guard=observedExecutionGuard('source',observed,'s');
  const result=await db.prepare(`UPDATE evidence_automation_sources AS s SET last_test_status=?,last_test_at=?,updated_at=? WHERE ${guard.sql}`).bind(status,stamp,stamp,...guard.values).run();
  if(!result.meta?.changes)throw new EvidenceExecutionConflict();
}
