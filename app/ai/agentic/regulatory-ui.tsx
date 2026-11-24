'use client';
import { useState } from 'react';
import { WorkflowPersonPicker } from '../../workflow-selection-fields';
import { Notice, useOperation } from '../grc/ui-common';
import { agentApi, agentMessage, ApprovalCard, type Card } from './ui-shared';
import type { Gap } from './regulatory';
type Analysis = {
    id: string;
    title: string;
    regulation: string;
    gaps: Gap[];
    hours: [
        number,
        number
    ];
    sourceMode: string;
    modelNotes: string | null;
    policyOptions: {
        id: string;
        code: string;
        text: string;
    }[];
};
export function RegulatoryAgent({ id, tr, user }: {
    id: string;
    tr: boolean;
    user: {
        role: string;
        email: string;
    };
}) {
    const lang = tr ? 'tr' : 'en', t = (a: string, b: string) => tr ? a : b, op = useOperation(lang), [open, setOpen] = useState(false), [regulatoryText, setText] = useState(''), [analysis, setAnalysis] = useState<Analysis | null>(null), [target, setTarget] = useState(''), [proposal, setProposal] = useState<Card | null>(null), [form, setForm] = useState(() => ({ policyId: '', summary: '', content: '', effectiveDate: new Date().toISOString().slice(0, 10), title: '', owner: user.email, reviewer: '', severity: 'medium', dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), rootCause: '', correctiveAction: '', preventiveAction: '' }));
    function field(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); setProposal(null); }
    async function run(action: () => Promise<void>) { try {
        await action();
    }
    catch (e) {
        op.setNotice(agentMessage(e, lang));
    } }
    return <section className="grc-ai"><button aria-expanded={open} onClick={() => setOpen(!open)}>{t('AI Etki ve Politika Boşluk Analizi Çalıştır', 'Run AI Impact and Policy Gap Analysis')}</button>{open && <><p className="grc-ai-note">{t('Ön değerlendirme; hukuki uygunluk kararı değildir. Yayındaki politika maddeleri ve aktif kontroller karşılaştırılır.', 'Preliminary assessment, not a legal compliance verdict. Compares published policy clauses and active controls.')}</p><label>{t('Tam düzenleyici metin (isteğe bağlı; boşsa kayıt özeti kullanılır)', 'Full regulatory text (optional; otherwise the record summary is used)')}<textarea rows={4} maxLength={60000} value={regulatoryText} onChange={e => setText(e.target.value)}/></label><button disabled={op.busy || user.role === 'Viewer'} onClick={() => void op.run(() => run(async () => { setAnalysis(await agentApi({ action: 'regulation-analysis', id, regulatoryText, lang })); setProposal(null); setTarget(''); }))}>{t('Analizi başlat', 'Start analysis')}</button><Notice {...op} lang={lang}/>
 {analysis && <><h4>{analysis.title}</h4><p>{analysis.sourceMode === 'record-summary' ? t('Kapsam: yalnız değişiklik kaydının özeti; tam metnin yerini tutmaz.', 'Scope: change record summary only; does not replace the full text.') : t('Kapsam: sağladığınız düzenleyici metin.', 'Scope: regulatory text you supplied.')}</p><p><b>{t('Tahmini inceleme iş yükü', 'Estimated review effort')}: {analysis.hours.join('–')} {t('saat', 'hours')}</b></p><small>{t('Varsayım: eşleşen gereksinim başına 2–6, eşleşmeyen için 4–12 saat. Uygulama, hukuk incelemesi ve bağımlılıklar ayrıca planlanır.', 'Assumption: 2–6 hours per matched requirement, 4–12 if unmatched. Implementation, legal review and dependencies require separate planning.')}</small>
 {analysis.gaps.map((g, i) => <article className="agent-answer" key={i}><h4>{t('Gereksinim', 'Requirement')} {i + 1}</h4><blockquote>{g.requirement}</blockquote>{g.matches.map((m, j) => <div key={j}><b>{m.code} · {t('Madde / paragraf', 'Clause / paragraph')} {m.clause}</b><blockquote>{m.quote}</blockquote></div>)}<p>{g.policyUpdate}</p><p>{g.controlNeed}</p><small>{g.hours.join('–')} {t('saat', 'hours')}</small></article>)}
 {analysis.modelNotes && <details><summary>{t('AI değerlendirme notları', 'AI assessment notes')}</summary><p className="grc-ai-text">{analysis.modelNotes}</p></details>}
 <div className="grc-ai-actions"><button disabled={!analysis.policyOptions.length} onClick={() => { setTarget('policy'); setProposal(null); }}>{t('Taslak Politika Güncellemesi', 'Draft Policy Update')}</button><button onClick={() => { setTarget('capa'); setProposal(null); setForm(f => ({ ...f, title: analysis.title, rootCause: t('Regülasyon değişikliği için kapsam ve boşluk doğrulaması gerekir.', 'Regulatory change requires applicability and gap verification.'), correctiveAction: analysis.gaps.map(g => g.controlNeed).join('\n').slice(0, 2000), preventiveAction: t('Regülasyon ve politika kontrol eşlemelerini periyodik gözden geçirin.', 'Periodically review regulatory, policy and control mappings.') })); }}>{t('CAPA görevi hazırla', 'Prepare CAPA task')}</button></div>{!analysis.policyOptions.length && <p>{t('Bu kapsamda yayındaki politika yok. Politika Merkezinde oluşturabilir veya CAPA açabilirsiniz.', 'No published policy in this scope. Create one in Policy Center or open a CAPA.')}</p>}
 {target && !proposal && <form className="agent-details" onSubmit={e => { e.preventDefault(); void op.run(() => run(async () => { const r = await agentApi({ action: 'regulation-proposal', analysisId: analysis.id, target, ...form, lang }); setProposal(r.proposal); })); }}>{target === 'policy' ? <><label>{t('Yayındaki politika', 'Published policy')}<select required value={form.policyId} onChange={e => { const p = analysis.policyOptions.find(p => p.id === e.target.value); setForm({ ...form, policyId: e.target.value, summary: t('Regülasyon etki analizi doğrultusunda önerilen güncelleme', 'Proposed update from regulatory impact analysis'), content: (p?.text || '') + '\n\n' + t('ÖNERİLEN EK MADDELER — DOĞRULAMA GEREKİR', 'PROPOSED ADDITIONS — VERIFICATION REQUIRED') + '\n' + analysis.gaps.map(g => g.requirement).join('\n') }); }}><option value="">—</option>{analysis.policyOptions.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label><label>{t('Değişiklik özeti', 'Change summary')}<input required minLength={10} value={form.summary} onChange={e => field('summary', e.target.value)}/></label><label>{t('Taslak içerik — mevcut maddeleri gözden geçirin', 'Draft content — review existing clauses')}<textarea required rows={10} minLength={80} maxLength={50000} value={form.content} onChange={e => field('content', e.target.value)}/></label><label>{t('Planlanan yürürlük', 'Planned effective date')}<input type="date" required value={form.effectiveDate} onChange={e => field('effectiveDate', e.target.value)}/></label></> : <><label>{t('CAPA başlığı', 'CAPA title')}<input required value={form.title} onChange={e => field('title', e.target.value)}/></label><WorkflowPersonPicker tr={tr} label={t('Sahip', 'Owner')} value={form.owner} exclude={[form.reviewer]} onChange={v => field('owner', v)}/><WorkflowPersonPicker tr={tr} label={t('Bağımsız doğrulayıcı', 'Independent reviewer')} value={form.reviewer} exclude={[form.owner, user.email]} onChange={v => field('reviewer', v)}/><label>{t('Önem', 'Severity')}<select value={form.severity} onChange={e => field('severity', e.target.value)}>{['low', 'medium', 'high', 'critical'].map((x, i) => <option key={x} value={x}>{tr ? ['Düşük', 'Orta', 'Yüksek', 'Kritik'][i] : x}</option>)}</select></label><label>{t('Termin', 'Due date')}<input required type="date" value={form.dueDate} onChange={e => field('dueDate', e.target.value)}/></label>{(['rootCause', 'correctiveAction', 'preventiveAction'] as const).map((k, i) => <label key={k}>{[t('Kök neden', 'Root cause'), t('Düzeltici aksiyon', 'Corrective action'), t('Önleyici aksiyon', 'Preventive action')][i]}<textarea required minLength={10} maxLength={3000} value={form[k]} onChange={e => field(k, e.target.value)}/></label>)}</>}<button disabled={op.busy}>{t('Onay kartını hazırla', 'Prepare approval card')}</button></form>}
 {proposal && <ApprovalCard key={proposal.id} initial={proposal} lang={lang}/>}</>}
 </>}</section>;
}
