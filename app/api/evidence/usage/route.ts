import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { EvidenceUsageError } from '../../../evidence/usage';
import { readEvidenceUsage } from '../../../evidence/usage-store';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor', 'Viewer']); if (auth.response) return auth.response;
  try {
    const { env } = await import('cloudflare:workers');
    return json(await readEvidenceUsage(env.DB, auth.actor, req.nextUrl.searchParams.get('id') || ''));
  } catch (error) {
    return error instanceof EvidenceUsageError ? json({ error: error.code }, error.status) : json({ error: 'unavailable' }, 503);
  }
}
