import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { AuditReportError } from '../../../audit-status-report';
import { AuditRequestError } from '../../../audit-requests';
import { auditRequestId } from '../../../audit-request-store';
import { mutateAuditClosure, readAuditClosureDetail, readAuditClosureHistory, readAuditClosurePreview } from '../../../audit-closure-store';

const headers = { 'cache-control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const failure = (error: unknown) => error instanceof AuditReportError || error instanceof AuditRequestError ? json({ error: error.code }, error.status) : json({ error: 'unavailable' }, 503);
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin']); if (auth.response) return auth.response;
  try {
    const auditId = auditRequestId(req.nextUrl.searchParams.get('auditId'));
    const { env } = await import('cloudflare:workers');
    const eventId = req.nextUrl.searchParams.get('eventId');
    if (eventId) {
      const detail = await readAuditClosureDetail(env.DB, auth.actor, auditId, auditRequestId(eventId));
      if (req.nextUrl.searchParams.get('download') === '1') return new NextResponse(JSON.stringify(detail, null, 2), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${eventId}.json"`, 'x-content-type-options': 'nosniff' } });
      return json(detail);
    }
    return json(req.nextUrl.searchParams.get('preview') === '1' ? await readAuditClosurePreview(env.DB, auth.actor, auditId) : await readAuditClosureHistory(env.DB, auth.actor, auditId));
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['Admin']); if (auth.response) return auth.response;
  try {
    const raw = await req.text(); if (raw.length > 20000) return json({ error: 'fields' }, 413);
    let input; try { input = JSON.parse(raw); } catch { throw new AuditReportError('fields'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuditReportError('fields');
    const { env } = await import('cloudflare:workers');
    return json({ ok: true, ...await mutateAuditClosure(env.DB, auth.actor, input) });
  } catch (error) { return failure(error); }
}
