import { NextRequest, NextResponse } from 'next/server';
import { readBoundedJsonObject, JsonBodyError } from '../../request-body';
import { requireRole } from '../../auth/security';
import { aiRuntime, recordAiEvent } from '../../../ai/storage';
import { ready, allowed, fullAccess, AgenticError, text } from '../../../ai/agentic/common';
import { runAgent } from '../../../ai/agentic/tool-registry';
import { agentActor } from '../../../ai/agentic/access';
import { reviseTool } from '../../../ai/agentic/tool-proposals';
import { applyCommand, readProposal, card } from '../../../ai/agentic/proposals';
import { analyzeRegulation, proposeRegulatory } from '../../../ai/agentic/regulatory';
import type { Runtime } from '../../../ai/grc/router';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'private, no-store' } });
function fail(e: unknown) { if (e instanceof JsonBodyError)
    return json({ code: 'AI_FIELDS' }, e.status); const code = e instanceof Error && /^AI_[A-Z_]+$/.test(e.message) ? e.message : 'AI_FAILED'; return json({ code }, e instanceof AgenticError ? e.status : code === 'AI_STALE' ? 409 : 422); }
export async function GET(req: NextRequest) {
    const a = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
    if (a.response)
        return a.response;
    try {
        const env = await aiRuntime() as Runtime;
        await agentActor(env.DB,a.actor);
        await ready(env.DB);
        await agentActor(env.DB,a.actor);
        if (req.nextUrl.searchParams.get('kind') === 'reminders'){fullAccess(a.actor);
            return json({ items: (await env.DB.prepare("SELECT r.*,f.title FROM ai_work_reminders r JOIN enterprise_findings f ON f.id=r.finding_id WHERE lower(r.owner)=lower(?) AND r.status='open' ORDER BY r.due_date,r.id LIMIT 100").bind(a.actor.email).all()).results });}
        const rows = (await env.DB.prepare("SELECT * FROM ai_hitl_proposals WHERE actor_id=? AND status='pending' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY created_at DESC LIMIT 20").bind(a.actor.id).all<Parameters<typeof card>[0]>()).results;
        const visible=[];for(const p of rows){try{await readProposal(env.DB,a.actor,{id:p.id,revision:p.revision});visible.push(card(p));}catch{}}return json({items:visible});
    }
    catch (e) {
        return fail(e);
    }
}
export async function POST(req: NextRequest) {
    const a = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
    if (a.response)
        return a.response;
    try {
        const b = await readBoundedJsonObject(req, 200000);
        const env = await aiRuntime() as Runtime, actor = a.actor;
        await agentActor(env.DB,actor,b.action!=='query');
        await ready(env.DB);
        const lang = b.lang === 'en' ? 'en' : 'tr';
        if (b.action === 'query') {
            await agentActor(env.DB,actor);
            const question = text(b.question, 4000);
            if (!question)
                throw new AgenticError('AI_FIELDS');
            return json(await runAgent(env,actor,question,b,lang));
        }
        if(b.action==='revise'){const p=await readProposal(env.DB,actor,b);if(!b.patch||typeof b.patch!=='object'||Array.isArray(b.patch))throw new AgenticError('AI_FIELDS');return json(await reviseTool(env.DB,actor,p,b.patch as Record<string,unknown>));}
        if (b.action === 'apply')
            return json(await applyCommand(env.DB, actor, b));
        if (b.action === 'cancel') {
            const p = await readProposal(env.DB, actor, b);
            await env.DB.prepare("UPDATE ai_hitl_proposals SET status='cancelled' WHERE id=? AND actor_id=? AND revision=? AND status='pending'").bind(p.id, actor.id, p.revision).run();
            await recordAiEvent(env.DB, { actor: actor.email, action: 'hitl-cancel', status: 'success', contextRefs: [p.id] });
            return json({ ok: true });
        }
        if (b.action === 'complete-reminder') {
            await allowed(env.DB, actor, 'agents');
            const result = await env.DB.batch([env.DB.prepare("UPDATE ai_work_reminders SET status='completed',completed_at=? WHERE id=? AND lower(owner)=lower(?) AND status='open'").bind(new Date().toISOString(), text(b.id, 160), actor.email), env.DB.prepare("INSERT INTO ai_activity_logs(id,actor,action,provider,model,context_refs_json,status,latency_ms,detail,created_at) SELECT ?,?,'reminder-complete','rules','','[]','success',0,?,? WHERE changes()=1").bind(crypto.randomUUID(), actor.email, text(b.id, 160), new Date().toISOString())]);
            if (!result[0].meta?.changes)
                throw new AgenticError('AI_STALE', 409);
            return json({ ok: true });
        }
        if (b.action === 'regulation-analysis')
            return json(await analyzeRegulation(env, actor, b, lang));
        if (b.action === 'regulation-proposal')
            return json({ proposal: await proposeRegulatory(env, actor, b) });
        throw new AgenticError('AI_ACTION');
    }
    catch (e) {
        return fail(e);
    }
}
