import { isAuditClosedError } from '../../../../audit-closure';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../../auth/security';
import { canReadModule } from '../../../../module-access';
import { AuditRequestError } from '../../../../audit-requests';
import { auditRequestId } from '../../../../audit-request-store';
import { mutateWorkplan, readWorkplanClosure, readWorkplanHistory, readWorkplanPreview } from '../../../../audit-workplan-store';

const headers = { 'cache-control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const error = (err: unknown) => isAuditClosedError(err) ? json({error:'audit-closed'},409) : err instanceof AuditRequestError ? json({ error: err.code }, err.status) : json({ error: 'unavailable' }, 503);
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor', 'Viewer']); if (auth.response) return auth.response;
  try {
    if (!canReadModule(auth.actor, 'Denetim Yönetimi')) throw new AuditRequestError('forbidden', 403);
    const auditId = auditRequestId(req.nextUrl.searchParams.get('auditId')), evidenceAccess = canReadModule(auth.actor, 'Kanıtlar');
    const { env } = await import('cloudflare:workers');
    const closure = req.nextUrl.searchParams.get('closureId');
    if (closure) {
      const closureId = auditRequestId(closure), detail = await readWorkplanClosure(env.DB, auditId, closureId, evidenceAccess);
      if (req.nextUrl.searchParams.get('download') === '1') {
        if (!evidenceAccess) throw new AuditRequestError('forbidden', 403);
        if (detail.integrity !== 'verified') throw new AuditRequestError('closure-integrity', 409);
        return new NextResponse(JSON.stringify(detail, null, 2), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${closureId}.json"`, 'x-content-type-options': 'nosniff' } });
      }
      return json(detail);
    }
    if (req.nextUrl.searchParams.get('preview') === '1') {
      if (!evidenceAccess) throw new AuditRequestError('forbidden', 403);
      const { planRaw, ...preview } = await readWorkplanPreview(env.DB, auditId); void planRaw;
      return json(preview);
    }
    return json(await readWorkplanHistory(env.DB, auditId));
  } catch (err) { return error(err); }
}
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor']); if (auth.response) return auth.response;
  try {
    const raw = await req.text(); if (raw.length > 128000) return json({ error: 'fields' }, 413);
    let body; try { body = JSON.parse(raw); } catch { throw new AuditRequestError('fields'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuditRequestError('fields');
    const { env } = await import('cloudflare:workers');
    return json({ ok: true, ...await mutateWorkplan(env.DB, auth.actor, body) });
  } catch (err) { return error(err); }
}
