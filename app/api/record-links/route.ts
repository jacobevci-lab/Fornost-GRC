import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../auth/security';
import { resolveRecordLink } from '../../record-link-store';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor', 'Viewer']); if (auth.response) return auth.response;
  try {
    const params = req.nextUrl.searchParams;
    if ([...params.keys()].some(key => !['module','kind','ref','auditId'].includes(key) || params.getAll(key).length !== 1)) return json({error:'unavailable'},404);
    const { env } = await import('cloudflare:workers');
    const target = await resolveRecordLink(env.DB, auth.actor, Object.fromEntries(params));
    return target ? json({target}) : json({error:'unavailable'},404);
  } catch { return json({error:'retry'},503); }
}
