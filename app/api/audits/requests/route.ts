import { readMilestoneWork } from '../../../audit-milestone-store';
import { isAuditClosedError } from '../../../audit-closure';
import { readWorkpaperWork } from '../../../audit-workpaper-store';
import { readPendingAuditClosures } from '../../../audit-closure-store';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { canReadModule, canWriteModule } from '../../../module-access';
import { AuditRequestError } from '../../../audit-requests';
import { auditRequestId, auditRequestPeople, mutateAuditRequest, readAuditRequestWork, readAuditRequestWorkflow, readRequestEvidence } from '../../../audit-request-store';
import { readAuditReminderProfile, saveAuditReminderProfile } from '../../../audit-reminder-store';
import { syncAuditRequestNotifications } from '../../../audit-request-notifications';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
const error = (err: unknown) => isAuditClosedError(err) ? json({error:'audit-closed'},409) : err instanceof AuditRequestError ? json({ error: err.code }, err.status) : json({ error: 'unavailable' }, 503);
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor', 'Viewer']); if (auth.response) return auth.response;
  try {
    const { env } = await import('cloudflare:workers');
    if (!canReadModule(auth.actor, 'Denetim Yönetimi')) throw new AuditRequestError('forbidden', 403);
    const id = req.nextUrl.searchParams.get('auditId'), evidenceAccess = canReadModule(auth.actor, 'Kanıtlar');
    if (!id) {
      const work = await readAuditRequestWork(env.DB);
      const closureWork = await readPendingAuditClosures(env.DB, auth.actor);
      const paperWork = await readWorkpaperWork(env.DB, auth.actor);
      const milestoneWork = await readMilestoneWork(env.DB, auth.actor);
      return json({ ...work, milestones:milestoneWork.milestones, workpapers: paperWork.workpapers, closures: closureWork.closures, complete: work.complete && closureWork.complete && paperWork.complete && milestoneWork.complete, requests: work.requests.map(row => ({ ...row, evidence: [] })) });
    }
    const auditId = auditRequestId(id), state = await readAuditRequestWorkflow(env.DB, auditId);
    const plan = await env.DB.prepare('SELECT value FROM simple_grc_metadata WHERE key=?').bind(`audit_plan_${auditId}`).first<{ value: string }>();
    const planData = plan ? JSON.parse(plan.value) : { revision: '', plan: {} };
    const users = await auditRequestPeople(env.DB);
    const evidence = evidenceAccess ? await readRequestEvidence(env.DB) : [];
    const events = await env.DB.prepare('SELECT id,request_id,action,actor,created_at,snapshot_json FROM audit_request_events WHERE audit_id=? ORDER BY created_at DESC,id DESC LIMIT 201').bind(auditId).all<{ id: string; request_id: string; action: string; actor: string; created_at: string; snapshot_json: string }>();
    return json({ ...state, reminderProfile: await readAuditReminderProfile(env.DB, auditId), requests: state.requests.map(row => evidenceAccess ? row : { ...row, evidence: [] }),
      actorEmail: auth.actor.email.toLowerCase(), canManage: canWriteModule(auth.actor, 'Denetim Yönetimi'), evidenceAccess,
      ...users, peopleComplete: users.complete, complete: state.complete, evidenceChoices: evidence.slice(0, 500), evidenceChoicesComplete: evidence.length <= 500,
      planRevision: planData.revision, periodStart: planData.plan.periodStart || '', periodEnd: planData.plan.periodEnd || '',
      events: events.results.slice(0, 200).map(({ snapshot_json, ...event }) => { const snapshot = JSON.parse(snapshot_json); return { ...event, note: snapshot.note || '', activationReason: snapshot.activationReason || '', planRevision: snapshot.planRevision || '', status: snapshot.status, versionIds: evidenceAccess ? (snapshot.evidence || []).map((v: { id: string }) => v.id) : [] }; }), eventsComplete: events.results.length <= 200,
    });
  } catch (err) { return error(err); }
}
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor']); if (auth.response) return auth.response;
  try {
    const raw = await req.text(); if (raw.length > 128000) return json({ error: 'fields' }, 413);
    let body; try { body = JSON.parse(raw); } catch { throw new AuditRequestError('fields'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuditRequestError('fields');
    const { env } = await import('cloudflare:workers');
    if (body.action === 'reminder-profile') await saveAuditReminderProfile(env.DB, auth.actor, body);
    else await mutateAuditRequest(env.DB, auth.actor, body);
    let remindersPending = false;
    try { await syncAuditRequestNotifications(env.DB, new Date(), body.auditId); } catch { remindersPending = true; }
    return json({ ok: true, remindersPending });
  } catch (err) { return error(err); }
}
