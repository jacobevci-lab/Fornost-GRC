import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { loadAuditReadiness } from '../../../audit-readiness-runtime';

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
  if (access.response) return access.response;
  const auditName = (req.nextUrl.searchParams.get('auditName') || '').trim();
  if (auditName.length > 160) return NextResponse.json({ error: 'Geçersiz denetim kapsamı.' }, { status: 400 });
  const { env } = await import('cloudflare:workers');
  const result = await loadAuditReadiness(env.DB, auditName);
  return NextResponse.json(result, { headers: { 'cache-control': 'private, no-store' } });
}
