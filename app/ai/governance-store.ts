import {ensureAgentic} from './agentic/schema';
import type { Actor } from '../api/auth/security';
import { ensureCoreGrcSchemaCompatibility } from '../api/grc/schema-compat';
import { ensureFindingsSchemaCompatibility } from '../api/findings/schema-compat';
import { ensureIncidentTables } from '../incidents/tables';
import { commitLifecycle, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { prepareWorkflowSelection, joinWorkflowGuards } from '../workflow-selection-store';
import { evaluateEvidenceEligibility } from '../evidence/eligibility';
import { calculateAiModelRisk } from './model-inventory';
import { redactSensitiveText } from './security';
import { governingRisk, blankAssessment, blockers, DeskError, parseProfile, parseAssessment, type Desk, type Profile, type Observation, type SystemRow, type Shadow, type Pin } from './governance-domain';
export type GovernanceEnv = {
  DB: D1Database;
  BUCKET?: R2Bucket;
};
export type Body = Record<string, unknown>;
export const text = (x: unknown, n = 1600) => redactSensitiveText(x, n);
export function receipt(db: D1Database, id: string, actor: string, action: string, detail: string, at: string) {
  return lifecycleInsert(db, 'ai_activity_logs', {
    id: crypto.randomUUID(),
    actor,
    action,
    provider: '',
    model: '',
    prompt_hash: null,
    context_refs_json: JSON.stringify([id]),
    status: 'success',
    latency_ms: 0,
    detail,
    created_at: at
  });
}
const selectModel = `SELECT m.*,c.code,p.profile_json,p.assessment_json,p.evidence_json,p.phase,p.submitted_by,p.decision_note profile_note,
 COALESCE(p.updated_at,m.updated_at) revision,
 (SELECT json_extract(wizard_json,'$.governingRisk') FROM ai_governance_extensions WHERE model_id=m.id) extension_risk,
 EXISTS(SELECT 1 FROM ai_findings f WHERE f.model_id=m.id AND f.status NOT IN ('resolved','dismissed')) OR EXISTS(SELECT 1 FROM ai_assurance_alerts a WHERE a.model_id=m.id AND a.status!='resolved')
 OR EXISTS(SELECT 1 FROM enterprise_findings f WHERE f.source_type='ai' AND (f.status NOT IN ('closed','accepted','cancelled') OR f.status='accepted' AND f.accept_until<date('now')) AND (f.source_ref=m.id OR f.source_ref IN (SELECT id FROM ai_findings n WHERE n.model_id=m.id))) native_issue,
 (SELECT CASE classification WHEN 'high-risk' THEN 'high' WHEN 'limited-risk' THEN 'limited' WHEN 'minimal-risk' THEN 'minimal' WHEN 'prohibited' THEN 'prohibited' ELSE '' END FROM ai_regulatory_profiles WHERE model_id=m.id) native_risk,
 EXISTS(SELECT 1 FROM ai_release_gates g WHERE g.model_id=m.id AND g.status='requested') native_gate
 FROM ai_model_inventory m LEFT JOIN ai_system_profiles p ON p.model_id=m.id LEFT JOIN simple_grc_record_codes c ON c.record_id=m.id`;
const scope = "(?='Admin' OR lower(m.owner)=? OR lower(json_extract(p.profile_json,'$.technical'))=?)";
const map = (r: Body): SystemRow => ({
  id: String(r.id),
  code: String(r.code),
  name: String(r.system_name),
  model: String(r.model_name),
  vendor: String(r.vendor),
  owner: String(r.owner),
  purpose: String(r.purpose),
  reviewDate: String(r.review_date),
  phase: ['suspended', 'retired'].includes(String(r.status)) ? String(r.status) : String(r.phase || (r.status === 'approved' ? 'production' : 'draft')),
  revision: String(r.revision),
  profile: r.profile_json ? JSON.parse(String(r.profile_json)) : null,
  assessment: {
    ...blankAssessment,
    ...JSON.parse(String(r.assessment_json || '{}'))
  },
  pin: r.evidence_json ? JSON.parse(String(r.evidence_json)) : null,
  openIssue: !!r.native_issue,
  decision: String(r.profile_note || r.decision_note || ''),
  submittedBy: String(r.submitted_by || ''),
  metrics: [],
  nativeGate: !!r.native_gate,
  nativeRisk: governingRisk(String(r.native_risk || ''),String(r.extension_risk || ''))
});
export async function getModel(db: D1Database, id: unknown, actor: Actor) {
  await ensureAgentic(db);
  await ensureFindingsSchemaCompatibility(db);
  const r = await db.prepare(selectModel + ' WHERE m.id=? AND ' + scope).bind(String(id || ''), actor.role, actor.email, actor.email).first<Body>();
  if (!r) throw new DeskError('denied', 403);
  return map(r);
}
export async function desk(db: D1Database, actor: Actor): Promise<Desk> {
  await Promise.all([ensureCoreGrcSchemaCompatibility(db), ensureFindingsSchemaCompatibility(db), ensureIncidentTables(db),ensureAgentic(db)]);
  const [models, metrics, shadow, next] = await db.batch<Body>([db.prepare(selectModel + ' WHERE ' + scope + ' ORDER BY m.system_name,m.id').bind(actor.role, actor.email, actor.email), db.prepare(`SELECT o.*,d.hallucination,d.leakage,d.finding_id,d.incident_id,d.acknowledged_at,f.code finding_code,i.code incident_code,f.status finding_status,i.status incident_status
  FROM ai_model_monitoring o JOIN ai_model_inventory m ON m.id=o.model_id LEFT JOIN ai_system_profiles p ON p.model_id=m.id LEFT JOIN ai_monitor_details d ON d.observation_id=o.id LEFT JOIN enterprise_findings f ON f.id=d.finding_id LEFT JOIN enterprise_incidents i ON i.id=d.incident_id WHERE ${scope} ORDER BY o.recorded_at DESC,o.id`).bind(actor.role, actor.email, actor.email), db.prepare("SELECT * FROM ai_shadow_register WHERE ?='Admin' OR discovered_by=? ORDER BY discovered_at DESC,id").bind(actor.role, actor.email), db.prepare("SELECT printf('AIS-%03d',max(n)+1) code FROM (SELECT COALESCE(MAX(CAST(substr(code,5) AS INTEGER)),0) n FROM simple_grc_record_codes WHERE code GLOB 'AIS-[0-9]*' UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='AI Yönetişimi')")]);
  const systems = models.results.map(map),
    byId = new Map(systems.map(s => [s.id, s]));
  for (const row of metrics.results) {
    const m = byId.get(String(row.model_id));
    if (!m) continue;
    m.metrics.push(row as unknown as Observation);
    if (row.health !== 'healthy' && !row.acknowledged_at || row.finding_id && !['closed', 'accepted', 'cancelled'].includes(String(row.finding_status)) || row.incident_id && !['closed', 'cancelled'].includes(String(row.incident_status))) m.openIssue = true;
  }
  return {
    systems,
    shadow: shadow.results as unknown as Shadow[],
    asOf: new Date().toISOString(),
    nextCode: String(next.results[0].code)
  };
}
export async function people(env: GovernanceEnv, actor: Actor, p: Profile) {
  return prepareWorkflowSelection(env, actor, {
    assignmentMode: 'directory',
    owner: p.owner,
    technical: p.technical,
    reviewer: p.reviewer
  }, {
    owner: 'writer',
    technical: 'writer',
    reviewer: 'reviewer'
  }, false, [p.owner, p.technical]);
}
async function references(db: D1Database, p: Profile) {
  await ensureCoreGrcSchemaCompatibility(db);
  const refs = Object.entries({
    asset: 'Varlık Envanteri',
    vendor: 'Tedarikçiler',
    risks: 'Risk Assessment',
    controls: 'Kontroller'
  }).flatMap(([key, module]) => p[key as 'asset' | 'vendor' | 'risks' | 'controls'].map(link => ({
    module,
    link
  })));
  const pairs = JSON.stringify(refs.map(r => [r.link.id, r.module]));
  const rows = (await db.prepare("SELECT r.id,r.module,r.data_json,c.code FROM simple_grc_records r JOIN json_each(?) j ON r.id=j.value->>0 AND r.module=j.value->>1 LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id").bind(pairs).all<{
    id: string;
    module: string;
    data_json: string;
    code: string;
  }>()).results;
  if (rows.length !== refs.length) throw new DeskError('reference');
  for (const {
    link
  } of refs) {
    const r = rows.find(x => x.id === link.id)!;
    const d = JSON.parse(r.data_json);
    link.label = [r.code || r.id, d.title || d.controlTitle || d.vendor || d.assetName || d.riskTitle].filter(Boolean).join(' · ');
  }
  return {
    sql: "NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM simple_grc_records r WHERE r.id=j.value->>0 AND r.module=j.value->>1))",
    values: [pairs]
  };
}
export async function register(env: GovernanceEnv, actor: Actor, b: Body, intake?:{id:string;guard:{sql:string;values:unknown[]};tail:D1PreparedStatement[]}) {
  const db = env.DB,
    p = parseProfile((b.profile || {}) as Partial<Profile>),
    id = intake?.id || (b.id ? String(b.id) : 'AIM-' + crypto.randomUUID());
  const existing = b.id ? await getModel(db, id, actor) : null;
  if (actor.role !== 'Admin' && (!existing ? actor.email !== p.owner : actor.email !== existing.owner)) throw new DeskError('denied', 403);
  if (existing && (existing.revision !== b.revision || !['draft', 'assessment', 'suspended'].includes(existing.phase) && !(existing.phase === 'production' && !existing.profile))) throw new DeskError('stage', 409);
  if (existing && p.risk!==governingRisk(p.risk,existing.nativeRisk)) throw new DeskError('classification');
  const now = existing ? nextLifecycleStamp(existing.revision) : new Date().toISOString(),
    selection = await people(env, actor, p),
    links = await references(db, p);
  const shadow = typeof b.shadowId === 'string' && b.shadowId ? b.shadowId : null;
  if (shadow && (actor.role !== 'Admin' || existing)) throw new DeskError('denied', 403);
  const guard = joinWorkflowGuards(selection.guard, links, intake?.guard, shadow ? {
    sql: "EXISTS(SELECT 1 FROM ai_shadow_register WHERE id=? AND status='unreviewed')",
    values: [shadow]
  } : undefined);
  const score = {
      impact: +p.impact,
      likelihood: +p.likelihood,
      dataSensitivity: +p.sensitivity,
      autonomyRisk: +p.autonomy,
      controlMaturity: +p.maturity
    },
    risk = calculateAiModelRisk(score);
  const row = {
    system_name: p.name,
    model_name: p.model,
    vendor: p.vendor[0]?.label || p.provider,
    purpose: p.purpose,
    owner: p.owner,
    deployment: p.deployment === 'private' ? 'Private Cloud' : p.deployment === 'saas' ? 'External SaaS' : 'Cloud API',
    data_classification: p.pii || p.sources.includes('sensitive') ? 'Confidential' : p.sources.includes('public') ? 'Public' : 'Internal',
    autonomy: p.architecture === 'agent' ? p.write ? 'Autonomous' : 'Human-reviewed' : 'Advisory',
    impact: score.impact,
    likelihood: score.likelihood,
    data_sensitivity: score.dataSensitivity,
    autonomy_risk: score.autonomyRisk,
    control_maturity: score.controlMaturity,
    inherent_score: risk.inherentScore,
    residual_score: risk.residualScore,
    risk_tier: risk.riskTier,
    controls: p.controlNotes,
    review_date: p.reviewDate,
    updated_at: now,
    updated_by: actor.email
  };
  if (row.autonomy === 'Autonomous' && risk.riskTier === 'Critical') throw new DeskError('autonomy');
  const fresh = {
    id,
    ...row,
    status: 'draft',
    created_at: now,
    created_by: actor.email,
    region: '',
    affected_users: 0
  };
  const patch = {
    ...row,
    status: existing?.phase === 'production' ? 'suspended' : 'draft',
    approved_by: null,
    approved_at: null
  };
  const claim = existing ? db.prepare(`UPDATE ai_model_inventory SET ${Object.keys(patch).map(k => k + '=?').join(',')} WHERE id=? AND COALESCE((SELECT updated_at FROM ai_system_profiles WHERE model_id=?),updated_at)=? AND ${guard.sql}`).bind(...Object.values(patch), id, id, existing.revision, ...guard.values) : db.prepare(`INSERT INTO ai_model_inventory(${Object.keys(fresh).join(',')}) SELECT ${Object.keys(fresh).map(() => '?').join(',')} WHERE ${guard.sql}`).bind(...Object.values(fresh), ...guard.values);
  const intakePhase = existing?.phase === 'production' ? 'suspended' : shadow || existing?.phase === 'assessment' ? 'assessment' : 'draft';
  const profile = db.prepare(`INSERT INTO ai_system_profiles(model_id,profile_json,phase,updated_at) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT(model_id) DO UPDATE SET profile_json=excluded.profile_json,phase=excluded.phase,assessment_json='{}',evidence_json=NULL,submitted_by=NULL,decided_by=NULL,decision_note=NULL,updated_at=excluded.updated_at`).bind(id, JSON.stringify(p), intakePhase, now);
  await commitLifecycle(db, claim, [profile, ...(shadow ? [db.prepare("UPDATE ai_shadow_register SET status='admitted',model_id=?,decided_by=?,decided_at=?,decision_note=? WHERE id=? AND changes()=1").bind(id, actor.email, now, p.purpose, shadow)] : []), receipt(db, id, actor.email, shadow ? 'shadow-admitted' : 'system-register', p.name, now),...(intake?.tail||[])]);
  return {
    id
  };
}
async function report(env: GovernanceEnv, actor: Actor, selection: {
  evidenceId: string;
  versionId: string;
} | null) {
  if (!selection) return {
    pin: null,
    guard: {
      sql: '1',
      values: []
    }
  };
  const prepared = await prepareWorkflowSelection(env, actor, {
    evidenceMode: 'library',
    evidenceSelection: selection
  }, {}, true);
  const e = prepared.evidence!;
  const row = await env.DB.prepare("SELECT r.data_json,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.id=?").bind(e.evidenceId).first<{
    data_json: string;
    code: string;
  }>();
  const anchor = row ? JSON.parse(row.data_json) : null;
  if (!row || !anchor || !evaluateEvidenceEligibility(anchor).current || Number(anchor.versionNo) !== e.versionNo) throw new DeskError('evidence');
  return {
    pin: {
      ...e,
      code: row.code || e.evidenceId
    },
    guard: prepared.guard
  };
}
export async function assess(env: GovernanceEnv, actor: Actor, b: Body, m: SystemRow) {
  const p = m.profile;
  if (!p) throw new DeskError('legacy', 409);
  const db = env.DB,
    action = String(b.action),
    decision = ['approve', 'conditional', 'return'].includes(action),
    now = nextLifecycleStamp(m.revision);
  if (['submit', 'approve', 'conditional'].includes(action) && p.risk!==governingRisk(p.risk,m.nativeRisk)) throw new DeskError('classification');
  if (decision && (actor.role !== 'Admin' || actor.email !== p.reviewer || actor.email === m.submittedBy || [p.owner, p.technical].includes(actor.email))) throw new DeskError('sod', 403);
  if (!decision && (actor.email === p.reviewer || ![p.owner, p.technical].includes(actor.email) && actor.role !== 'Admin')) throw new DeskError('sod', 403);
  if (decision ? m.phase !== 'review' : !['draft', 'assessment', 'suspended'].includes(m.phase) && !(action === 'submit' && ['production', 'conditional'].includes(m.phase))) throw new DeskError('stage', 409);
  const reviewDate = decision ? p.reviewDate : b.reviewDate === undefined ? p.reviewDate : String(b.reviewDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || !Number.isFinite(Date.parse(reviewDate)) || new Date(reviewDate).toISOString().slice(0, 10) !== reviewDate || ['submit', 'approve', 'conditional'].includes(action) && reviewDate <= now.slice(0, 10)) throw new DeskError('reviewDate');
  const reviewedProfile = {
    ...p,
    reviewDate
  };
  const a = decision ? m.assessment : parseAssessment((b.assessment || {}) as Partial<typeof blankAssessment>);
  const picked = decision ? m.pin ? {
    evidenceId: m.pin.evidenceId,
    versionId: m.pin.id
  } : null : b.evidenceSelection as {
    evidenceId: string;
    versionId: string;
  } | null;
  const {
    pin,
    guard
  } = action === 'return' ? {
    pin: m.pin,
    guard: {
      sql: '1',
      values: []
    }
  } : await report(env, actor, picked);
  if (action !== 'save' && action !== 'return') {
    const problems = blockers(p, a, pin as Pin | null);
    if (problems.length) throw new DeskError(problems[0]);
  }
  const note = text(b.note),
    sign = action === 'approve' || action === 'conditional';
  if (decision && note.length < (action === 'conditional' ? 15 : 5)) throw new DeskError('condition');
  if (sign && +p.maturity < 4 && calculateAiModelRisk({
    impact: +p.impact,
    likelihood: +p.likelihood,
    dataSensitivity: +p.sensitivity,
    autonomyRisk: +p.autonomy,
    controlMaturity: +p.maturity
  }).riskTier === 'Critical') throw new DeskError('maturity');
  const roles = await people(env, actor, p),
    fullGuard = joinWorkflowGuards(guard, roles.guard);
  const phase = action === 'approve' ? 'production' : action === 'conditional' ? 'conditional' : action === 'submit' ? 'review' : action === 'save' && m.phase === 'assessment' ? 'assessment' : 'draft';
  const write = db.prepare(`UPDATE ai_system_profiles SET profile_json=?,assessment_json=?,evidence_json=?,phase=?,submitted_by=?,decided_by=?,decision_note=?,updated_at=? WHERE model_id=? AND updated_at=? AND ${fullGuard.sql}`).bind(JSON.stringify(reviewedProfile), JSON.stringify(a), pin ? JSON.stringify(pin) : null, phase, decision ? m.submittedBy : action === 'submit' ? actor.email : null, sign ? actor.email : null, decision ? note : null, now, m.id, m.revision, ...fullGuard.values);
  const model = db.prepare("UPDATE ai_model_inventory SET status=?,approved_by=?,approved_at=?,decision_note=?,updated_by=?,updated_at=?,review_date=? WHERE id=? AND changes()=1").bind(sign ? 'approved' : 'draft', sign ? actor.email : null, sign ? now : null, note, actor.email, now, reviewDate, m.id);
  const history = lifecycleInsert(db, 'ai_system_decisions', {
    id: crypto.randomUUID(),
    model_id: m.id,
    action,
    actor: actor.email,
    at: now,
    snapshot_json: JSON.stringify({
      profile: reviewedProfile,
      assessment: a,
      pin,
      phase,
      submitter: decision ? m.submittedBy : actor.email,
      note
    })
  });
  await commitLifecycle(db, write, [model, history, receipt(db, m.id, actor.email, 'system-' + action, note || p.name, now)]);
  return {
    id: m.id
  };
}
export async function changeShadow(db: D1Database, actor: Actor, b: Body) {
  const now = new Date().toISOString(),
    id = b.action === 'ban' ? String(b.id) : 'SHA-' + crypto.randomUUID(),
    note = text(b.note),
    name = text(b.name, 180);
  if (note.length < 10 || !name && b.action !== 'ban') throw new DeskError('fields');
  if (b.action === 'ban' && actor.role !== 'Admin') throw new DeskError('denied', 403);
  const write = b.action === 'ban' ? db.prepare("UPDATE ai_shadow_register SET status='banned',decision_note=?,decided_by=?,decided_at=? WHERE id=? AND status='unreviewed'").bind(note, actor.email, now, id) : db.prepare("INSERT INTO ai_shadow_register(id,name,context,discovered_by,discovered_at) VALUES(?,?,?,?,?)").bind(id, name, note, actor.email, now);
  await commitLifecycle(db, write, [receipt(db, id, actor.email, 'shadow-' + b.action, note, now)]);
  return {
    id
  };
}
