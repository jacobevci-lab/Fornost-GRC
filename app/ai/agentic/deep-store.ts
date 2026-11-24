import { getModel, receipt } from '../governance-store';
import { governingRisk } from '../governance-domain';
import { allowed, AgenticError, text, pinGuard, type Actor, type Pin } from './common';
import { classifyWizard, validateBom, discoverCsv, type Wizard, type Bom, type Discovery } from './deep-domain';
import { digest, type Runtime } from '../grc/router';
import { ensureGrcAi } from '../grc/schema';
import { recordAiEvent } from '../storage';
type Extension = {
    model_id: string;
    wizard_json: string | null;
    bom_json: string | null;
    revision: string;
    updated_at: string;
    updated_by: string;
};
export async function extension(db: D1Database, actor: Actor, id: string) { await getModel(db, id, actor); const row = await db.prepare('SELECT * FROM ai_governance_extensions WHERE model_id=?').bind(id).first<Extension>(); return { revision: row?.revision || '', wizard: row?.wizard_json ? JSON.parse(row.wizard_json) : null, bom: row?.bom_json ? JSON.parse(row.bom_json) : null }; }
export async function saveExtension(db: D1Database, actor: Actor, b: Record<string, unknown>, tr: boolean) {
    await allowed(db, actor, 'agents');
    const m = await getModel(db, b.id, actor);
    if (actor.role !== 'Admin' && actor.email !== m.owner)
        throw new AgenticError('AI_SCOPE', 403);
    if (m.revision !== b.modelRevision || ['retired', 'review'].includes(m.phase))
        throw new AgenticError('AI_STALE', 409);
    const native=await db.prepare('SELECT id,owner,status,updated_at FROM ai_model_inventory WHERE id=?').bind(m.id).first<{id:string;owner:string;status:string;updated_at:string}>();
    if(!native)throw new AgenticError('AI_STALE',409);
    const old = await extension(db, actor, m.id);
    if (old.revision !== b.revision)
        throw new AgenticError('AI_STALE', 409);
    const wizard = b.action === 'wizard' ? classifyWizard(b.answers as Wizard, tr) : old.wizard, bom = b.action === 'bom' ? validateBom(b.bom as Bom) : old.bom;
    if (b.action === 'checklist') {
        if (!wizard || !Array.isArray(b.completed) || b.completed.some(k => !wizard.checklist.some((c: {
            key: string;
        }) => c.key === k)))
            throw new AgenticError('AI_FIELDS');
        wizard.completed = [...new Set(b.completed)];
    }
    else if (!['wizard', 'bom'].includes(String(b.action)))
        throw new AgenticError('AI_ACTION');
    const now = new Date(Math.max(Date.now(), Date.parse(m.revision) + 1)).toISOString(), revision = crypto.randomUUID(), risk = governingRisk(m.profile?.risk, m.nativeRisk);
    const effective = wizard?.risk && wizard.risk !== 'unresolved' ? governingRisk(risk, wizard.risk) : risk;
    if (wizard)
        wizard.governingRisk = effective;
    const nextProfile=m.profile?{...m.profile,risk:effective,...(b.action==='bom'&&bom?{model:bom.model,provider:bom.provider||m.profile.provider,tools:bom.tools.map((x:Bom['tools'][0])=>x.name+': '+x.scope).join('\n'),write:bom.tools.some((x:Bom['tools'][0])=>['write','admin'].includes(x.permission)),hitl:bom.tools.map((x:Bom['tools'][0])=>x.hitl).filter(Boolean).join('\n')}: {})}:null;
    const value = [wizard ? JSON.stringify(wizard) : null, bom ? JSON.stringify(bom) : null, revision, actor.email, now];
    const guard = "EXISTS(SELECT 1 FROM ai_model_inventory m LEFT JOIN ai_system_profiles p ON p.model_id=m.id WHERE m.id=? AND COALESCE(p.updated_at,m.updated_at)=? AND m.owner=? AND m.status=? AND m.updated_at=?) AND EXISTS(SELECT 1 FROM local_users WHERE id=? AND status='Active' AND role IN ('Admin','Editor')) AND NOT EXISTS(SELECT 1 FROM ai_operating_policy WHERE id='default' AND (emergency_stop=1 OR agents_enabled=0))";
    const claim = old.revision ? db.prepare(`UPDATE ai_governance_extensions SET wizard_json=?,bom_json=?,revision=?,updated_by=?,updated_at=? WHERE model_id=? AND revision=? AND ${guard}`).bind(...value, m.id, old.revision, m.id, m.revision,native.owner,native.status,native.updated_at,actor.id) : db.prepare(`INSERT INTO ai_governance_extensions(model_id,wizard_json,bom_json,revision,updated_by,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM ai_governance_extensions WHERE model_id=?)`).bind(m.id, ...value, m.id, m.revision,native.owner,native.status,native.updated_at,actor.id,m.id);
    const claimGate = 'EXISTS(SELECT 1 FROM ai_governance_extensions WHERE model_id=? AND revision=?)';
    const results = await db.batch([claim, db.prepare('SELECT changes() claimed'), db.prepare(`UPDATE ai_model_inventory SET model_name=?,status=CASE WHEN status='suspended' THEN status ELSE 'draft' END,approved_by=NULL,approved_at=NULL,updated_by=?,updated_at=? WHERE id=? AND ${claimGate}`).bind(b.action==='bom'&&bom?bom.model:m.model,actor.email, now, m.id, m.id, revision), db.prepare(`UPDATE ai_system_profiles SET profile_json=?,phase=CASE WHEN phase='suspended' THEN phase ELSE 'draft' END,submitted_by=NULL,decided_by=NULL,evidence_json=NULL,updated_at=? WHERE model_id=? AND ${claimGate}`).bind(JSON.stringify(nextProfile), now, m.id, m.id, revision), db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,context_refs_json,status,latency_ms,detail,created_at) SELECT ?,?,?,'rules','',?,'success',0,?,? WHERE ${claimGate}`).bind(revision, actor.email, 'ai-governance:' + String(b.action), JSON.stringify([m.id]), 'Human saved; production approval reset; ' + revision, now, m.id, revision)]);
    if (Number((results[1]?.results?.[0] as {
        claimed?: number;
    })?.claimed) !== 1)
        throw new AgenticError('AI_STALE', 409);
    return { ok: true, revision, wizard, bom };
}
async function inventory(db: D1Database) { const rows = (await db.prepare('SELECT id,system_name,status,updated_at FROM ai_model_inventory ORDER BY id LIMIT 501').all<Record<string, string>>()).results; if (rows.length > 500)
    throw new AgenticError('AI_LIMIT'); return rows; }
const normalized = (v: string) => v.toLowerCase().trim().replace(/[\s_-]+/g, '');
export async function previewShadow(env: Runtime, actor: Actor, b: Record<string, unknown>) {
    await allowed(env.DB, actor, 'agents');
    await ensureGrcAi(env.DB);
    if (!['entra', 'okta', 'network', 'spend'].includes(String(b.source)))
        throw new AgenticError('AI_FIELDS');
    const parsed = discoverCsv(String(b.csv || ''), b.mapping as Record<string, number> | undefined);
    if (parsed.needsMapping)
        return parsed;
    const rows = await inventory(env.DB), candidates = [];
    for (const c of parsed.candidates) {
        const fingerprint = await digest(c.key);
        const exists = await env.DB.prepare('SELECT fingerprint FROM ai_shadow_discoveries WHERE fingerprint=?').bind(fingerprint).first();
        const approved = rows.some(r => r.status === 'approved' && normalized(r.system_name) === normalized(c.name));
        candidates.push({ ...c, fingerprint, status: exists ? 'already-discovered' : approved ? 'inventory-match' : 'unapproved' });
    }
    const id = crypto.randomUUID(), result = { ...parsed, candidates, source: b.source, lang:b.lang==='en'?'en':'tr', actorId: actor.id, fileHash: await digest(String(b.csv)), pins: rows.map(row => ({ table: 'ai_model_inventory', row })), count: rows.length };
    await env.DB.prepare('INSERT INTO grc_ai_results VALUES(?,?,?,?,?,?,?)').bind(id, 'shadow-preview', String(b.source), await digest(JSON.stringify(rows)), JSON.stringify(result), actor.email, new Date().toISOString()).run();
    await recordAiEvent(env.DB, { actor: actor.email, action: 'shadow-preview', status: 'success', contextRefs: [id], detail: `${parsed.scanned} rows; ${candidates.length} signals; rules only` });
    return { ...parsed, candidates, id };
}
export async function importShadow(env: Runtime, actor: Actor, b: Record<string, unknown>) {
    await allowed(env.DB, actor, 'agents');
    const saved = await env.DB.prepare("SELECT * FROM grc_ai_results WHERE id=? AND kind='shadow-preview' AND actor=?").bind(text(b.id, 100), actor.email).first<{
        result: string;
        source_hash: string;
        created_at: string;
    }>();
    if (!saved)
        throw new AgenticError('AI_NOT_FOUND', 404);
    const preview = JSON.parse(saved.result);
    if (preview.actorId !== actor.id || Date.parse(saved.created_at) + 20 * 60000 < Date.now() || !Array.isArray(b.keys) || !b.keys.length || b.keys.length > 300)
        throw new AgenticError('AI_EXPIRED', 409);
    if (await digest(JSON.stringify(await inventory(env.DB))) !== saved.source_hash)
        throw new AgenticError('AI_STALE', 409);
    const candidates: (Discovery & {
        fingerprint: string;
        status: string;
    })[] = [...new Set(b.keys as string[])].map(key => { const c = preview.candidates.find((c: Discovery) => c.key === key); if (!c || !['unapproved', 'inventory-match'].includes(c.status))
        throw new AgenticError('AI_FIELDS'); return c; });
    const guard = pinGuard(preview.pins as Pin[]);
    guard.sql += " AND EXISTS(SELECT 1 FROM local_users WHERE id=? AND status='Active' AND role IN ('Admin','Editor')) AND (SELECT count(*) FROM ai_model_inventory)=? AND NOT EXISTS(SELECT 1 FROM ai_operating_policy WHERE id='default' AND (emergency_stop=1 OR agents_enabled=0))";
    const values = [...guard.values, actor.id, preview.count], now = new Date().toISOString();
    let added = 0;
    // Each candidate is an atomic insert + receipt; a retry skips any previously committed fingerprint.
    for (const c of candidates) {
        const id = 'SHADOW-' + c.fingerprint.slice(0, 32), detail = JSON.stringify({ source: preview.source, row: c.row, domain: c.domain, permissions: c.permissions, reason: c.reason, fileHash: preview.fileHash });
        const results = await env.DB.batch([env.DB.prepare(`INSERT INTO ai_shadow_register(id,name,context,discovered_by,discovered_at,status) SELECT ?,?,?,?,?,'unreviewed' WHERE ${guard.sql} AND NOT EXISTS(SELECT 1 FROM ai_shadow_discoveries WHERE fingerprint=?)`).bind(id, c.name.slice(0, 200), `${preview.source.toUpperCase()} · CSV ${preview.lang==='en'?'row':'satır'} ${c.row}\n${c.domain}\nOAuth: ${c.permissions||'—'}\n${preview.lang==='en'?'AI signal; independent review required.':'AI sinyali; bağımsız inceleme gerekir.'}`, actor.email, now, ...values, c.fingerprint), env.DB.prepare('SELECT changes() added'), env.DB.prepare('INSERT INTO ai_shadow_discoveries SELECT ?,?,?,?,?,? WHERE changes()=1').bind(c.fingerprint, id, preview.source, detail, actor.email, now), receipt(env.DB, id, actor.email, 'shadow-import', 'Unapproved candidate; no enforcement or OAuth changes', now)]);
        const count = Number((results[1]?.results?.[0] as {
            added?: number;
        })?.added || 0);
        if (!count && !await env.DB.prepare('SELECT fingerprint FROM ai_shadow_discoveries WHERE fingerprint=?').bind(c.fingerprint).first())
            throw new AgenticError('AI_STALE', 409);
        added += count;
    }
    return { ok: true, added, skipped: candidates.length - added };
}
