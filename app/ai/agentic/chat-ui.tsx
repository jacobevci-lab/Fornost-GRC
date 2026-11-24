'use client';
import { useEffect, useState } from 'react';
import { navigateToFornost } from '../../navigation-focus';
import { WorkflowPersonPicker } from '../../workflow-selection-fields';
import { Notice, useOperation } from '../grc/ui-common';
import { agentApi, agentMessage, ApprovalCard, type Card } from './ui-shared';
import type { Lang } from '../grc/domain';
type Answer = {
    answer?: string;
    sources?: {
        id: string;
        ref: string;
        module: string;
        title: string;
    }[];
    asOf?: string;
    coverage?: {
        module: string;
        loaded: number;
        limited: boolean;
    }[];
    mode?: string;
    proposal?: Card;
    choices?: {
        id: string;
        code: string;
        title: string;
    }[];
};
export default function AgenticChat({ lang, initialPrompt = '', user }: {
    lang: Lang;
    initialPrompt?: string;
    user: {
        email: string;
        role: string;
    };
}) {
    const tr = lang === 'tr', t = (a: string, b: string) => tr ? a : b, op = useOperation(lang), [question, setQuestion] = useState(initialPrompt), [history, setHistory] = useState<{
        question: string;
        response: Answer;
    }[]>([]), [pending, setPending] = useState<Card[]>([]), [assetId, setAsset] = useState(''), [owner, setOwner] = useState(user.email), [title, setTitle] = useState('');
    useEffect(() => { let active = true; agentApi().then(d => { if (active)
        setPending(d.items); }).catch(() => { }); return () => { active = false; }; }, [user.email]);
    async function send() { if (!question.trim())
        return; try {
        const response = await agentApi({ action: 'query', question, lang, assetId, owner, title });
        setHistory(h => [...h, { question, response }]);
        if (!response.choices)
            setQuestion('');
        setAsset('');
    }
    catch (e) {
        op.setNotice(agentMessage(e, lang));
    } }
    return <section className="grc-ai agent-chat"><header><span className="agent-eyebrow">CONNECTED GRC · HITL</span><h3>{t('Analiz et. İncele. Onayla.', 'Analyze. Review. Approve.')}</h3><p>{t('Canlı kaynaklarla analiz; kayıt oluşturmadan önce onay kartı.', 'Analyze current sources; review an approval card before records are created.')}</p></header>
 <div className="fornost-ai-messages" aria-live="polite">{!history.length && !pending.length && <div className="agent-starters">{[t('Tüm modüllerde açık riskleri ve öncelikleri özetle', 'Summarize open risks and priorities across modules'), t('SLA süresi geçen bulgular için hatırlatma aç', 'Create reminders for SLA overdue findings'), t('Entra ID varlığı için yüksek erişim riski taslağı oluştur', 'Create a high access risk draft for the Entra ID asset')].map(q => <button key={q} onClick={() => setQuestion(q)}>{q}</button>)}</div>}
 {pending.map(p => <ApprovalCard key={p.id} initial={p} lang={lang}/>)}
 {history.map((entry, i) => <article className="agent-answer" key={i}><p><b>{entry.question}</b></p>{entry.response.answer && <p className="grc-ai-text">{entry.response.answer}</p>}<div className="grc-ai-actions">{entry.response.sources?.map(s => <button key={s.id} title={s.title} onClick={() => navigateToFornost({ module: s.module, ref: s.ref, kind: s.module === 'AI Yönetişimi' ? 'ai-model' : s.module === 'Bulgular ve CAPA' ? 'finding' : s.module === 'Risk İştahı ve KRI' ? 'appetite' : undefined, source: 'ask-fornost' })}>{s.id}</button>)}</div>{entry.response.asOf && <small>{new Date(entry.response.asOf).toLocaleString(tr ? 'tr-TR' : 'en-GB')} · {entry.response.mode === 'rules' ? t('Yerel kurallar', 'Local rules') : t('Yapılandırılmış AI sağlayıcısı', 'Configured AI provider')}</small>}{entry.response.coverage && <details><summary>{t('Analiz kapsamı', 'Analysis coverage')}</summary><p>{t('Modül başına en fazla 500 güncel kayıt ve yanıtta 32 kaynak. Veri sınıfı nedeniyle hariç tutulan kayıtlar olabilir; toplam sonuçlar kurumun tamamını temsil etmeyebilir.', 'Up to 500 recent records per module and 32 cited sources. Classification may exclude records; totals may not represent the entire organisation.')}</p>{entry.response.coverage.map(c => <p key={c.module}>{c.module}: {c.loaded}{c.limited ? ' +' : ''}</p>)}</details>}{entry.response.choices && <label>{t('Varlık seç', 'Select asset')}<select aria-label={t('Varlık seç', 'Select asset')} value={assetId} onChange={e => { setAsset(e.target.value); setQuestion(entry.question); }}><option value="">—</option>{entry.response.choices.map(a => <option key={a.id} value={a.id}>{a.code} · {a.title}</option>)}</select></label>}{entry.response.proposal && <ApprovalCard initial={entry.response.proposal} lang={lang}/>}</article>)}
 </div><Notice {...op} lang={lang}/><form className="fornost-ai-compose" onSubmit={e => { e.preventDefault(); void op.run(send); }}><label>{t('Soru veya aksiyon talebi', 'Question or action request')}<textarea aria-label={t('Soru veya aksiyon talebi', 'Question or action request')} value={question} onChange={e => setQuestion(e.target.value)} maxLength={4000} rows={3} required/></label>{user.role !== 'Viewer' && <details><summary>{t('Risk taslağı alanları', 'Risk draft fields')}</summary><label>{t('Başlık (isteğe bağlı)', 'Title (optional)')}<input aria-label={t('Başlık (isteğe bağlı)', 'Title (optional)')} value={title} onChange={e => setTitle(e.target.value)} maxLength={200}/></label><WorkflowPersonPicker tr={tr} label={t('Risk sahibi', 'Risk owner')} value={owner} onChange={setOwner}/></details>}<button className="primary" disabled={op.busy || !question.trim()}>{t('Gönder', 'Send')}</button></form></section>;
}
export function AgentReminders({ lang }: {
    lang: Lang;
}) {
    const [items, setItems] = useState<{
        id: string;
        finding_id: string;
        finding_code: string;
        title: string;
        note: string;
        due_date: string;
    }[]>([]), op = useOperation(lang), tr = lang === 'tr';
    const load = async () => setItems((await agentApi(undefined, '?kind=reminders')).items);
    useEffect(() => { let active = true; agentApi(undefined, '?kind=reminders').then(d => { if (active)
        setItems(d.items); }).catch(() => { }); return () => { active = false; }; }, []);
    if (!items.length)
        return null;
    return <section className="grc-ai"><h3>{tr ? 'Ask Fornost hatırlatmalarım' : 'My Ask Fornost reminders'}</h3><Notice {...op} lang={lang}/>{items.map(r => <article className="agent-answer" key={r.id}><button onClick={() => navigateToFornost({ module: 'Bulgular ve CAPA', ref: r.finding_id, kind: 'finding' })}>{r.finding_code} · {r.title}</button><p>{r.note}</p><small>{r.due_date}</small><div className="grc-ai-actions"><button disabled={op.busy} onClick={() => void op.run(async () => { await agentApi({ action: 'complete-reminder', id: r.id }); await load(); })}>{tr ? 'Hatırlatmayı tamamla' : 'Complete reminder'}</button></div></article>)}</section>;
}
