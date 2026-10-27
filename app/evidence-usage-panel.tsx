"use client";
import { useEffect, useState } from 'react';
import {EvidenceChangeFollowupPanel} from './evidence-change-followup-panel';
import type {EvidenceChangeSource} from './evidence/change-followups';
import { domainStatusLabel } from './domain-identity';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import { usageNeedsReview, type EvidenceUsage, type UsageSource } from './evidence/usage';
import './evidence-usage.css';

const sourceNames: Record<UsageSource, [string, string]> = {
  controls: ['Kontrol ve uyum bağlantıları', 'Control and compliance links'], requirements: ['Denetim maddeleri', 'Audit requirements'],
  requests: ['Kanıt talepleri', 'Evidence requests'], workpapers: ['Çalışma kâğıtları', 'Workpapers'], findings: ['Bulgular ve CAPA', 'Findings and CAPA'],
  continuity: ['Süreklilik kararları', 'Continuity decisions'], regulatory: ['Regülasyon kararları', 'Regulatory decisions'],
};
const statusNames: Record<string, [string, string]> = { 'Başlanmadı': ['Başlanmadı', 'Not started'], draft: ['Taslak', 'Draft'], submitted: ['İncelemede', 'In review'], accepted: ['Kabul edildi', 'Accepted'], approved: ['Onaylandı', 'Approved'], cancelled: ['İptal edildi', 'Cancelled'], assigned: ['Atandı', 'Assigned'], changes_requested: ['Düzeltme bekliyor', 'Changes requested'], open: ['Açık', 'Open'], closed: ['Kapalı', 'Closed'], 'in-progress': ['Devam ediyor', 'In progress'], 'pending-verification': ['Doğrulama bekliyor', 'Pending verification'] };
const decisionNames = {'exercise-result':['Tatbikat sonucu','Exercise result'],'gap-closure':['İyileştirme kapanışı','Gap closure'],'impact-submit':['Doğrulamaya gönderim','Submitted for verification'],'impact-verify':['Bağımsız doğrulama','Independent verification']} as const;
type Choice = { id: string; code?: string; data: Record<string, unknown> };
export function EvidenceUsagePanel({ lang, records, focusedId = '' }: { lang: 'tr' | 'en'; records: Choice[]; focusedId?: string }) {
  const [open, setOpen] = useState(false);
  const [followup,setFollowup]=useState<{kind:EvidenceChangeSource;id:string}|null>(null);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: EvidenceUsage | null; error: string } | null>(null);
  const [filter, setFilter] = useState('all');
  const [sourceFilter,setSourceFilter]=useState('all');
  const [query, setQuery] = useState('');
  const tr = lang === 'tr', t = (a: string, b: string) => tr ? a : b;
  const evidenceId = records.some(r => r.id === selected) ? selected : records.some(r => r.id === focusedId) ? focusedId : records[0]?.id || '';
  const requestKey = `${evidenceId}:${revision}`;
  const loading = open && !!evidenceId && result?.key !== requestKey;
  const error = result?.key === requestKey ? result.error : '';
  useEffect(() => {
    if (!open || !evidenceId) return;
    const controller = new AbortController();let live=true;
    const timeout=setTimeout(()=>controller.abort(),15000);
    fetch(withBasePath(`/api/evidence/usage?id=${encodeURIComponent(evidenceId)}`), { cache: 'no-store', signal: controller.signal })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'unavailable'); return body as EvidenceUsage; })
      .then(body => { if (live&&!controller.signal.aborted) setResult({ key: requestKey, data: body, error: '' }); })
      .catch(err => { if (live) setResult({ key: requestKey, data: null, error: err.message }); }).finally(()=>clearTimeout(timeout));
    return () => {live=false;clearTimeout(timeout);controller.abort()};
  }, [open, evidenceId, requestKey]);
  const current = result?.key === requestKey && result.data?.evidence.id === evidenceId ? result.data : null;
  const incompleteSources=(current?.sources||[]).filter(source=>source.state!=='complete');
  const rows = (current?.rows || []).filter(row => (filter !== 'review' || usageNeedsReview(row)) && (filter !== 'historical' || row.historical)
    && (sourceFilter==='all'||row.source===sourceFilter) && `${row.title} ${row.owner} ${row.target.ref||row.id} ${row.decision?.actor||''}`.toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang)));
  function download() {
    if (!current) return;
    const blob = new Blob([JSON.stringify({ format: 'fornost-evidence-usage-v1', scope: 'Current references and retained continuity/regulatory decisions; general historical reports/events and file contents excluded. Source limits and access restrictions apply. No automatic reassessment or approval.', ...current }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `evidence-usage-${current.evidence.code}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="eu-panel module-analysis-disclosure" open={open} onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setRevision(r => r + 1); }}>
    <summary><span><b>{t('Kullanım ve değişiklik etkisi', 'Usage and change impact')}</b><small>{t('Kanıtın bağlı olduğu kayıtları ve sabit sürümleri inceleyin.', 'Review linked records and pinned evidence versions.')}</small></span></summary>
    {open && <section className="eu-content" aria-label={t('Kanıt kullanım analizi', 'Evidence usage analysis')} aria-busy={loading}>
      <div className="eu-tools"><label>{t('Kanıt kaydı', 'Evidence record')}<select aria-label={t('Kullanımı incelenecek kanıt', 'Evidence to inspect')} value={evidenceId} onChange={event => { setSelected(event.target.value); setFollowup(null); setFilter('all');setSourceFilter('all'); setQuery(''); }}>
        {!records.length && <option value="">{t('Kanıt kaydı yok', 'No evidence records')}</option>}
        {records.map(row => <option key={row.id} value={row.id}>{row.code || row.id} · {String(row.data.evidenceTitle || row.id)}</option>)}
      </select></label><button type="button" disabled={loading || !evidenceId} onClick={() => setRevision(r => r + 1)}>{t('Kullanımı yenile', 'Refresh usage')}</button><button type="button" disabled={!current || loading} onClick={download}>{t('Kullanım raporunu indir', 'Download usage report')}</button></div>
      <p className="eu-note">{t('Yeni dosya, eski sürüme bağlı işleri otomatik olarak değiştirmez. Açık işlerdeki eski veya doğrulanamayan sürümleri inceleyin; yeniden sunma ve onay kararları ilgili işte verilir.', 'A new file does not automatically change work pinned to an earlier version. Review older or unverified pins in open work; resubmission and approval decisions remain in the linked workflow.')}</p>
      {loading && <p role="status">{t('Kullanım kaynakları kontrol ediliyor…', 'Checking usage sources…')}</p>}
      {error && <p role="alert">{error === 'changed' ? t('Kanıt okuma sırasında değişti. Kullanımı yenileyin.', 'The evidence changed while loading. Refresh usage.') : t('Kullanım bilgisi alınamadı. Yeniden deneyin.', 'Unable to load usage. Try again.')}</p>}
      {current && <>
        <div className="eu-summary"><b>{current.evidence.title}</b><span>{current.evidence.versionNo ? `v${current.evidence.versionNo}` : t('Sürüm zinciri yok', 'No version chain')} · {t('Görünen kullanım', 'Visible uses')}: {current.rows.length} · {t('Açık işlerde incelenecek', 'Open work to review')}: {current.rows.filter(usageNeedsReview).length}</span><small>{t('Kontrol zamanı', 'Checked')}: {new Date(current.checkedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}</small></div>
        <details className="eu-coverage"><summary><b>{t('Kaynak kapsamı','Source coverage')}</b><span>{current.sources.length-incompleteSources.length}/{current.sources.length} {t('tamamlandı','complete')}</span></summary><div className="eu-coverage-content">
        <ul className="eu-sources" aria-label={t('Kaynak kapsamı', 'Source coverage')}>{current.sources.map(source => <li key={source.key} data-state={source.state}><b>{sourceNames[source.key][tr ? 0 : 1]}</b><span>{source.state === 'complete' ? t('Tamamlandı', 'Complete') : source.state === 'restricted' ? t('Erişim kapsamı dışında', 'Outside access scope') : source.state === 'unavailable' ? t('Alınamadı; sonuç bilinmiyor', 'Unavailable; result unknown') : t('Sınırlı tarama veya erişim', 'Limited scan or access')}</span><small>{t('Okuma sınırı', 'Read limit')}: {source.limit}</small></li>)}</ul>
        <p className="eu-note">{t('Denetim maddeleri ve CAPA için son 1.000 kayıt; talepler, çalışma kâğıtları ve her karar kaynağı için bu kanıta bağlı son 200 kayıt taranır. Süreklilik ve regülasyon kararları geçmişteki kullanımı gösterir; güncel onay anlamına gelmez. Genel rapor/olay arşivi ve serbest metin taranmaz. Sınırlı veya alınamayan kaynaklarda sıfır sonuç, kullanım olmadığı anlamına gelmez.', 'Scans the latest 1,000 requirements and CAPA records, and 200 matching records per request, workpaper or decision source. Continuity and regulatory decisions show past use, not current approval. General report/event archives and free text are excluded. Zero results from limited or unavailable sources do not establish absence of usage.')}</p>
        </div></details>
        {incompleteSources.length>0&&<p className="eu-warning" role="status">{t('Kapsamı eksik veya erişim dışında kalan kaynaklar','Sources with incomplete coverage or restricted access')}: {incompleteSources.map(source=>sourceNames[source.key][tr?0:1]).join(', ')}. {t('Ayrıntılar için Kaynak kapsamı bölümünü açın; sıfır sonuç, kullanım olmadığı anlamına gelmez.','Open Source coverage for details; zero results do not establish absence of usage.')}</p>}
        {current.unresolvedControls.length > 0 && <p className="eu-warning" role="status">{t('Kesin eşleştirilemeyen kontrol referansları', 'Unresolved control references')}: {current.unresolvedControls.join(', ')}</p>}
        <div className="eu-tools"><label>{t('Kaynak türü','Source type')}<select aria-label={t('Kullanım kaynağı','Usage source')} value={sourceFilter} onChange={event=>setSourceFilter(event.target.value)}><option value="all">{t('Tüm kaynaklar','All sources')}</option>{current.sources.map(source=><option key={source.key} value={source.key}>{sourceNames[source.key][tr?0:1]}</option>)}</select></label><label>{t('Göster', 'Show')}<select aria-label={t('Kullanım filtresi', 'Usage filter')} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('Tüm kullanımlar', 'All uses')}</option><option value="review">{t('Açık işlerde incelenecek', 'Open work to review')}</option><option value="historical">{t('Korunan geçmiş', 'Preserved history')}</option></select></label><label>{t('Kullanımlarda ara', 'Search uses')}<input aria-label={t('Kullanımlarda ara', 'Search uses')} value={query} onChange={event => setQuery(event.target.value)} /></label></div>
        {followup&&<EvidenceChangeFollowupPanel key={`${evidenceId}:${followup.kind}:${followup.id}`} evidenceId={evidenceId} sourceKind={followup.kind} sourceId={followup.id} tr={tr} onClose={()=>{const target=document.getElementById(`evidence-followup-${followup.kind}-${followup.id}`);setFollowup(null);target?.focus();}}/>}
        <div className="eu-list">{rows.map(row => <article key={`${row.source}:${row.id}`} data-review={usageNeedsReview(row)}>
          <div><small>{sourceNames[row.source][tr ? 0 : 1]}</small><h4>{row.title}</h4><p>{row.owner || '—'} · {statusNames[row.status]?.[tr ? 0 : 1] || domainStatusLabel(row.status, lang) || '—'}{row.dueDate ? ` · ${row.dueDate}` : ''}</p><code>{row.target.ref||row.id}</code>{row.decision&&<div className="eu-decision"><b>{decisionNames[row.decision.purpose][tr?0:1]}</b><span>{t('Karar veren','Decision by')}: {row.decision.actor}</span><time dateTime={row.decision.createdAt}>{Number.isFinite(Date.parse(row.decision.createdAt))?new Date(row.decision.createdAt).toLocaleString(tr?'tr-TR':'en-GB'):'—'}</time>{!row.decision.sourceAvailable&&<strong>{t('Kaynak kayda erişilemiyor; karar kanıtı korunuyor.','Source record unavailable; decision evidence is retained.')}</strong>}</div>}</div>
          <div className="eu-pins">{row.pins.length ? row.pins.map((pin, index) => <span key={`${pin.id}:${index}`} data-state={pin.state}>v{pin.versionNo || '?'} · {pin.state === 'current' ? t('Güncel sürüm sabitlenmiş', 'Current version pinned') : pin.state === 'older' ? t('Önceki sürüm sabitlenmiş', 'Earlier version pinned') : t('Sürüm doğrulanamadı', 'Version unverified')}</span>) : <span>{t('Kayıt bağlantısı · sürüm sabitlenmemiş', 'Record link · no version pin')}</span>}{row.historical && <small>{row.decision?t('Karar kanıtı korunur; işin güncel durumu yukarıdadır.','Decision evidence is retained; the live workflow state is shown above.'):t('Onaylı/kapalı iş; sabit kayıt korunur.', 'Approved/closed work; pinned record is preserved.')}</small>}{usageNeedsReview(row) && <strong>{t('Açık işte inceleyin', 'Review in open work')}</strong>}</div>
          <div className="eu-row-actions"><button type="button" disabled={row.decision?.sourceAvailable===false} aria-label={`${t('Kaydı aç', 'Open record')}: ${row.title}`} onClick={() => navigateToFornost(row.target)}>{t('Kaydı aç', 'Open record')} ↗</button>{current.canPlanReview&&['requests','workpapers'].includes(row.source)&&row.pins.length>0&&<button id={`evidence-followup-${row.source}-${row.id}`} type="button" aria-label={`${t('İnceleme görevi','Review task')}: ${row.title}`} onClick={()=>setFollowup({kind:row.source as EvidenceChangeSource,id:row.id})}>{t('İnceleme görevi','Review task')}</button>}</div>
        </article>)}</div>
        {!rows.length && <p role="status">{t('Bu kapsam ve filtrede eşleşen kullanım yok.', 'No matching uses within this scope and filter.')}</p>}
      </>}
    </section>}
  </details>;
}
