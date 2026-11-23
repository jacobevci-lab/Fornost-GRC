import type { Actor } from '../api/auth/security';
import { ensureIncidentTables } from '../incidents/tables';
import { ensureFindingsSchemaCompatibility } from '../api/findings/schema-compat';
import { addDays, findingSlaDays, validateFinding } from '../findings/domain';
import { insertFinding } from '../findings/intake-store';
import { validateIncident } from '../incidents/domain';
import { commitLifecycle, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { prepareWorkflowSelection, joinWorkflowGuards } from '../workflow-selection-store';
import { DeskError, type SystemRow, type Observation } from './governance-domain';
import { validateAiMonitoring } from './lifecycle';
import { receipt, text, type GovernanceEnv, type Body } from './governance-store';
function modelGuard(m: SystemRow) {
  return {
    sql: 'EXISTS(SELECT 1 FROM ai_model_inventory m LEFT JOIN ai_system_profiles p ON p.model_id=m.id WHERE m.id=? AND COALESCE(p.updated_at,m.updated_at)=?)',
    values: [m.id, m.revision]
  };
}
export function observationInput(b: Body, id: string) {
  for (const key of ['accuracy', 'errorRate', 'driftScore', 'biasScore', 'p95LatencyMs', 'sampleSize', 'hallucination', 'leakage']) {
    if (typeof b[key] !== 'number' || !Number.isFinite(b[key]) || Number(b[key]) < 0) throw new DeskError('metric');
  }
  if (Number(b.hallucination) > 100 || !Number.isInteger(b.leakage) || !Number.isInteger(b.sampleSize) || Number(b.leakage) > Number(b.sampleSize) || text(b.note).length < 20) throw new DeskError('metric');
  let v;
  try {
    v = validateAiMonitoring({
      ...b,
      modelId: id
    });
  } catch {
    throw new DeskError('metric');
  }
  const alerts = [...v.alerts, ...(Number(b.hallucination) > 5 ? ['hallucination'] : []), ...(Number(b.leakage) > 0 ? ['data-leakage'] : [])];
  return {
    ...v,
    alerts,
    health: Number(b.leakage) > 0 || v.driftScore > 40 || alerts.length >= 2 ? 'critical' : alerts.length ? 'attention' : 'healthy'
  };
}
export async function monitor(env: GovernanceEnv, actor: Actor, b: Body, m: SystemRow) {
  const db = env.DB,
    now = new Date().toISOString(),
    guard = modelGuard(m);
  if (b.action === 'monitor') {
    if (!['production', 'conditional'].includes(m.phase)) throw new DeskError('stage', 409);
    const v = observationInput(b, m.id),
      id = 'AIMON-' + crypto.randomUUID();
    const claim = db.prepare(`INSERT INTO ai_model_monitoring(id,model_id,accuracy,error_rate,drift_score,bias_score,p95_latency_ms,sample_size,health,alerts_json,note,recorded_by,recorded_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM ai_model_inventory WHERE id=? AND status='approved')`).bind(id, m.id, v.accuracy, v.errorRate, v.driftScore, v.biasScore, v.p95LatencyMs, v.sampleSize, v.health, JSON.stringify(v.alerts), v.note, actor.email, now, ...guard.values, m.id);
    await commitLifecycle(db, claim, [lifecycleInsert(db, 'ai_monitor_details', {
      observation_id: id,
      hallucination: Number(b.hallucination),
      leakage: Number(b.leakage)
    }), receipt(db, m.id, actor.email, 'monitor', v.note, now)]);
    return {
      id
    };
  }
  const o = await db.prepare('SELECT o.*,d.incident_id,d.finding_id,d.leakage FROM ai_model_monitoring o LEFT JOIN ai_monitor_details d ON d.observation_id=o.id WHERE o.model_id=? AND o.id=?').bind(m.id, String(b.observation || '')).first<Observation>();
  if (!o || o.health === 'healthy') throw new DeskError('stage', 409);
  if (b.action === 'suspend') {
    const stamp = nextLifecycleStamp(m.revision);
    await commitLifecycle(db, db.prepare(`UPDATE ai_model_inventory SET status='suspended',approved_by=NULL,approved_at=NULL,decision_note=?,updated_at=?,updated_by=? WHERE id=? AND status='approved' AND ${guard.sql}`).bind(o.note, stamp, actor.email, m.id, ...guard.values), [receipt(db, m.id, actor.email, 'monitor-suspend', o.id, stamp)]);
    return {
      id: m.id
    };
  }
  const incident = b.action === 'incident',
    column = incident ? 'incident_id' : 'finding_id',
    prior = o[column];
  if (prior) return {
    id: prior
  };
  const p = m.profile;
  if (!p) throw new DeskError('legacy', 409);
  const id = (incident ? 'INC-' : 'FND-') + crypto.randomUUID(),
    severity = o.health === 'critical' ? 'critical' : 'high';
  const note = m.code + ' · ' + m.name + ' · ' + o.recorded_at + ' · ' + o.note;
  const isTr = b.lang !== 'en',
    t = (a: string, en: string) => isTr ? a : en;
  const title = m.code + ' · ' + t('İzleme eşiği aşıldı', 'Monitoring threshold exceeded');
  const eligible = {
    sql: `NOT EXISTS(SELECT 1 FROM ai_monitor_details WHERE observation_id=? AND ${column} IS NOT NULL)`,
    values: [o.id]
  };
  const link = db.prepare(`INSERT INTO ai_monitor_details(observation_id,${column},acknowledged_at) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(observation_id) DO UPDATE SET ${column}=excluded.${column},acknowledged_at=excluded.acknowledged_at`).bind(o.id, id, now);
  const log = receipt(db, m.id, actor.email, incident ? 'monitor-incident' : 'monitor-capa', o.id + ' / ' + id, now);
  if (!incident) {
    await ensureFindingsSchemaCompatibility(db);
    const reviewer = String(b.reviewer || p.reviewer);
    const directory = await prepareWorkflowSelection(env, actor, {
      assignmentMode: 'directory',
      owner: p.technical,
      reviewer
    }, {
      owner: 'writer',
      reviewer: 'reviewer'
    }, false, [actor.email, p.technical]);
    const finding = validateFinding({
      sourceType: 'ai',
      sourceRef: m.id,
      sourceTitle: m.name,
      findingType: 'control-deficiency',
      severity,
      title,
      description: note,
      owner: p.technical,
      reviewer,
      rootCause: t('Kök neden incelemesi bekleniyor.', 'Root cause investigation pending.'),
      correctiveAction: t('Sapmayı inceleyin, etkiyi sınırlayın ve düzeltmeyi test edin.', 'Investigate the deviation, contain impact and test the correction.'),
      preventiveAction: t('Tekrarı önleyecek kontrolü belgeleyin ve bağımsız olarak doğrulayın.', 'Document and independently verify a control to prevent recurrence.'),
      dueDate: addDays(now.slice(0, 10), findingSlaDays(severity)),
      riskRef: p.risks[0]?.id,
      controlRef: p.controls[0]?.id
    });
    await insertFinding(db, finding, {
      id,
      code: id,
      actor: actor.email,
      stamp: now,
      guard: joinWorkflowGuards(guard, eligible, directory.guard),
      selectedIds: true,
      afterCreate: [link, log]
    });
  } else {
    await ensureIncidentTables(db);
    const commander = String(b.commander || p.technical),
      reviewer = String(b.reviewer || p.reviewer),
      asset = String(b.asset || p.asset[0]?.id || '');
    if (!asset || new Set([p.owner, commander, reviewer]).size !== 3 || reviewer === actor.email) throw new DeskError('incidentRoles', 422);
    const directory = await prepareWorkflowSelection(env, actor, {
      assignmentMode: 'directory',
      owner: p.owner,
      commander,
      reviewer
    }, {
      owner: 'writer',
      commander: 'writer',
      reviewer: 'reviewer'
    }, false, [p.owner, commander, actor.email]);
    const risk = p.risks[0]?.id || null;
    const x = validateIncident({
      title,
      category: o.leakage ? 'data-breach' : 'other',
      severity,
      detectedDate: o.recorded_at.slice(0, 10),
      description: note,
      businessImpact: m.purpose + ' · ' + o.note,
      owner: p.owner,
      commander,
      reviewer,
      assetRefs: asset,
      riskRef: risk,
      dataClassification: p.pii ? 'Restricted' : 'Internal',
      personalData: !!(o.leakage && p.pii)
    });
    const check = joinWorkflowGuards(guard, eligible, directory.guard, {
      sql: "EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Varlık Envanteri') AND (? IS NULL OR EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Risk Assessment'))",
      values: [asset, risk, risk]
    });
    const claim = db.prepare(`INSERT INTO enterprise_incidents(id,code,title,category,severity,detected_date,description,business_impact,owner,commander,reviewer,asset_refs,risk_ref,data_classification,personal_data,declared_by,declared_at,updated_by,updated_at)
  SELECT ?,printf('INC-%03d',1+COALESCE((SELECT MAX(CAST(substr(code,5) AS INTEGER)) FROM enterprise_incidents WHERE code=printf('INC-%03d',CAST(substr(code,5) AS INTEGER))),0)),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${check.sql}`).bind(id, x.title, x.category, severity, x.detectedDate, x.description, x.businessImpact, x.owner, x.commander, x.reviewer, asset, risk, x.dataClassification, +x.personalData, actor.email, now, actor.email, now, ...check.values);
    await commitLifecycle(db, claim, [lifecycleInsert(db, 'enterprise_incident_events', {
      id: crypto.randomUUID(),
      incident_id: id,
      action: 'incident-declare',
      to_status: 'declared',
      detail: note,
      actor: actor.email,
      created_at: now
    }), lifecycleInsert(db, 'incident_crisis_context', {
      incident_id: id,
      detected_at: o.recorded_at,
      vendor_ref: p.vendor[0]?.id || null
    }), link, log]);
  }
  return {
    id
  };
}
