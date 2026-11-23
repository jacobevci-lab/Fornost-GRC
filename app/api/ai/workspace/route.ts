import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { aiRuntime } from '../../../ai/storage';
import { desk, register, getModel, assess, changeShadow, type Body } from '../../../ai/governance-store';
import { monitor } from '../../../ai/governance-monitor';
import { governingRisk, DeskError, word, type Desk } from '../../../ai/governance-domain';
import { LifecycleConflict } from '../../../enterprise-lifecycle-write';
import { WorkflowSelectionError } from '../../../workflow-selection-store';
import { CoreReferenceUnavailable } from '../../../core-reference-write';
const headers = {
  'cache-control': 'no-store'
};
const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers
});
function failure(e: unknown) {
  if (e instanceof DeskError) return json({
    code: e.code
  }, e.status);
  if (e instanceof LifecycleConflict) return json({
    code: 'stale'
  }, 409);
  if (e instanceof CoreReferenceUnavailable) return json({
    code: 'reference'
  }, 422);
  if (e instanceof WorkflowSelectionError) return json({
    code: e.code.startsWith('EVIDENCE') ? 'evidence' : e.code === 'SELECTION_ACCESS' ? 'denied' : 'people'
  }, e.status);
  console.error('AI governance operation failed', e instanceof Error ? e.name : 'unknown');
  return json({
    code: 'unavailable'
  }, 503);
}
function inventoryCsv(data: Desk, tr: boolean) {
  const t = (a: string, b: string) => tr ? a : b,
    yn = (b: boolean) => b ? t('Evet', 'Yes') : t('Hayır', 'No'),
    unknown = t('Değerlendirilmedi', 'Not assessed');
  const rows = [[t('Kod', 'Code'), t('Sistem / Agent', 'System / Agent'), t('Mimari', 'Architecture'), t('Sağlayıcı', 'Provider'), 'EU AI Act', 'PII', 'ZDR', t('Yurt dışı aktarım', 'Cross-border transfer'), 'HITL', t('Yaşam döngüsü', 'Lifecycle')], ...data.systems.map(m => {
    const p = m.profile;
    return [m.code, m.name, p ? word(p.architecture, tr) : unknown, m.vendor, p || m.nativeRisk ? word(governingRisk(p?.risk,m.nativeRisk), tr) : unknown, p ? yn(p.pii) : unknown, p ? yn(p.zdr) : unknown, p ? yn(p.transfer) : unknown, p?.hitl || unknown, word(m.phase, tr)];
  })];
  const cell = (v: string) => '"' + (/^[\s]*[=+@-]|^[\t\r\n]/.test(v) ? "'" : '') + v.replaceAll('"', '""') + '"';
  return new NextResponse('\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'), {
    headers: {
      ...headers,
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename=fornost-ai-inventory.csv'
    }
  });
}
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor']);
  if (access.response) return access.response;
  try {
    const env = await aiRuntime(),
      data = await desk(env.DB, access.actor);
    return req.nextUrl.searchParams.get('format') === 'csv' ? inventoryCsv(data, req.nextUrl.searchParams.get('lang') !== 'en') : json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor']);
  if (access.response) return access.response;
  try {
    if (Number(req.headers.get('content-length') || 0) > 65536) throw new DeskError('fields', 413);
    const raw = await req.text();
    if (raw.length > 65536) throw new DeskError('fields', 413);
    let b: Body;
    try {
      b = JSON.parse(raw);
      if (!b || Array.isArray(b) || typeof b !== 'object') throw Error();
    } catch {
      throw new DeskError('fields', 400);
    }
    const env = await aiRuntime(),
      actor = access.actor,
      action = String(b.action);
    if (action === 'register') return json(await register(env, actor, b), 201);
    if (['shadow', 'ban'].includes(action)) return json(await changeShadow(env.DB, actor, b));
    const m = await getModel(env.DB, b.id, actor);
    if (m.revision !== b.revision) throw new DeskError('stale', 409);
    if (['save', 'submit', 'approve', 'conditional', 'return'].includes(action)) return json(await assess(env, actor, b, m));
    if (['monitor', 'suspend', 'capa', 'incident'].includes(action)) return json(await monitor(env, actor, b, m));
    throw new DeskError('fields', 400);
  } catch (e) {
    return failure(e);
  }
}
