import { agentActor } from './access';
import { validate } from '../../core-record-validation';
import { insertCoreRecords } from '../../core-reference-write';
import { reserveRecordCodes } from '../../record-code-store';
import { recordAiEvent } from '../storage';
import { allowed, AgenticError, person, pinGuard, day, text, normal, type Actor, type Pin } from './common';
export type Proposal = {
    id: string;
    actor_id: string;
    actor: string;
    kind: string;
    params_json: string;
    source_json: string;
    revision: string;
    status: string;
    expires_at: string;
    result_json: string | null;
    created_at: string;
    applied_at: string | null;
};
export const card = (p: Proposal) => ({ id: p.id, kind: p.kind, params: Object.fromEntries(Object.entries(JSON.parse(p.params_json)).filter(([k])=>!['authorization','riskId','controlId'].includes(k))), revision: p.revision, status: p.status, expiresAt: p.expires_at, result: p.result_json ? JSON.parse(p.result_json) : null });
export async function saveProposal(db: D1Database, actor: Actor, kind: string, params: Record<string, unknown>, pins: Pin[]) {
    if(kind.startsWith('tool:'))await agentActor(db,actor,true);else await allowed(db, actor, 'agents');
    const id = crypto.randomUUID(), revision = crypto.randomUUID(), now = new Date().toISOString(), expires = new Date(Date.now() + 20 * 60000).toISOString();
    const encoded = JSON.stringify(params), source = JSON.stringify(pins);
    if (encoded.length > 150000 || source.length > 500000)
        throw new AgenticError('AI_LIMIT');
    await db.prepare("INSERT INTO ai_hitl_proposals(id,actor_id,actor,kind,params_json,source_json,revision,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id, actor.id, actor.email, kind, encoded, source, revision, expires, now).run();
    await recordAiEvent(db, { actor: actor.email, action: 'hitl-proposal', status: 'success', contextRefs: [id], detail: kind + '; awaiting explicit approval' });
    return card({ id, actor_id: actor.id, actor: actor.email, kind, params_json: encoded, source_json: source, revision, status: 'pending', expires_at: expires, result_json: null, created_at: now, applied_at: null });
}
export function intent(question: string) { const q = normal(question); if (/(hatirlat|remind)/.test(q) && /(bulgu|finding|sla)/.test(q))
    return 'reminders'; if (/risk/.test(q) && /(olustur|taslak|create|draft)/.test(q))
    return 'risk'; return null; }
export async function proposeCommand(db: D1Database, actor: Actor, question: string, b: Record<string, unknown>, lang: 'tr' | 'en') {
    await allowed(db, actor, 'agents');
    const kind = intent(question);
    if (!kind)
        return { proposal: null };
    if (kind === 'reminders') {
        const rows = (await db.prepare("SELECT id,code,title,owner,status,due_date,updated_at FROM enterprise_findings f WHERE status NOT IN ('closed','accepted','cancelled') AND due_date<date('now') AND NOT EXISTS(SELECT 1 FROM ai_work_reminders r WHERE r.finding_id=f.id AND r.status='open') ORDER BY due_date,id LIMIT 51").all<Record<string, unknown>>()).results;
        if (rows.length > 50)
            throw new AgenticError('AI_LIMIT');
        if (!rows.length)
            return { proposal: null, answer: lang === 'tr' ? 'Hatırlatma gerektiren gecikmiş açık bulgu bulunamadı.' : 'No overdue open findings need a reminder.' };
        const owners = await Promise.all([...new Set(rows.map(r => String(r.owner)))].map(email => person(db, email)));
        return { proposal: await saveProposal(db, actor, kind, { title: lang === 'tr' ? 'Gecikmiş bulgular için kurum içi hatırlatmalar' : 'Internal reminders for overdue findings', dueDate: day(), note: text(b.note || (lang === 'tr' ? 'SLA süresi geçti; aksiyon planını ve terminini gözden geçirin.' : 'SLA overdue; review the action plan and due date.')), items: rows.map(r => ({ id: r.id, code: r.code, title: r.title, owner: r.owner, dueDate: r.due_date })) }, [...rows.map(r => ({ table: 'enterprise_findings', row: r })), ...owners.map(row => ({ table: 'local_users', row }))]) };
    }
    const rows = (await db.prepare("SELECT r.id,r.data_json,r.updated_at,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Varlık Envanteri' ORDER BY r.id LIMIT 501").all<{
        id: string;
        data_json: string;
        updated_at: string;
        code: string;
    }>()).results;
    if (rows.length > 500)
        throw new AgenticError('AI_LIMIT');
    const candidates = rows.filter(r => b.assetId ? r.id === b.assetId : [JSON.parse(r.data_json).title, r.code].some(value => typeof value === 'string' && value.length > 1 && normal(question).includes(normal(value))));
    if (candidates.length !== 1)
        return { proposal: null, choices: rows.map(r => ({ id: r.id, code: r.code, title: JSON.parse(r.data_json).title })), answer: lang === 'tr' ? 'Risk taslağı için tek bir varlık seçin.' : 'Select one asset for the risk draft.' };
    const asset = candidates[0], owner = await person(db, b.owner || actor.email), title = text(b.title || (lang === 'tr' ? JSON.parse(asset.data_json).title + ' — yüksek erişim riski' : JSON.parse(asset.data_json).title + ' — high access risk'), 200);
    const checked = validate('Risk Assessment', { title, owner: owner.name, ownerEmail: owner.email, ownerSource: 'directory', asset: asset.id, status: 'Değerlendiriliyor', inherentLikelihood: 4, inherentImpact: 4, description: text(b.description || question, 1800), aiOrigin: 'Ask Fornost (Kullanıcı Onaylı)' });
    if (checked.error || !checked.data)
        throw new AgenticError('AI_FIELDS');
    return { proposal: await saveProposal(db, actor, 'risk', { title, data: checked.data, assetCode: asset.code }, [{ table: 'simple_grc_records', row: { id: asset.id, module: 'Varlık Envanteri', data_json: asset.data_json, updated_at: asset.updated_at } }, { table: 'local_users', row: owner }]) };
}
export async function readProposal(db: D1Database, actor: Actor, b: Record<string, unknown>) {
    await agentActor(db,actor,true);
    const p = await db.prepare('SELECT * FROM ai_hitl_proposals WHERE id=? AND actor_id=?').bind(text(b.id, 100), actor.id).first<Proposal>();
    if (!p)
        throw new AgenticError('AI_NOT_FOUND', 404);
    if(!p.kind.startsWith('tool:'))await allowed(db,actor,'agents');
    else {const {authorityGuard}=await import('./access');const params=JSON.parse(p.params_json),g=authorityGuard(actor,params.authorization);if(!(await db.prepare(`SELECT 1 WHERE ${g.sql}`).bind(...g.values).first()))throw new AgenticError('AI_STALE',409);}
    if (p.revision !== b.revision)
        throw new AgenticError('AI_STALE', 409);
    return p;
}
export function proposalGuard(p: Proposal) { const guard = pinGuard(JSON.parse(p.source_json)); guard.sql += " AND EXISTS(SELECT 1 FROM ai_hitl_proposals WHERE id=? AND actor_id=? AND revision=? AND status='pending' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND EXISTS(SELECT 1 FROM local_users WHERE id=? AND status='Active' AND role IN ('Admin','Editor')) AND NOT EXISTS(SELECT 1 FROM ai_operating_policy WHERE id='default' AND (emergency_stop=1 OR agents_enabled=0))"; guard.values.push(p.id, p.actor_id, p.revision, p.actor_id); return guard; }
export function applied(db: D1Database, p: Proposal, result: unknown) { return db.prepare("UPDATE ai_hitl_proposals SET status='applied',result_json=?,applied_at=? WHERE id=? AND status='pending' AND changes()>0").bind(JSON.stringify(result), new Date().toISOString(), p.id); }
export async function applyCommand(db: D1Database, actor: Actor, b: Record<string, unknown>) {
    const p = await readProposal(db, actor, b);
    if (b.confirm !== true)
        throw new AgenticError('AI_CONFIRM');
    if (p.status === 'applied')
        return card(p);
    if (p.status !== 'pending' || p.expires_at <= new Date().toISOString())
        throw new AgenticError('AI_EXPIRED', 409);
    const params = JSON.parse(p.params_json), guard = proposalGuard(p), now = new Date().toISOString();
    if(p.kind.startsWith('tool:')){const {applyTool}=await import('./tool-proposals');await applyTool(db,actor,p);}
    else if (p.kind === 'risk') {
        const id = p.id, code = (await reserveRecordCodes(db, 'Risk Assessment', 1, now))[0];
        try {
            await insertCoreRecords(db, 'Risk Assessment', [{ id, code, data: params.data }], now, undefined, { guard, after: applied(db, p, { id, code, module: 'Risk Assessment' }) });
        }
        catch (e) {
            const retry = await db.prepare('SELECT * FROM ai_hitl_proposals WHERE id=?').bind(p.id).first<Proposal>();
            if (retry?.status === 'applied')
                return card(retry);
            throw e;
        }
    }
    else if (p.kind === 'reminders') {
        const reminders = params.items.map((r: {
            id: string;
            code: string;
            owner: string;
        }) => ({ id: p.id + ':' + r.id, findingId: r.id, code: r.code, owner: r.owner }));
        try {
            const result = await db.batch([db.prepare(`INSERT INTO ai_work_reminders(id,proposal_id,finding_id,finding_code,owner,note,due_date,created_by,created_at) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.findingId'),json_extract(value,'$.code'),json_extract(value,'$.owner'),?,?,?,? FROM json_each(?) WHERE ${guard.sql}`).bind(p.id, params.note, params.dueDate, actor.email, now, JSON.stringify(reminders), ...guard.values), applied(db, p, { count: reminders.length, module: 'Benim İşlerim' })]);
            if (!result[0].meta?.changes)
                throw new AgenticError('AI_STALE', 409);
        }
        catch {
            const retry = await db.prepare('SELECT * FROM ai_hitl_proposals WHERE id=?').bind(p.id).first<Proposal>();
            if (retry?.status === 'applied')
                return card(retry);
            throw new AgenticError('AI_STALE', 409);
        }
    }
    else {
        const { applyRegulatory } = await import('./regulatory');
        await applyRegulatory(db, actor, p);
    }
    return card((await db.prepare('SELECT * FROM ai_hitl_proposals WHERE id=?').bind(p.id).first<Proposal>())!);
}
