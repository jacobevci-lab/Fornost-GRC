import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { ConnectionWriteError, connectedLinkHistorySchema, writeConnectedLink } from '../../../connected-grc-link-store';
import { canReadModule } from '../../../module-access';
import { ensureCoreGrcSchemaCompatibility } from '../../grc/schema-compat';
import { isAuditClosedError } from '../../../audit-closure';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
async function database() { const { env } = await import('cloudflare:workers'); await ensureCoreGrcSchemaCompatibility(env.DB); await env.DB.prepare(connectedLinkHistorySchema).run(); return env.DB; }
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor']); if (auth.response) return auth.response;
  try {
    const raw = await req.text(); if (raw.length > 12000) return json({ code: 'invalid' }, 413);
    const input = JSON.parse(raw); if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ code: 'invalid' }, 400);
    return json(await writeConnectedLink(await database(), auth.actor, input));
  } catch (error) {
    if (error instanceof ConnectionWriteError) return json({ code: error.code }, error.status);
    if (isAuditClosedError(error)) return json({ code: 'audit-closed' }, 409);
    if (error instanceof SyntaxError) return json({ code: 'invalid' }, 400);
    return json({ code: 'unconfirmed' }, 503);
  }
}
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['Admin', 'Editor', 'Viewer']); if (auth.response) return auth.response;
  try {
    const sourceId = req.nextUrl.searchParams.get('sourceId'); if (!sourceId || sourceId.length > 160) return json({ code: 'invalid' }, 400);
    const db = await database();
    const source = await db.prepare('SELECT module FROM simple_grc_records WHERE id=?').bind(sourceId).first<{ module: string }>();
    const plan = !source && req.nextUrl.searchParams.get('kind') === 'continuity-plan' ? await db.prepare('SELECT id FROM enterprise_continuity_plans WHERE id=?').bind(sourceId).first() : null;
    if ((!source && !plan) || (source && !canReadModule(auth.actor, source.module))) return json({ code: 'unavailable' }, 404);
    const events = await db.prepare('SELECT id,field,action,actor,note,created_at FROM connected_grc_link_events WHERE source_id=? ORDER BY created_at DESC,id DESC LIMIT 30').bind(sourceId).all();
    return json({ events: events.results });
  } catch { return json({ code: 'unavailable' }, 503); }
}
