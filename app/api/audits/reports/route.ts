import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { AuditReportError } from '../../../audit-status-report';
import { AuditRequestError } from '../../../audit-requests';
import { auditRequestId } from '../../../audit-request-store';
import { createAuditStatusReport, listAuditStatusReports, readAuditReportSource, readAuditStatusReport } from '../../../audit-status-report-store';

const headers = { 'cache-control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const failure = (error: unknown) => error instanceof AuditReportError || error instanceof AuditRequestError ? json({ error: error.code }, error.status) : json({ error: 'unavailable' }, 503);
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin']); if (auth.response) return auth.response;
  try {
    const auditId = auditRequestId(req.nextUrl.searchParams.get('auditId'));
    const { env } = await import('cloudflare:workers');
    const reportId = req.nextUrl.searchParams.get('reportId');
    if (reportId) {
      const detail = await readAuditStatusReport(env.DB, auth.actor, auditId, auditRequestId(reportId));
      if (req.nextUrl.searchParams.get('download') === '1') {
        if (detail.integrity !== 'verified') throw new AuditReportError('integrity', 409);
        return new NextResponse(JSON.stringify(detail, null, 2), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${reportId}.json"`, 'x-content-type-options': 'nosniff' } });
      }
      return json(detail);
    }
    return json(req.nextUrl.searchParams.get('preview') === '1' ? await readAuditReportSource(env.DB, auth.actor, auditId) : await listAuditStatusReports(env.DB, auth.actor, auditId));
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['Admin']); if (auth.response) return auth.response;
  try {
    const raw = await req.text(); if (raw.length > 20000) return json({ error: 'fields' }, 413);
    let body; try { body = JSON.parse(raw); } catch { throw new AuditReportError('fields'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuditReportError('fields');
    const { env } = await import('cloudflare:workers');
    return json({ ok: true, ...await createAuditStatusReport(env.DB, auth.actor, body) });
  } catch (error) { return failure(error); }
}
