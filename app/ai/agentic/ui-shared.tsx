'use client';
import { useState } from 'react';
import { withBasePath } from '../../base-path';
import { navigateToFornost } from '../../navigation-focus';
import { Notice, useOperation, errorText } from '../grc/ui-common';
import type { Lang } from '../grc/domain';
import '../grc/grc-ai.css';
import './workspace.css';
export async function agentApi(body?: unknown, query = '', deep = false) { const response = await fetch(withBasePath('/api/ai/' + (deep ? 'deep-governance' : 'agentic') + query), { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const data = await response.json(); if (!response.ok)
    throw new Error(data.code || 'AI_FAILED'); return data; }
export type Card = {
    id: string;
    kind: string;
    params: Record<string, unknown>;
    revision: string;
    status: string;
    expiresAt: string;
    result?: {
        id?: string;
        policyId?: string;
        module?: string;
        code?: string;
        count?: number;
    };
};
export const agentMessage = (e: unknown, lang: Lang) => { const messages: Record<string, [
    string,
    string
]> = { AI_TOOL_DENIED: ['Bu araç tanımlı değil. AI kanıt/tedarikçi onaylayamaz veya CAPA kapatamaz.','This tool is unavailable. AI cannot approve evidence/vendors or close CAPA.'], AI_SOD: ['Bağımsız doğrulayıcı, talep eden ve aksiyon sahibinden farklı bir Admin olmalıdır.','The independent verifier must be an Admin different from requester and action owner.'], AI_SCOPE: ['Bu kayıt veya işlem için modül/kurum yetkiniz yok.','You lack module/entity permission for this record or action.'], AI_EXPIRED: ['Onay kartının süresi doldu. Güncel kaynaklarla yeniden oluşturun.', 'Approval card expired. Generate it again from current sources.'], AI_LIMIT: ['Analiz sınırı aşıldı. Dosya veya kaynak kapsamını küçültün.', 'Analysis limit exceeded. Reduce the file or source scope.'], AI_POLICY_DRAFT: ['Bu politikanın tamamlanmamış bir sürümü var. Önce onu tamamlayın.', 'This policy already has an unfinished version. Complete it first.'], AI_OPERATION_BLOCKED: ['AI işlemi yönetici ayarlarında kapalı.', 'This AI operation is disabled by the administrator.'], AI_EMERGENCY_STOP: ['AI operasyonları durdurulmuş.', 'AI operations are stopped.'], AI_FIELDS: ['Zorunlu alanları ve kayıt referanslarını kontrol edin.', 'Check required fields and record references.'], AI_PEOPLE: ['Aktif bir dizin kullanıcısı seçin.', 'Select an active directory user.'], AI_WIZARD: ['Beş sorunun tamamını yanıtlayın; belirsizse Bilinmiyor seçin.', 'Answer all five questions; select Unknown where uncertain.'], AI_BOM: ['Modeli ve araçların yetki kapsamını doldurun.', 'Enter the model and each tool’s permission scope.'] }; return messages[e instanceof Error ? e.message : '']?.[lang === 'tr' ? 0 : 1] || errorText(e, lang); };
function value(v: unknown): string { return Array.isArray(v) ? v.map(value).join(' · ') : v && typeof v === 'object' ? Object.entries(v).map(([k, v]) => `${k}: ${value(v)}`).join('\n') : String(v ?? '—'); }
export function ApprovalCard({ initial, lang, onChange }: {
    initial: Card;
    lang: Lang;
    onChange?: (c: Card) => void;
}) {
    const [card, setCard] = useState(initial), [edited,setEdited]=useState<Record<string,unknown>|null>(null), op = useOperation(lang), tr = lang === 'tr', t = (a: string, b: string) => tr ? a : b, p = card.params, data = (p.data || p.finding || p.version || {}) as Record<string, unknown>;
    const operate = (action: string) => void op.run(async () => { try {
        const result = await agentApi({ action, id: card.id, revision: card.revision, confirm: action === 'apply', lang });
        const next = action === 'apply' ? result : { ...card, status: 'cancelled' };
        setCard(next);
        onChange?.(next);
    }
    catch (e) {
        op.setNotice(agentMessage(e, lang));
    } });
    return <article className="agent-card" data-testid="hitl-card"><header><span className="agent-eyebrow">{t('İNSAN ONAYI GEREKİYOR', 'HUMAN APPROVAL REQUIRED')}</span><h3>{String(p.title || t('Önerilen aksiyon', 'Proposed action'))}</h3></header>
 {card.kind.startsWith('tool:') ? <ToolCardFields data={edited||data} lang={lang} disabled={op.busy||card.status!=='pending'} onChange={setEdited}/> : card.kind === 'reminders' ? <><p>{t('Kurum içi görev hatırlatması; e-posta veya sohbet mesajı göndermez.', 'Internal work reminder; no email or chat message is sent.')}</p><p>{String(p.note)}</p><p>{t('Termin', 'Due')}: {String(p.dueDate)}</p><ul>{(p.items as {
        id: string;
        code: string;
        title: string;
        owner: string;
        dueDate: string;
    }[]).map(r => <li key={r.id}><b>{r.code} · {r.title}</b><br />{r.owner} · {r.dueDate}</li>)}</ul></> : <><dl className="agent-fields">{Object.entries(data).filter(([k]) => !['content', 'description','ownerSource','aiOrigin','policyId'].includes(k)).map(([k, v]) => <div key={k}><dt>{({ title: t('Başlık', 'Title'), owner: t('Sahip', 'Owner'), ownerEmail: t('Sahip e-posta', 'Owner email'), reviewer: t('Bağımsız doğrulayıcı', 'Independent reviewer'), asset: t('Varlık', 'Asset'), status: t('Durum', 'Status'), inherentLikelihood: t('Olasılık', 'Likelihood'), inherentImpact: t('Etki', 'Impact'), dueDate: t('Termin', 'Due date'), correctiveAction: t('Düzeltici aksiyon', 'Corrective action'), rootCause: t('Kök neden', 'Root cause'), preventiveAction: t('Önleyici aksiyon', 'Preventive action'), summary: t('Değişiklik özeti', 'Change summary'), effectiveDate: t('Yürürlük tarihi', 'Effective date') } as Record<string, string>)[k] || k}</dt><dd>{value(k === 'asset' ? p.assetCode || v : v)}</dd></div>)}</dl>{!!(data.content || data.description) && <details open><summary>{t('İçerik / açıklama', 'Content / description')}</summary><p className="grc-ai-text">{String(data.content || data.description)}</p></details>}{card.kind === 'risk' && <p className="grc-ai-note">{t('Başlangıç önerisi: 4 × 4. Risk değerlendirmesi ve onayı ayrıca yapılır.', 'Initial suggestion: 4 × 4. Risk assessment and approval remain separate.')}</p>}</>}
 <small>{t('Geçerlilik', 'Valid until')}: {new Date(card.expiresAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</small><Notice {...op} lang={lang}/>
 {edited&&card.status==='pending'&&<button disabled={op.busy} onClick={()=>void op.run(async()=>{try{const updated=await agentApi({action:'revise',id:card.id,revision:card.revision,patch:edited,lang});setCard(updated);setEdited(null);onChange?.(updated);}catch(e){op.setNotice(agentMessage(e,lang));}})}>{t('Değişiklikleri Kaydet','Save Changes')}</button>}
 {card.status === 'pending' ? <div className="grc-ai-actions"><button disabled={op.busy} onClick={() => operate('cancel')}>{t('Vazgeç', 'Cancel')}</button><button className="primary" disabled={op.busy||!!edited} onClick={() => operate('apply')}>{card.kind.startsWith('tool:')?t('Onayla ve Oluştur','Approve and Create'):t('Onayla ve Uygula', 'Approve and Apply')}</button></div> : <p role="status">{card.status === 'applied' ? t('Uygulandı · kullanıcı onayı denetim izine kaydedildi.', 'Applied · human approval recorded in audit log.') : t('İptal edildi.', 'Cancelled.')}</p>}
 {card.result?.module && <button onClick={() => navigateToFornost({ module: card.result!.module!, ref: card.result!.policyId || card.result!.id, kind: ['regulatory-capa','tool:propose_capa_draft'].includes(card.kind) ? 'finding' : card.kind === 'policy-draft' ? 'policy' : undefined, source: 'ask-fornost' })}>{card.result.code || t('Kaydı aç', 'Open record')}</button>}
 </article>;
}

function ToolCardFields({data,lang,disabled,onChange}:{data:Record<string,unknown>;lang:Lang;disabled:boolean;onChange:(data:Record<string,unknown>)=>void}){
 const tr=lang==='tr';const labels:Record<string,[string,string]>={title:['Başlık','Title'],source_code:['Kaynak kodu','Source code'],asset_code:['Varlık kodu','Asset code'],evidence_code:['Kanıt kodu','Evidence code'],owner:['Aksiyon sahibi e-posta','Action owner email'],reviewer:['Bağımsız doğrulayıcı e-posta','Independent reviewer email'],severity:['Önem','Severity'],dueDate:['Termin','Due date'],root_cause:['Kök neden','Root cause'],corrective_action:['Düzeltici aksiyon','Corrective action'],preventive_action:['Önleyici aksiyon','Preventive action'],description:['Açıklama','Description'],linked_risk_code:['Bağlı risk kodu','Linked risk code'],linked_control_code:['Bağlı kontrol kodu','Linked control code'],threat_summary:['Tehdit özeti','Threat summary'],likelihood:['Olasılık','Likelihood'],impact:['Etki','Impact'],score:['Ön inceleme güven skoru','Pre-review confidence'],findings:['Bulgular (satır başına bir)','Findings (one per line)'],recommendation:['Önerilen karar','Recommendation']};
 return <fieldset disabled={disabled} className="agent-tool-fields"><legend>{tr?'Önerilen Sistem Aksiyonu — Onay Kartı':'Proposed System Action — Approval Card'}</legend><p className="grc-ai-note">{tr?'Taslak / ön inceleme önerisi; doğrulanmış uyum veya onay değildir. Alanları düzenleyip kaydedin, ardından açıkça onaylayın.':'Draft / preliminary suggestion, not verified compliance or approval. Edit and save the fields, then explicitly confirm.'}</p>{Object.entries(data).map(([key,v])=>{const label=labels[key]?.[tr?0:1]||key;return <label key={key}>{label}{key==='severity'?<select aria-label={label} value={String(v)} onChange={e=>onChange({...data,[key]:e.target.value})}>{['low','medium','high','critical'].map((s,i)=><option key={s} value={s}>{tr?['Düşük','Orta','Yüksek','Kritik'][i]:s}</option>)}</select>:['likelihood','impact','score'].includes(key)?<input aria-label={label} type="number" min={key==='score'?0:1} max={key==='score'?100:5} value={Number(v)} onChange={e=>onChange({...data,[key]:Number(e.target.value)})}/>:['title','source_code','asset_code','evidence_code','owner','reviewer','dueDate','linked_risk_code','linked_control_code'].includes(key)?<input aria-label={label} type={key==='dueDate'?'date':['owner','reviewer'].includes(key)?'email':'text'} value={String(v??'')} maxLength={key==='title'?240:254} onChange={e=>onChange({...data,[key]:e.target.value})}/>:<textarea aria-label={label} rows={3} maxLength={3000} value={Array.isArray(v)?v.join('\n'):String(v??'')} onChange={e=>onChange({...data,[key]:key==='findings'?e.target.value.split('\n'):e.target.value})}/>}</label>;})}</fieldset>;
}
