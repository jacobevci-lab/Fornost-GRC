import { parseCsv } from '../grc/domain';
export type Wizard = {
    prohibited: string;
    uses: string[];
    product: string;
    effect: string;
    interaction: string;
    role: string;
    scope: string;
    rationale: string;
};
export const blankWizard: Wizard = { prohibited: '', uses: [], product: '', effect: '', interaction: '', role: '', scope: '', rationale: '' };
export const options = {
    prohibited: [['none', 'Hiçbiri', 'None'], ['harm', 'Zarar verici manipülasyon / hassasiyet sömürüsü', 'Harmful manipulation / exploitation'], ['social', 'Hukuka aykırı sosyal puanlama', 'Unlawful social scoring'], ['emotion', 'İş / eğitimde duygu çıkarımı (tıbbi / güvenlik hariç)', 'Work / education emotion inference (except medical / safety)'], ['sensitive', 'Hassas özelliklerden biyometrik kategorizasyon', 'Sensitive biometric categorisation'], ['scraping', 'Hedefsiz yüz görüntüsü toplama', 'Untargeted facial image scraping'], ['crime', 'Yalnız profillemeye dayalı suç tahmini', 'Crime prediction solely from profiling'], ['remote', 'Kolluk için gerçek zamanlı uzaktan biyometri — istisna incelemesi', 'Real-time remote law-enforcement biometrics — exception review'], ['intimate', 'Rıza dışı mahrem içerik / çocuk istismarı içeriği üretimi', 'Non-consensual intimate / child abuse content generation'], ['unknown', 'Bilinmiyor', 'Unknown']],
    uses: [['none', 'Listelenen kullanım yok', 'No listed use'], ['hr', 'İşe alım / çalışan değerlendirme', 'Recruitment / worker assessment'], ['credit', 'Gerçek kişi kredi skorlama (dolandırıcılık tespiti hariç)', 'Natural-person credit scoring (excluding fraud detection)'], ['infrastructure', 'Kritik altyapı güvenlik bileşeni', 'Critical infrastructure safety component'], ['biometric', 'Uzaktan biyometrik tanıma (yalnız 1:1 doğrulama hariç)', 'Remote biometric identification (excluding verification only)'], ['education', 'Eğitim erişimi / değerlendirmesi', 'Education access / assessment'], ['public', 'Kamu yardımı / acil hizmet triyajı', 'Public benefits / emergency triage'], ['insurance', 'Hayat / sağlık sigortası risk değerlendirmesi', 'Life / health insurance risk assessment'], ['justice', 'Kolluk / göç / adalet / demokratik süreç', 'Law enforcement / migration / justice / democratic process'], ['unknown', 'Bilinmiyor', 'Unknown']],
    product: [['no', 'Hayır', 'No'], ['yes', 'Ek I ürünü / güvenlik bileşeni ve sağlık-güvenlik için üçüncü taraf uygunluk değerlendirmesi', 'Annex I product / safety component with third-party health/safety conformity assessment'], ['unknown', 'Bilinmiyor / yalnız güvenlik dışı uygunluk değerlendirmesi', 'Unknown / non-safety conformity assessment only']],
    effect: [['material', 'Karar sonucunu etkiler', 'Material influence on decisions'], ['profiling', 'Gerçek kişileri profiller', 'Profiles natural persons'], ['procedural', 'Dar prosedür / hazırlık istisnası iddiası — uzman doğrulasın', 'Narrow procedural / preparatory exception claimed — expert review'], ['none', 'Karar etkisi yok', 'No decision influence'], ['unknown', 'Bilinmiyor', 'Unknown']],
    interaction: [['none', 'Yok', 'None'], ['bot', 'İnsanlarla etkileşen bot', 'Bot interacting with people'], ['synthetic', 'Sentetik / deepfake içerik', 'Synthetic / deepfake content'], ['emotion', 'İzin verilen duygu / biyometri kullanımı', 'Permitted emotion / biometric use'], ['unknown', 'Bilinmiyor', 'Unknown']],
    role: [['deployer', 'Kullanıcı kurum', 'Deployer'], ['provider', 'Sağlayıcı', 'Provider'], ['both', 'Her ikisi', 'Both'], ['unknown', 'Bilinmiyor / diğer rol', 'Unknown / another role']],
    scope: [['yes', 'AB kapsamı doğrulandı', 'EU scope confirmed'], ['outside', 'AB dışında — uzman kapsam incelemesi', 'Outside EU — expert scope review'], ['unknown', 'Bilinmiyor', 'Unknown']]
} as const;
export const legalSources = ['article-5', 'article-6', 'annex-3', 'article-26', 'article-27', 'article-50'].map(x => 'https://ai-act-service-desk.ec.europa.eu/en/ai-act/' + x);
export function classifyWizard(input: Wizard, tr: boolean, today = new Date().toISOString().slice(0, 10)) {
    if (!input || Object.entries(options).some(([key, values]) => key === 'uses' ? !Array.isArray(input.uses) || !input.uses.length || input.uses.some(v => !values.some(o => o[0] === v)) : !values.some(o => o[0] === input[key as keyof Wizard])))
        throw new Error('AI_WIZARD');
    if (input.uses.length > 1 && input.uses.some(v => ['none', 'unknown'].includes(v)))
        throw new Error('AI_WIZARD');
    const t = (a: string, b: string) => tr ? a : b, high = input.uses.some(v => !['none', 'unknown'].includes(v)) || input.product === 'yes';
    const uncertain = Object.values(input).some(v => v === 'unknown') || input.uses.includes('unknown') || input.scope !== 'yes' || input.effect === 'procedural' || input.prohibited === 'remote';
    const prohibited = !['none', 'unknown', 'remote'].includes(input.prohibited) && !(input.prohibited === 'intimate' && today < '2026-12-02');
    const risk = prohibited ? 'prohibited' : high ? 'high' : uncertain ? 'unresolved' : input.interaction !== 'none' ? 'limited' : 'minimal';
    const needsReview = uncertain || input.prohibited === 'intimate' && today < '2026-12-02';
    const checklist: {
        key: string;
        title: string;
        basis: string;
        applicability: 'required' | 'review';
    }[] = [{ key: 'scope', title: t('Kapsam, rol ve yürürlük tarihini doğrula', 'Verify scope, role and applicability dates'), basis: 'Art. 2 / 113', applicability: 'review' }, { key: 'literacy', title: t('AI okuryazarlığı ve yetkinlikleri belgele', 'Document AI literacy and competence'), basis: 'Art. 4', applicability: 'required' }];
    if (risk === 'prohibited')
        checklist.push({ key: 'stop', title: t('Kullanımı durdur; hukuk / uyum incelemesi başlat', 'Stop use; initiate legal / compliance review'), basis: 'Art. 5', applicability: 'required' });
    if (high) {
        if (['provider', 'both', 'unknown'].includes(input.role))
            checklist.push({ key: 'provider', title: t('Risk, veri, teknik dosya, kayıtlar, insan gözetimi, güvenlik ve uygunluk değerlendirmesi', 'Risk/data management, technical file, logs, human oversight, security and conformity assessment'), basis: 'Art. 9–17 / 43 / 49', applicability: input.role === 'unknown' ? 'review' : 'required' });
        if (['deployer', 'both', 'unknown'].includes(input.role))
            checklist.push({ key: 'deployer', title: t('Talimatlara uygun kullanım, yetkili gözetim, izleme ve olay bildirimleri', 'Use per instructions, competent oversight, monitoring and incident reporting'), basis: 'Art. 26', applicability: input.role === 'unknown' ? 'review' : 'required' }, { key: 'fria', title: t('Temel haklar etki değerlendirmesi uygulanabilirliğini incele (kamu hizmeti / kredi / sigorta)', 'Assess fundamental-rights impact assessment applicability (public service / credit / insurance)'), basis: 'Art. 27', applicability: 'review' });
    }
    if (input.effect === 'procedural')
        checklist.push({ key: 'exception', title: t('İstisna gerekçesini belgele; profilleme varsa yüksek risk korunur', 'Document exemption rationale; profiling keeps Annex III systems high risk'), basis: 'Art. 6(3–4)', applicability: 'review' });
    if (!['none', 'unknown'].includes(input.interaction))
        checklist.push({ key: 'transparency', title: t('AI etkileşimi / sentetik içerik için bildirim ve işaretleme kapsamını uygula', 'Implement applicable AI interaction / synthetic content disclosure and marking'), basis: 'Art. 50', applicability: 'required' });
    if (needsReview)
        checklist.push({ key: 'uncertainty', title: t('Belirsiz cevap ve istisnaları uzmanla çöz; düşük risk varsayma', 'Resolve unknowns and exceptions with an expert; do not assume low risk'), basis: 'Art. 2 / 5 / 6', applicability: 'review' });
    if (input.prohibited === 'intimate')
        checklist.push({ key: 'future-ban', title: t('2 Aralık 2026 hükümlerini ve kurumun içerik yasağını incele', 'Review 2 December 2026 provisions and the organisational content ban'), basis: 'Art. 5', applicability: 'review' });
    return { risk, needsReview, checklist, answers: { ...input, rationale: String(input.rationale || '').slice(0, 2000) }, sources: legalSources, ruleVersion: '2026-11-24', asOf: today, completed: [] as string[] };
}
export type Bom = {
    model: string;
    modelVersion: string;
    provider: string;
    vectorStore: string;
    dataBoundary: 'local' | 'cloud' | 'hybrid' | 'unknown';
    tools: {
        id: string;
        name: string;
        kind: 'mcp' | 'api';
        permission: 'none' | 'read' | 'write' | 'admin';
        scope: string;
        hitl: string;
    }[];
};
export function validateBom(b: Bom): Bom {
    if (!b || typeof b.model !== 'string' || !b.model.trim() || !['local', 'cloud', 'hybrid', 'unknown'].includes(b.dataBoundary) || !Array.isArray(b.tools) || b.tools.length > 30)
        throw new Error('AI_BOM');
    const clean = (s: unknown, n = 300) => String(s || '').trim().slice(0, n).replace(/\0/g, '');
    const tools = b.tools.map(t => { if (!t.name?.trim() || !t.scope?.trim() || !['mcp', 'api'].includes(t.kind) || !['none', 'read', 'write', 'admin'].includes(t.permission))
        throw new Error('AI_BOM'); return { id: clean(t.id) || crypto.randomUUID(), name: clean(t.name), kind: t.kind, permission: t.permission, scope: clean(t.scope, 800), hitl: clean(t.hitl, 800) }; });
    if (new Set(tools.map(t => t.id)).size !== tools.length)
        throw new Error('AI_BOM');
    return { model: clean(b.model), modelVersion: clean(b.modelVersion), provider: clean(b.provider), vectorStore: clean(b.vectorStore), dataBoundary: b.dataBoundary, tools };
}
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const known = ['chatgpt', 'openai', 'claude', 'anthropic', 'cursor', 'githubcopilot', 'microsoft365copilot', 'otterai', 'firefliesai', 'fathom', 'readai', 'granola', 'gemini', 'perplexity', 'notionai', 'windsurf', 'codeium'];
export type Discovery = {
    key: string;
    name: string;
    identity: string;
    domain: string;
    permissions: string;
    reason: 'catalog' | 'signal';
    row: number;
    status?: 'inventory-match' | 'unapproved' | 'already-discovered';
};
export function discoverCsv(content: string, mapping?: Record<string, number>) {
    if (content.length > 2000000)
        throw new Error('AI_LIMIT');
    const rows = parseCsv(content);
    if (rows.length < 2 || rows.length > 1001 || rows[0].length > 80)
        throw new Error('AI_CSV');
    const headers = rows[0].map(normalize), column = (key: string, names: string[]) => Number.isInteger(mapping?.[key]) ? Number(mapping![key]) : headers.findIndex(h => names.includes(h));
    const fields = { name: column('name', ['displayname', 'application', 'applicationname', 'appname', 'name', 'tool', 'merchant', 'merchantname', 'uygulama']), identity: column('identity', ['appid', 'applicationid', 'clientid', 'id']), domain: column('domain', ['domain', 'url', 'homepage', 'homepageurl', 'host', 'hostname', 'website']), permissions: column('permissions', ['scopes', 'permissions', 'oauthscopes', 'oauthpermissions', 'consentpermissions']) };
    if (fields.name < 0 && fields.domain < 0)
        return { headers: rows[0], needsMapping: true, candidates: [] as Discovery[], scanned: 0 };
    if (Object.values(fields).some(i => i >= headers.length || i < -1))
        throw new Error('AI_CSV');
    const candidates: Discovery[] = [], seen = new Set<string>();
    rows.slice(1).forEach((r, index) => { const value = (key: keyof typeof fields) => String(r[fields[key]] || '').trim().slice(0, 800), name = value('name'), domain = value('domain'), label = normalize(name + ' ' + domain), catalog = known.some(k => label.includes(k)), signal = /\b(ai|llm|gpt|copilot)\b|yapay zeka|code assistant|ai note/i.test(name + ' ' + domain); if (!catalog && !signal)
        return; const identity = value('identity') || normalize(domain) || normalize(name), key = normalize(identity); if (!key || seen.has(key))
        return; seen.add(key); candidates.push({ key, name: name || domain, identity, domain, permissions: value('permissions'), reason: catalog ? 'catalog' : 'signal', row: index + 2 }); });
    return { headers: rows[0], needsMapping: false, candidates, scanned: rows.length - 1 };
}
