import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { ensureFindingsSchemaCompatibility } from '../schema-compat';
import { ensureEvidenceAutomationSchema } from '../../evidence-automation/core';
import { ensureAssuranceWorkSchema } from '../../../continuous-assurance-runtime';
import { loadFindingControlContext } from '../../../findings/control-context';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
  if (access.response) return access.response;
  const id = req.nextUrl.searchParams.get('findingId') || '';
  if (!id || id.length > 120) return json({ error: 'Geçerli bulgu kimliği gerekli.' }, 400);
  try {
    const { env } = await import('cloudflare:workers');
    const db = (env as unknown as { DB: D1Database }).DB;
    await ensureFindingsSchemaCompatibility(db);
    await ensureEvidenceAutomationSchema(db);
    await ensureAssuranceWorkSchema(db);
    const context = await loadFindingControlContext(db, id);
    return context ? json({ context }) : json({ error: 'Bulgu bulunamadı.' }, 404);
  } catch {
    return json({ error: 'Kontrol bağlamı alınamadı. Yeniden deneyin.' }, 503);
  }
}
