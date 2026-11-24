import { allowed, AgenticError, text, normal, type Actor, type Pin } from './common';
import { saveProposal, proposalGuard, applied, type Proposal } from './proposals';
import { analyzeWithRouter, digest, privacyRow, type Runtime } from '../grc/router';
import { enforceGroundedCitations } from '../knowledge';
import { ensureGrcAi } from '../grc/schema';
import { recordDataClassificationAllowed } from '../data-policy';
import { validatePolicyVersion } from '../../policy-lifecycle/domain';
import { draftReferences, insertDraftVersion } from '../../policy-lifecycle/draft-store';
import { lifecycleClaim, commitLifecycle, lifecycleInsert } from '../../enterprise-lifecycle-write';
import { prepareWorkflowSelection, joinWorkflowGuards } from '../../workflow-selection-store';
import { validateFinding } from '../../findings/domain';
import { resolveFindingSource } from '../../findings/source-records';
import { insertFinding } from '../../findings/intake-store';
type Row = Record<string, string | number | null>;
type Match = {
    id: string;
    code: string;
    clause: number;
    quote: string;
    kind: 'policy' | 'control';
    score: number;
};
export type Gap = {
    requirement: string;
    matches: Match[];
    policyUpdate: string;
    controlNeed: string;
    hours: [
        number,
        number
    ];
};
export function gapAnalysis(regulation: string, sources: {
    id: string;
    code: string;
    text: string;
    kind: 'policy' | 'control';
}[], tr: boolean): Gap[] {
    const clauses = regulation.split(/\n+|(?<=[.;])\s+/).map(s => s.trim()).filter(s => s.length >= 20);
    if (clauses.length > 60)
        throw new AgenticError('AI_LIMIT');
    const stop = new Set(['the', 'and', 'for', 'with', 'shall', 'must', 'that', 'this', 've', 'icin', 'olan', 'bir', 'ile', 'olarak', 'gerekir', 'edilir']);
    return clauses.map(requirement => {
        const words = [...new Set(normal(requirement).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !stop.has(w)))];
        const matches = sources.flatMap(s => s.text.split(/\n+/).map((quote, i) => ({ id: s.id, code: s.code, kind: s.kind, quote: quote.slice(0, 1200), clause: i + 1, score: words.filter(w => normal(quote).includes(w)).length }))).filter(m => m.score >= Math.min(2, words.length || 99)).sort((a, b) => b.score - a.score).slice(0, 4);
        const policies = matches.filter(m => m.kind === 'policy'), controls = matches.filter(m => m.kind === 'control');
        return { requirement, matches, policyUpdate: policies.length ? (tr ? 'Eşleşen maddeleri yeni gereksinime karşı gözden geçirin; kelime benzerliği uyum kanıtı değildir.' : 'Review matching clauses against this requirement; keyword overlap is not proof of compliance.') : (tr ? 'Eşleşen yayındaki madde bulunamadı. Kapsamı doğrulayın ve yeni politika maddesi taslağı hazırlayın.' : 'No matching published clause found. Verify applicability and draft a policy clause.'), controlNeed: controls.length ? (tr ? 'Eşleşen kontrolün kapsamını ve test kanıtını doğrulayın.' : 'Verify the matching control scope and test evidence.') : (tr ? 'Bu gereksinim için sahip, sıklık ve test kanıtı tanımlayan yeni kontrol önerilir.' : 'Propose a control defining an owner, frequency and test evidence for this requirement.'), hours: matches.length ? [2, 6] : [4, 12] };
    });
}
async function snapshot(env: Runtime, id: string) {
    const change = await env.DB.prepare('SELECT * FROM regulatory_changes WHERE id=?').bind(id).first<Row>();
    if (!change)
        throw new AgenticError('AI_NOT_FOUND', 404);
    const row = await privacyRow(env.DB), max = row && JSON.parse(row.config).mode === 'byok' ? 'Internal' : 'Confidential';
    const policies = (await env.DB.prepare("SELECT p.*,v.id version_id,v.content,v.content_sha256,v.status version_status,v.updated_at version_updated FROM policy_documents p JOIN policy_versions v ON v.id=p.current_version_id WHERE p.status='published' AND v.status='published' AND v.approved_by IS NOT NULL AND lower(v.approved_by)<>lower(v.created_by) AND v.effective_date<=date('now') ORDER BY p.id LIMIT 501").all<Row>()).results;
    const controls = (await env.DB.prepare("SELECT r.id,r.module,r.data_json,r.updated_at,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Kontroller' AND json_extract(r.data_json,'$.status')='Aktif' ORDER BY r.id LIMIT 501").all<Row>()).results;
    if (policies.length > 500 || controls.length > 500)
        throw new AgenticError('AI_LIMIT');
    const sources: {
        id: string;
        code: string;
        text: string;
        kind: 'policy' | 'control';
    }[] = [], pins: Pin[] = [{ table: 'regulatory_changes', row: change }];
    for (const p of policies) {
        if (!recordDataClassificationAllowed(p, max))
            continue;
        if (await digest(String(p.content)) !== p.content_sha256)
            throw new AgenticError('AI_FILE_INTEGRITY');
        if (String(p.content).length > 20000)
            throw new AgenticError('AI_LIMIT');
        sources.push({ id: String(p.id), code: String(p.code), text: String(p.content), kind: 'policy' });
        pins.push({ table: 'policy_documents', row: { id: p.id, status: p.status, current_version_id: p.current_version_id, updated_at: p.updated_at } }, { table: 'policy_versions', row: { id: p.version_id, content: p.content, content_sha256: p.content_sha256, status: p.version_status, updated_at: p.version_updated } });
    }
    for (const c of controls) {
        const d = JSON.parse(String(c.data_json));
        if (!recordDataClassificationAllowed(d, max))
            continue;
        sources.push({ id: String(c.id), code: String(c.code || c.id), text: [d.controlTitle, d.description, d.testProcedure].filter(Boolean).join('\n'), kind: 'control' });
        pins.push({ table: 'simple_grc_records', row: { id: c.id, module: c.module, data_json: c.data_json, updated_at: c.updated_at } });
    }
    return { change, sources, pins, hash: await digest(JSON.stringify({ change, sources, pins })), classification: max };
}
export async function analyzeRegulation(env: Runtime, actor: Actor, b: Record<string, unknown>, lang: 'tr' | 'en') {
    await allowed(env.DB, actor, 'agents');
    await ensureGrcAi(env.DB);
    const source = await snapshot(env, text(b.id, 100));
    if (typeof b.regulatoryText === 'string' && b.regulatoryText.length > 60000)
        throw new AgenticError('AI_LIMIT');
    const regulation = text(b.regulatoryText || String(source.change.title) + '\n' + String(source.change.summary), 60000);
    if (regulation.length < 20)
        throw new AgenticError('AI_FIELDS');
    const gaps = gapAnalysis(regulation, source.sources, lang === 'tr');
    const modelText = await analyzeWithRouter(env, actor.email, 'regulatory-gap', { lang, instruction: 'Assess the listed requirement/policy comparisons. Cite only supplied codes. Do not provide a legal compliance verdict. Explain uncertainties and estimated review effort.', gaps }, source.classification);
    const grounded = modelText ? enforceGroundedCitations(modelText, source.sources.map(s => s.code)) : null, modelNotes = grounded?.grounded ? grounded.answer : null;
    if ((await snapshot(env, String(source.change.id))).hash !== source.hash)
        throw new AgenticError('AI_STALE', 409);
    const id = crypto.randomUUID(), result = { changeId: source.change.id, title: source.change.title, regulation, gaps, modelNotes, sourceMode: b.regulatoryText ? 'provided-text' : 'record-summary', policyOptions: source.sources.filter(s => s.kind === 'policy').map(s => ({ id: s.id, code: s.code, text: s.text })), hours: gaps.reduce((a, g) => [a[0] + g.hours[0], a[1] + g.hours[1]], [0, 0]), pins: source.pins };
    await env.DB.prepare('INSERT INTO grc_ai_results VALUES(?,?,?,?,?,?,?)').bind(id, 'regulation', source.change.id, source.hash, JSON.stringify(result), actor.email, new Date().toISOString()).run();
    return { id, ...result, pins: undefined };
}
export async function proposeRegulatory(env: Runtime, actor: Actor, b: Record<string, unknown>) {
    await allowed(env.DB, actor, 'agents');
    const a = await env.DB.prepare("SELECT * FROM grc_ai_results WHERE id=? AND kind='regulation' AND actor=?").bind(text(b.analysisId, 100), actor.email).first<{
        result: string;
        subject: string;
        source_hash: string;
    }>();
    if (!a)
        throw new AgenticError('AI_NOT_FOUND', 404);
    if ((await snapshot(env, a.subject)).hash !== a.source_hash)
        throw new AgenticError('AI_STALE', 409);
    const result = JSON.parse(a.result), pins: Pin[] = result.pins;
    if (b.target === 'policy') {
        await allowed(env.DB, actor, 'drafts');
        if (!result.policyOptions.some((p: {
            id: string;
        }) => p.id === b.policyId))
            throw new AgenticError('AI_FIELDS');
        const p = await env.DB.prepare('SELECT * FROM policy_documents WHERE id=?').bind(b.policyId).first<Row>();
        if (!p || actor.role !== 'Admin' && p.owner !== actor.email)
            throw new AgenticError('AI_SCOPE', 403);
        const v = await env.DB.prepare('SELECT * FROM policy_versions WHERE id=?').bind(p.current_version_id).first<Row>();
        if (!v)
            throw new AgenticError('AI_STALE', 409);
        if (await env.DB.prepare("SELECT id FROM policy_versions WHERE policy_id=? AND status IN ('draft','review','approved')").bind(p.id).first())
            throw new AgenticError('AI_POLICY_DRAFT', 409);
        const version = validatePolicyVersion({ policyId: p.id, summary: b.summary, content: b.content, effectiveDate: b.effectiveDate, controlRefs: JSON.parse(String(v.control_refs_json || '[]')), regulationRefs: [...JSON.parse(String(v.regulation_refs_json || '[]')), a.subject], riskRefs: JSON.parse(String(v.risk_refs_json || '[]')) });
        const count = await env.DB.prepare('SELECT max(version_number) n FROM policy_versions WHERE policy_id=?').bind(p.id).first<{
            n: number;
        }>();
        pins.push({ table: 'policy_documents', row: p }, { table: 'policy_versions', row: v });
        return saveProposal(env.DB, actor, 'policy-draft', { title: p.title, code: p.code, analysisId: b.analysisId, version, number: (count?.n || 0) + 1 }, pins);
    }
    if (b.target !== 'capa')
        throw new AgenticError('AI_ACTION');
    const selection = await prepareWorkflowSelection(env, actor, { ...b, assignmentMode: 'directory' }, { owner: 'writer', reviewer: 'reviewer' }), source = await resolveFindingSource(env.DB, 'regulatory', a.subject);
    const finding = validateFinding({ ...selection.body, sourceType: 'regulatory', sourceRef: a.subject, sourceTitle: source.title, findingType: 'control-deficiency', description: text(b.description || result.gaps.map((g: Gap) => g.requirement).join('\n'), 10000) });
    return saveProposal(env.DB, actor, 'regulatory-capa', { title: finding.title, analysisId: b.analysisId, finding }, pins);
}
export async function applyRegulatory(db: D1Database, actor: Actor, p: Proposal) {
    const params = JSON.parse(p.params_json), guard = proposalGuard(p), now = new Date().toISOString();
    try {
        if (p.kind === 'policy-draft') {
            await allowed(db, actor, 'drafts');
            const v = validatePolicyVersion(params.version), policy = await db.prepare('SELECT * FROM policy_documents WHERE id=?').bind(v.policyId).first<Row>();
            if (!policy || actor.role !== 'Admin' && policy.owner !== actor.email)
                throw new AgenticError('AI_SCOPE', 403);
            const refs = draftReferences(p.id, v);
            const all = joinWorkflowGuards(guard, refs, { sql: "NOT EXISTS(SELECT 1 FROM policy_versions WHERE policy_id=? AND status IN ('draft','review','approved')) AND COALESCE((SELECT MAX(version_number) FROM policy_versions WHERE policy_id=?),0)=? AND NOT EXISTS(SELECT 1 FROM ai_operating_policy WHERE id='default' AND drafts_enabled=0)", values: [v.policyId, v.policyId, params.number - 1] });
            await commitLifecycle(db, lifecycleClaim(db, 'policy_documents', 'updated_by=?,updated_at=?', [actor.email, now], policy, all), [insertDraftVersion(db, v, p.id, params.number, await digest(v.content), actor.email, now), lifecycleInsert(db, 'policy_events', { id: crypto.randomUUID(), policy_id: v.policyId, version_id: p.id, action: 'version-create', detail: 'Regulatory gap draft ' + params.analysisId, actor: actor.email, created_at: now }), applied(db, p, { id: p.id, code: params.code, policyId: v.policyId, module: 'Politika Merkezi', version: params.number })]);
        }
        else if (p.kind === 'regulatory-capa') {
            const selection = await prepareWorkflowSelection({ DB: db }, actor, { ...params.finding, assignmentMode: 'directory' }, { owner: 'writer', reviewer: 'reviewer' }), source = await resolveFindingSource(db, 'regulatory', params.finding.sourceRef), finding = validateFinding({ ...params.finding, ...selection.body });
            await insertFinding(db, finding, { id: p.id, code: 'FND-' + p.id, actor: actor.email, stamp: now, guard: joinWorkflowGuards(guard, selection.guard, source.guard), afterCreate: [applied(db, p, { id: p.id, module: 'Bulgular ve CAPA' })] });
        }
        else
            throw new AgenticError('AI_ACTION');
    }
    catch (e) {
        const current = await db.prepare("SELECT status FROM ai_hitl_proposals WHERE id=?").bind(p.id).first<{
            status: string;
        }>();
        if (current?.status === 'applied')
            return;
        throw e instanceof AgenticError ? e : new AgenticError('AI_STALE', 409);
    }
}
