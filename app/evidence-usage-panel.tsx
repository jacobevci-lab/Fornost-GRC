"use client";
import { useEffect, useState } from 'react';
import { domainStatusLabel } from './domain-identity';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import { usageNeedsReview, type EvidenceUsage, type UsageSource } from './evidence/usage';
import './evidence-usage.css';

const sourceNames: Record<UsageSource, [string, string]> = {
  controls: ['Kontrol ve uyum bağlantıları', 'Control and compliance links'], requirements: ['Denetim maddeleri', 'Audit requirements'],
  requests: ['Kanıt talepleri', 'Evidence requests'], workpapers: ['Çalışma kâğıtları', 'Workpapers'], findings: ['Bulgular ve CAPA', 'Findings and CAPA'],
};
const statusNames: Record<string, [string, string]> = { 'Başlanmadı': ['Başlanmadı', 'Not started'], draft: ['Taslak', 'Draft'], submitted: ['İncelemede', 'In review'], accepted: ['Kabul edildi', 'Accepted'], approved: ['Onaylandı', 'Approved'], cancelled: ['İptal edildi', 'Cancelled'], assigned: ['Atandı', 'Assigned'], changes_requested: ['Düzeltme bekliyor', 'Changes requested'], open: ['Açık', 'Open'], closed: ['Kapalı', 'Closed'], 'in-progress': ['Devam ediyor', 'In progress'], 'pending-verification': ['Doğrulama bekliyor', 'Pending verification'] };
type Choice = { id: string; code?: string; data: Record<string, unknown> };
export function EvidenceUsagePanel({ lang, records, focusedId = '' }: { lang: 'tr' | 'en'; records: Choice[]; focusedId?: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: EvidenceUsage | null; error: string } | null>(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const tr = lang === 'tr', t = (a: string, b: string) => tr ? a : b;
  const evidenceId = records.some(r => r.id === selected) ? selected : records.some(r => r.id === focusedId) ? focusedId : records[0]?.id || '';
  const requestKey = `${evidenceId}:${revision}`;
  const loading = open && !!evidenceId && result?.key !== requestKey;
  const error = result?.key === requestKey ? result.error : '';
  useEffect(() => {
    if (!open || !evidenceId) return;
    const controller = new AbortController();
    fetch(withBasePath(`/api/evidence/usage?id=${encodeURIComponent(evidenceId)}`), { cache: 'no-store', signal: controller.signal })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'unavailable'); return body as EvidenceUsage; })
      .then(body => { if (!controller.signal.aborted) setResult({ key: requestKey, data: body, error: '' }); })
      .catch(err => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: err.message }); });
    return () => controller.abort();
  }, [open, evidenceId, requestKey]);
  const current = result?.key === requestKey && result.data?.evidence.id === evidenceId ? result.data : null;
  const rows = (current?.rows || []).filter(row => (filter !== 'review' || usageNeedsReview(row)) && (filter !== 'historical' || row.historical)
    && `${row.title} ${row.owner} ${row.id}`.toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang)));
  function download() {
    if (!current) return;
    const blob = new Blob([JSON.stringify({ format: 'fornost-evidence-usage-v1', scope: 'Current references only; historical reports/events and file contents excluded. Source limits and access restrictions apply. No automatic reassessment or approval.', ...current }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `evidence-usage-${current.evidence.code}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="eu-panel module-analysis-disclosure" open={open} onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setRevision(r => r + 1); }}>
    <summary><span><b>{t('Kullanım ve değişiklik etkisi', 'Usage and change impact')}</b><small>{t('Kanıtın bağlı olduğu kayıtları ve sabit sürümleri inceleyin.', 'Review linked records and pinned evidence versions.')}</small></span></summary>
    {open && <section className="eu-content" aria-label={t('Kanıt kullanım analizi', 'Evidence usage analysis')} aria-busy={loading}>
      <div className="eu-tools"><label>{t('Kanıt kaydı', 'Evidence record')}<select aria-label={t('Kullanımı incelenecek kanıt', 'Evidence to inspect')} value={evidenceId} onChange={event => { setSelected(event.target.value); setFilter('all'); setQuery(''); }}>
        {!records.length && <option value="">{t('Kanıt kaydı yok', 'No evidence records')}</option>}
        {records.map(row => <option key={row.id} value={row.id}>{row.code || row.id} · {String(row.data.evidenceTitle || row.id)}</option>)}
      </select></label><button type="button" disabled={loading || !evidenceId} onClick={() => setRevision(r => r + 1)}>{t('Kullanımı yenile', 'Refresh usage')}</button><button type="button" disabled={!current || loading} onClick={download}>{t('Kullanım raporunu indir', 'Download usage report')}</button></div>
      <p className="eu-note">{t('Yeni dosya, eski sürüme bağlı işleri otomatik olarak değiştirmez. Açık işlerdeki eski veya doğrulanamayan sürümleri inceleyin; yeniden sunma ve onay kararları ilgili işte verilir.', 'A new file does not automatically change work pinned to an earlier version. Review older or unverified pins in open work; resubmission and approval decisions remain in the linked workflow.')}</p>
      {loading && <p role="status">{t('Kullanım kaynakları kontrol ediliyor…', 'Checking usage sources…')}</p>}
      {error && <p role="alert">{error === 'changed' ? t('Kanıt okuma sırasında değişti. Kullanımı yenileyin.', 'The evidence changed while loading. Refresh usage.') : t('Kullanım bilgisi alınamadı. Yeniden deneyin.', 'Unable to load usage. Try again.')}</p>}
      {current && <>
        <div className="eu-summary"><b>{current.evidence.title}</b><span>{current.evidence.versionNo ? `v${current.evidence.versionNo}` : t('Sürüm zinciri yok', 'No version chain')} · {t('Görünen kullanım', 'Visible uses')}: {current.rows.length} · {t('Açık işlerde incelenecek', 'Open work to review')}: {current.rows.filter(usageNeedsReview).length}</span><small>{t('Kontrol zamanı', 'Checked')}: {new Date(current.checkedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}</small></div>
        <ul className="eu-sources" aria-label={t('Kaynak kapsamı', 'Source coverage')}>{current.sources.map(source => <li key={source.key} data-state={source.state}><b>{sourceNames[source.key][tr ? 0 : 1]}</b><span>{source.state === 'complete' ? t('Tamamlandı', 'Complete') : source.state === 'restricted' ? t('Erişim kapsamı dışında', 'Outside access scope') : source.state === 'unavailable' ? t('Alınamadı; sonuç bilinmiyor', 'Unavailable; result unknown') : t('Sınırlı tarama veya erişim', 'Limited scan or access')}</span><small>{t('Okuma sınırı', 'Read limit')}: {source.limit}</small></li>)}</ul>
        <p className="eu-note">{t('Denetim maddeleri ve CAPA için en son güncellenen 1.000 kayıt; talepler ve çalışma kâğıtları için kanıta bağlı en son 200 kayıt taranır. Kontrol eşleştirmeleri tam kimlik/kod üzerinden yapılır. Rapor/arşiv anlık görüntüleri, serbest metin ve diğer modüller bu kapsama dahil değildir. Sınırlı veya alınamayan kaynaklarda sıfır sonuç, kullanım olmadığı anlamına gelmez.', 'Scans the 1,000 most recently updated requirements and CAPA records, and the latest 200 matching requests and workpapers. Controls resolve by exact identity/code. Archived report/event snapshots, free text and other modules are outside this scope. Zero results from limited or unavailable sources do not establish absence of usage.')}</p>
        {current.unresolvedControls.length > 0 && <p className="eu-warning" role="status">{t('Kesin eşleştirilemeyen kontrol referansları', 'Unresolved control references')}: {current.unresolvedControls.join(', ')}</p>}
        <div className="eu-tools"><label>{t('Göster', 'Show')}<select aria-label={t('Kullanım filtresi', 'Usage filter')} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('Tüm kullanımlar', 'All uses')}</option><option value="review">{t('Açık işlerde incelenecek', 'Open work to review')}</option><option value="historical">{t('Onaylı veya kapalı işler', 'Approved or closed work')}</option></select></label><label>{t('Kullanımlarda ara', 'Search uses')}<input aria-label={t('Kullanımlarda ara', 'Search uses')} value={query} onChange={event => setQuery(event.target.value)} /></label></div>
        <div className="eu-list">{rows.map(row => <article key={`${row.source}:${row.id}`} data-review={usageNeedsReview(row)}>
          <div><small>{sourceNames[row.source][tr ? 0 : 1]}</small><h4>{row.title}</h4><p>{row.owner || '—'} · {statusNames[row.status]?.[tr ? 0 : 1] || domainStatusLabel(row.status, lang) || '—'}{row.dueDate ? ` · ${row.dueDate}` : ''}</p><code>{row.id}</code></div>
          <div className="eu-pins">{row.pins.length ? row.pins.map((pin, index) => <span key={`${pin.id}:${index}`} data-state={pin.state}>v{pin.versionNo || '?'} · {pin.state === 'current' ? t('Güncel sürüm sabitlenmiş', 'Current version pinned') : pin.state === 'older' ? t('Önceki sürüm sabitlenmiş', 'Earlier version pinned') : t('Sürüm doğrulanamadı', 'Version unverified')}</span>) : <span>{t('Kayıt bağlantısı · sürüm sabitlenmemiş', 'Record link · no version pin')}</span>}{row.historical && <small>{t('Onaylı/kapalı iş; sabit kayıt korunur.', 'Approved/closed work; pinned record is preserved.')}</small>}{usageNeedsReview(row) && <strong>{t('Açık işte inceleyin', 'Review in open work')}</strong>}</div>
          <button type="button" aria-label={`${t('Kaydı aç', 'Open record')}: ${row.title}`} onClick={() => navigateToFornost(row.target)}>{t('Kaydı aç', 'Open record')} ↗</button>
        </article>)}</div>
        {!rows.length && <p role="status">{t('Bu kapsam ve filtrede eşleşen kullanım yok.', 'No matching uses within this scope and filter.')}</p>}
      </>}
    </section>}
  </details>;
}
