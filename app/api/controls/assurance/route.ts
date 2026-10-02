import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { loadControlAssuranceSnapshot } from '../../../control-assurance-runtime';

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
  if (access.response) return access.response;
  const { env } = await import('cloudflare:workers');
  return NextResponse.json(await loadControlAssuranceSnapshot(env.DB), { headers: { 'cache-control': 'private, no-store' } });
}
