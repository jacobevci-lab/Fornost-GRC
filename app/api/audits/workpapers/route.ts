import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { canReadModule, canWriteModule } from '../../../module-access';
import { AuditRequestError } from '../../../audit-requests';
import { isAuditClosedError } from '../../../audit-closure';
import { auditRequestId, auditRequestPeople, readRequestEvidence } from '../../../audit-request-store';
import { readWorkpapers, mutateWorkpaper } from '../../../audit-workpaper-store';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
const error = (err: unknown) => isAuditClosedError(err) ? json({ error: 'audit-closed' }, 409) : err instanceof AuditRequestError ? json({ error: err.code }, err.status) : json({ error: 'unavailable' }, 503);
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor', 'Viewer']); if (auth.response) return auth.response;
  try {
    if (!canReadModule(auth.actor, 'Denetim Yönetimi') || !canReadModule(auth.actor, 'Kanıtlar')) throw new AuditRequestError('forbidden', 403);
    const auditId = auditRequestId(req.nextUrl.searchParams.get('auditId'));
    const { env } = await import('cloudflare:workers');
    const state = await readWorkpapers(env.DB, auditId), people = await auditRequestPeople(env.DB), evidence = await readRequestEvidence(env.DB);
    const id = req.nextUrl.searchParams.get('id');
    const history = id ? await env.DB.prepare('SELECT id,actor,action,note,snapshot_json,created_at FROM audit_workpaper_events WHERE audit_id=? AND workpaper_id=? ORDER BY created_at DESC,rowid DESC LIMIT 101').bind(auditId, auditRequestId(id)).all() : null;
    return json({ ...state, actorEmail: auth.actor.email.toLowerCase(), admin: auth.actor.role === 'Admin', canManage: canWriteModule(auth.actor, 'Denetim Yönetimi'), people: people.people, peopleComplete: people.complete, evidenceChoices: evidence.slice(0, 500), evidenceChoicesComplete: evidence.length <= 500, history: history?.results.slice(0, 100) || [], historyComplete: !history || history.results.length <= 100 });
  } catch (err) { return error(err); }
}
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor']); if (auth.response) return auth.response;
  try {
    const raw = await req.text(); if (raw.length > 300_000) return json({ error: 'fields' }, 413);
    let body; try { body = JSON.parse(raw); } catch { throw new AuditRequestError('fields'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuditRequestError('fields');
    const { env } = await import('cloudflare:workers'); return json({ ok: true, ...await mutateWorkpaper(env.DB, auth.actor, body) });
  } catch (err) { return error(err); }
}
