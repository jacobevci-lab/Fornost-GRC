import { canReadModule, canWriteModule, type AccessSubject } from './module-access';
import { changeConnectionData } from './connected-grc-workbench-model';
import { validate } from './core-record-validation';
import { nextLifecycleStamp, lifecycleInsert } from './enterprise-lifecycle-write';
import { coreReferenceGuard, newCoreReferences } from './core-reference-write';

export const connectedLinkHistorySchema = `CREATE TABLE IF NOT EXISTS connected_grc_link_events(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,source_module TEXT NOT NULL,target_id TEXT NOT NULL,field TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,created_at TEXT NOT NULL)`;
export class ConnectionWriteError extends Error { constructor(public code: string, public status = 400) { super(code); } }
type Actor = AccessSubject & { email: string };
type Core = { id: string; module: string; data_json: string; updated_at: string };

export async function writeConnectedLink(db: D1Database, actor: Actor, input: Record<string, unknown>) {
  const { sourceId, targetId, field, action, expectedUpdatedAt, note } = input;
  if (!['Admin', 'Editor'].includes(actor.role)) throw new ConnectionWriteError('forbidden', 403);
  if (![sourceId, targetId, field, expectedUpdatedAt].every(x => typeof x === 'string' && x.length > 0 && x.length <= 160) || !['link', 'unlink'].includes(String(action)) || typeof note !== 'string' || note.trim().length < 3 || note.length > 1000) throw new ConnectionWriteError('invalid');
  if (input.kind === 'continuity-plan') return linkDraftPlan(db, actor, input);
  if (input.kind !== undefined && input.kind !== 'core') throw new ConnectionWriteError('invalid');
  const source = await db.prepare('SELECT id,module,data_json,updated_at FROM simple_grc_records WHERE id=?').bind(sourceId).first<Core>();
  const target = await db.prepare('SELECT id,module,data_json,updated_at FROM simple_grc_records WHERE id=?').bind(targetId).first<Core>();
  if (!source || !target || !canReadModule(actor, source.module) || !canReadModule(actor, target.module)) throw new ConnectionWriteError('unavailable', 404);
  if (!canWriteModule(actor, source.module)) throw new ConnectionWriteError('forbidden', 403);
  if (source.updated_at !== expectedUpdatedAt) throw new ConnectionWriteError('changed', 409);
  const code = await db.prepare('SELECT code FROM simple_grc_record_codes WHERE record_id=?').bind(targetId).first<{ code: string }>();
  const before = JSON.parse(source.data_json);
  // Evidence stores a primary reference as well as its complete list.
  const normalized = source.module === 'Kanıtlar' && (!Array.isArray(before.controlRefs) || !before.controlRefs.length) ? { ...before, controlRefs: before.controlRef ? [before.controlRef] : [] } : before;
  let data;
  try { data = changeConnectionData({ ...source, data: normalized }, String(field), { ...target, code: code?.code, data: JSON.parse(target.data_json) }, action as 'link' | 'unlink'); }
  catch (error) { throw new ConnectionWriteError(error instanceof Error ? error.message : 'invalid'); }
  if (JSON.stringify(data) === JSON.stringify(normalized)) throw new ConnectionWriteError('unchanged');
  const checked = validate(source.module, data);
  if ('error' in checked) throw new ConnectionWriteError('validation');
  if (JSON.stringify(checked.data[String(field)]) !== JSON.stringify(data[String(field)])) throw new ConnectionWriteError('validation');
  const stamp = nextLifecycleStamp(source.updated_at), guard = coreReferenceGuard(newCoreReferences(source.id, source.module, checked.data, before));
  const eventId = crypto.randomUUID();
  const claim = db.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module=? AND updated_at=? AND data_json=? AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module=?) AND ${guard.sql}`)
    .bind(JSON.stringify(checked.data), stamp, source.id, source.module, source.updated_at, source.data_json, target.id, target.module, ...guard.values);
  const result = await db.batch([claim, lifecycleInsert(db, 'connected_grc_link_events', { id: eventId, source_id: source.id, source_module: source.module, target_id: target.id, field: String(field), action: String(action), actor: actor.email, note: note.trim(), before_value: JSON.stringify(before[String(field)] ?? null), after_value: JSON.stringify(checked.data[String(field)] ?? null), created_at: stamp })]);
  // The event receipt excludes trigger writes and proves the guarded mutation occurred.
  if (Number(result[1]?.meta?.changes || 0) !== 1) throw new ConnectionWriteError('changed', 409);
  return { ok: true, updatedAt: stamp, eventId };
}

async function linkDraftPlan(db: D1Database, actor: Actor, input: Record<string, unknown>) {
  if (input.action !== 'link' || input.field !== 'continuityBiaRef') throw new ConnectionWriteError('unsupported');
  const plan = await db.prepare('SELECT * FROM enterprise_continuity_plans WHERE id=?').bind(input.sourceId).first<Record<string, string | number | null>>();
  const bia = await db.prepare("SELECT id FROM simple_grc_records WHERE id=? AND module='BIA'").bind(input.targetId).first<{ id: string }>();
  if (!plan || !bia || !canReadModule(actor, 'BIA')) throw new ConnectionWriteError('unavailable', 404);
  if (actor.role !== 'Admin' && plan.owner !== actor.email) throw new ConnectionWriteError('forbidden', 403);
  if (plan.status !== 'draft' || plan.updated_at !== input.expectedUpdatedAt) throw new ConnectionWriteError('changed', 409);
  if (plan.bia_ref === bia.id) throw new ConnectionWriteError('unchanged');
  const stamp = nextLifecycleStamp(plan.updated_at), eventId = crypto.randomUUID();
  const result = await db.batch([
    db.prepare("UPDATE enterprise_continuity_plans SET bia_ref=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND status='draft' AND updated_at=? AND owner=? AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='BIA')").bind(bia.id, actor.email, stamp, plan.id, plan.updated_at, plan.owner, bia.id),
    lifecycleInsert(db, 'connected_grc_link_events', { id: eventId, source_id: String(plan.id), source_module: 'İş Sürekliliği', target_id: bia.id, field: 'continuityBiaRef', action: 'link', actor: actor.email, note: String(input.note).trim(), before_value: JSON.stringify(plan.bia_ref), after_value: JSON.stringify(bia.id), created_at: stamp }),
    lifecycleInsert(db, 'enterprise_continuity_events', { id: crypto.randomUUID(), entity_type: 'plan', entity_id: String(plan.id), action: 'link-bia', detail: `${plan.bia_ref} → ${bia.id}; ${String(input.note).trim()}`, actor: actor.email, created_at: stamp }),
  ]);
  if (Number(result[1]?.meta?.changes || 0) !== 1) throw new ConnectionWriteError('changed', 409);
  return { ok: true, updatedAt: stamp, eventId };
}
