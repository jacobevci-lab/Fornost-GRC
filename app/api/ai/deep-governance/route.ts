import { NextRequest, NextResponse } from 'next/server';
import { readBoundedJsonObject, JsonBodyError } from '../../request-body';
import { requireRole } from '../../auth/security';
import { aiRuntime } from '../../../ai/storage';
import { ready, fullAccess, AgenticError, text } from '../../../ai/agentic/common';
import { extension, saveExtension, previewShadow, importShadow } from '../../../ai/agentic/deep-store';
import type { Runtime } from '../../../ai/grc/router';
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'cache-control': 'no-store' } });
const fail = (e: unknown) => json({ code: e instanceof Error && /^AI_[A-Z_]+$/.test(e.message) ? e.message : 'AI_FAILED' }, e instanceof AgenticError || e instanceof JsonBodyError ? e.status : 422);
export async function GET(req: NextRequest) { const a = await requireRole(req, ['Admin', 'Editor']); if (a.response)
    return a.response; try {
    fullAccess(a.actor);
    const env = await aiRuntime();
    await ready(env.DB);
    return json(await extension(env.DB, a.actor, text(req.nextUrl.searchParams.get('id'), 100)));
}
catch (e) {
    return fail(e);
} }
export async function POST(req: NextRequest) {
    const a = await requireRole(req, ['Admin', 'Editor']);
    if (a.response)
        return a.response;
    try {
        fullAccess(a.actor, true);
        const b = await readBoundedJsonObject(req, 2200000);
        const env = await aiRuntime() as Runtime;
        await ready(env.DB);
        if (b.action === 'shadow-preview')
            return json(await previewShadow(env, a.actor, b));
        if (b.action === 'shadow-import')
            return json(await importShadow(env, a.actor, b));
        return json(await saveExtension(env.DB, a.actor, b, b.lang !== 'en'));
    }
    catch (e) {
        return fail(e);
    }
}
