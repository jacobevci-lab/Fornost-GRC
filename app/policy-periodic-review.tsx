"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { withBasePath } from './base-path';
import { requestJsonWithDeadline } from './bounded-json-request';
import { useWorkflowRecords } from './use-workflow-records';
import { useRecordDialog } from './use-record-dialog';
import type { PolicyReviewSource, PolicyReviewWorkspace } from './policy-lifecycle/periodic-review';
import './continuity-plan-review.css';

type Draft = { requestId: string; expectedRevision: string; note: string; nextReviewDate: string; confirmed: boolean };
function PolicyFacts({ source, tr }: { source: PolicyReviewSource; tr: boolean }) {
  const { policy: p, version: v } = source;
  const status = (value: unknown) => tr ? ({ published: 'Yayımlanmış', retired: 'Yürürlükten kaldırıldı', superseded: 'Önceki sürüm', draft: 'Taslak', review: 'İncelemede', approved: 'Onaylı' }[String(value)] || String(value)) : String(value);
  const fields = [
    [tr ? 'Politika' : 'Policy', `${p.code} · ${p.title}`], [tr ? 'Yayımlanmış sürüm' : 'Published version', `v${v.version_number} · ${v.effective_date}`],
    [tr ? 'Politika / sürüm durumu' : 'Policy / version status', `${status(p.status)} / ${status(v.status)}`],
    [tr ? 'Politika sahibi' : 'Policy owner', p.owner], [tr ? 'Bağımsız incelemeci' : 'Independent reviewer', p.reviewer],
    [tr ? 'Hedef kitle' : 'Audience', p.audience], [tr ? 'Sınıf / Kategori' : 'Classification / Category', `${p.classification} · ${p.category}`],
    [tr ? 'Mevcut inceleme tarihi' : 'Current review date', p.next_review], [tr ? 'İnceleme sıklığı (gün)' : 'Review frequency (days)', p.review_frequency_days],
    [tr ? 'Politikayı oluşturan' : 'Policy created by', p.created_by], [tr ? 'Sürümü hazırlayan / gönderen' : 'Version author / submitter', `${v.created_by} / ${v.submitted_by || '—'}`],
  ];
  return <><dl className="cpr-facts">{fields.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <details open><summary>{tr ? 'İncelenecek politika içeriği' : 'Policy content to review'}</summary><p>{v.summary}</p><p className="plm-decision-content">{v.content}</p><p className="plm-decision-content">{tr ? 'Kontrol / regülasyon / risk eşlemeleri' : 'Control / regulation / risk mappings'}: {[v.control_refs_json, v.regulation_refs_json, v.risk_refs_json].join(' · ')}</p><code>{v.content_sha256}</code></details></>;
}
export default function PolicyPeriodicReview({ id, tr, close, openVersions }: { id: string; tr: boolean; close: (saved: boolean) => void; openVersions: () => void }) {
  const resource = useWorkflowRecords<PolicyReviewWorkspace>(`/api/policy-lifecycle?view=review&policyId=${encodeURIComponent(id)}`, null);
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [blocked, setBlocked] = useState(false);
  const changed = useRef(false), closeRef = useRef(() => {}), noteField = useRef<HTMLTextAreaElement>(null), hadDraft = useRef(false), fieldId = useId();
  useEffect(() => { closeRef.current = () => { if (!busy) close(changed.current); }; }, [busy, close]);
  const dismiss = useCallback(() => closeRef.current(), []), dialog = useRecordDialog(true, dismiss);
  const hasDraft = !!draft;
  useEffect(() => { if (hasDraft && !hadDraft.current) noteField.current?.focus(); hadDraft.current = hasDraft; }, [hasDraft]);
  const raw = resource.data;
  const data = raw && raw.policy?.id === id && raw.version && typeof raw.revision === 'string' && Array.isArray(raw.reviews) && typeof raw.canReview === 'boolean' ? raw : null;
  const stale = !!(draft && data && draft.expectedRevision !== data.revision), ready = resource.ready && !!data;
  const recorded = draft && data?.reviews.find(review => review.id === draft.requestId);
  async function refresh() { const fresh = await resource.reload(); if (fresh) setBlocked(false); }
  async function finish() { changed.current = true; setDraft(null); setBlocked(false); setNotice(tr ? 'İnceleme kaydedildi; sonraki tarih güncellendi.' : 'Review recorded; the next review date is updated.'); await refresh(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft || !data || !ready || busy || blocked || stale || !data.canReview || !draft.confirmed) return;
    setBusy(true); setNotice('');
    try {
      const { response, body } = await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review-policy', policyId: id, ...draft, confirmation: 'POLICY REVIEWED' }) }, fetch, 15_000);
      if (response.ok) { await finish(); return; }
      if (response.status === 409 || response.status === 403) setBlocked(true);
      setNotice(response.status === 409 ? (tr ? 'Politika veya yetkiler değişti. Güncel içeriği yenileyip inceleyin; taslağınız korundu.' : 'The policy or permissions changed. Refresh and inspect the current content; your draft is retained.') : response.status === 403 ? (tr ? 'Yalnız atanmış bağımsız ve etkin Admin incelemeci kaydedebilir.' : 'Only the assigned independent active Admin reviewer may record this review.') : body.code === 'POLICY_REVIEW_INPUT' ? (tr ? 'En az 20 karakter gerekçe ve gösterilen aralıkta geçerli bir tarih girin.' : 'Enter a reason of at least 20 characters and a valid date in the displayed range.') : (tr ? 'Sonuç doğrulanamadı. Aynı taslakla tekrar deneyin; çift kayıt oluşturulmaz.' : 'The outcome could not be confirmed. Retry the same draft; no duplicate is created.'));
    } catch { setNotice(tr ? 'Sonuç doğrulanamadı. Aynı taslakla tekrar deneyin veya politikayı yenileyin; çift kayıt oluşturulmaz.' : 'The outcome could not be confirmed. Retry the same draft or refresh the policy; no duplicate is created.'); }
    finally { setBusy(false); }
  }
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) dismiss(); }}><div ref={dialog} data-escape-layer className="modal plm-modal plm-decision" role="dialog" aria-modal="true" aria-label={tr ? 'Periyodik politika incelemesi' : 'Periodic policy review'} tabIndex={-1}>
    <header className="modal-head"><h2>{tr ? 'Periyodik politika incelemesi' : 'Periodic policy review'}</h2><button data-escape-close type="button" aria-label={tr ? 'Kapat' : 'Close'} disabled={busy} onClick={dismiss}>×</button></header>
    <div className="cpr-body" aria-busy={resource.loading}>
      <div className="cpr-toolbar"><p>{tr ? 'Yayımlanmış içeriğin geçerliliğini inceleyin ve sonraki tarihi belirleyin. İçerik değişikliği gerekiyorsa kontrollü yeni sürüm sürecini kullanın.' : 'Review the published content’s continued suitability and set the next date. Use the controlled version workflow when content needs to change.'}</p><button type="button" disabled={busy || resource.loading} onClick={() => void refresh()}>{tr ? 'Politikayı yenile' : 'Refresh policy'}</button></div>
      {resource.loading && <p role="status">{tr ? 'Politika yükleniyor…' : 'Loading policy…'}</p>}
      {(resource.error || (resource.ready && !data)) && <p role="alert">{tr ? 'Politika okunamadı. Taslağınız korundu; yenileyerek tekrar deneyin.' : 'The policy could not be read. Your draft is retained; refresh to retry.'}</p>}
      {notice && <p role="status" className="cpr-notice">{notice}</p>}
      {data && <><PolicyFacts source={data} tr={tr} />
        {!data.contentVerified && <p role="alert">{tr ? 'Güncel yayımlanmış içerik doğrulanamadı. İnceleme kaydedilemez.' : 'The current published content could not be verified. A review cannot be recorded.'}</p>}
        {data.pendingRevision && <p role="status">{tr ? 'Yeni bir sürüm hazırlanıyor veya onay bekliyor. Önce bu sürümün sürecini tamamlayın.' : 'Another version is being prepared or awaits approval. Complete that version’s workflow first.'} <button type="button" disabled={busy} onClick={openVersions}>{tr ? 'Sürümleri aç' : 'Open versions'}</button></p>}
        {!data.canReview && !data.pendingRevision && data.contentVerified && <p>{data.minimumDate > data.maximumDate ? (tr ? 'Mevcut tarih, inceleme sıklığının izin verdiği son tarihe ulaşıyor; bugün daha ileri bir tarih atanamaz.' : 'The current date already reaches the review-frequency limit; it cannot be advanced today.') : (tr ? 'Kayıt işlemi yalnız atanmış bağımsız Admin incelemecisine açıktır.' : 'Recording is available only to the assigned independent Admin reviewer.')}</p>}
        {!draft && data.canReview && <button type="button" disabled={!ready || busy} onClick={() => { setDraft({ requestId: `PPR-${crypto.randomUUID()}`, expectedRevision: data.revision, note: '', nextReviewDate: '', confirmed: false }); setNotice(''); }}>{tr ? 'İncelemeyi hazırla' : 'Prepare review'}</button>}
      </>}
      {draft && <form className="cpr-form" onSubmit={event => void submit(event)}>
        {recorded ? <p role="status">{tr ? 'Bu karar zaten kaydedilmiş.' : 'This decision is already recorded.'} <button type="button" disabled={busy} onClick={() => void finish()}>{tr ? 'Kaydedilen sonucu kullan' : 'Use recorded result'}</button></p> : <>
          {stale && data && <p role="alert">{tr ? 'Politika taslağınızdan sonra değişti. Güncel ayrıntıları inceleyip yeniden onaylayın.' : 'The policy changed after your draft. Inspect the current details and confirm again.'} <button type="button" disabled={!ready || busy || !data.canReview} onClick={() => { setDraft({ ...draft, expectedRevision: data.revision, requestId: `PPR-${crypto.randomUUID()}`, confirmed: false }); setBlocked(false); }}>{tr ? 'Güncel bağlamı kullan' : 'Use current context'}</button></p>}
          <label htmlFor={`${fieldId}-note`}>{tr ? 'İnceleme gerekçesi' : 'Review rationale'}</label><textarea ref={noteField} id={`${fieldId}-note`} required minLength={20} maxLength={2000} disabled={busy} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} />
          <label htmlFor={`${fieldId}-date`}>{tr ? 'Sonraki inceleme tarihi' : 'Next review date'}</label><input id={`${fieldId}-date`} type="date" required disabled={busy} min={data?.minimumDate} max={data?.maximumDate} value={draft.nextReviewDate} onChange={event => setDraft({ ...draft, nextReviewDate: event.target.value })} />
          {data && <p>{tr ? 'İzin verilen tarih aralığı' : 'Allowed date range'}: {data.minimumDate} → {data.maximumDate}. {tr ? 'Üst sınır, bugünden itibaren tanımlı inceleme sıklığıdır.' : 'The upper limit is the configured review frequency from today.'}</p>}
          <label className="cpr-confirm"><input type="checkbox" required checked={draft.confirmed} disabled={busy || stale || !ready} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />{tr ? 'Yayımlanmış sürümü inceledim; içeriğinin geçerliliğinin devam ettiğini doğruluyorum.' : 'I reviewed the published version and confirm its continued suitability.'}</label>
          <button type="submit" disabled={busy || !ready || !data?.canReview || stale || blocked}>{busy ? (tr ? 'Kaydediliyor…' : 'Recording…') : (tr ? 'İncelemeyi kaydet' : 'Record review')}</button>
        </>}
        <button type="button" disabled={busy} onClick={() => setDraft(null)}>{tr ? 'Taslağı iptal et' : 'Cancel draft'}</button>
      </form>}
      {data && <section className="cpr-history" aria-label={tr ? 'İnceleme geçmişi' : 'Review history'}><h3>{tr ? 'İnceleme geçmişi' : 'Review history'}</h3>
        {data.hasMore && <p role="status">{tr ? 'En son 20 inceleme gösteriliyor; önceki kararlar saklanıyor.' : 'Showing the latest 20 reviews; earlier decisions remain retained.'}</p>}
        {!data.historyVerified && <p role="alert">{tr ? 'Bazı saklanan politika kopyaları doğrulanamadı.' : 'Some retained policy snapshots could not be verified.'}</p>}
        {!data.reviews.length && <p>{tr ? 'Henüz periyodik inceleme kaydedilmedi.' : 'No periodic review has been recorded yet.'}</p>}
        {data.reviews.map(review => <article key={review.id}><p><strong>{review.actor}</strong> · <time>{review.reviewedAt}</time></p><p>{review.previousDate} → {review.nextDate}</p><p className="cpr-note">{review.note}</p>{review.snapshot ? <details><summary>{tr ? 'İncelenen politika kopyası' : 'Reviewed policy snapshot'} · v{review.snapshot.version.version_number}</summary><PolicyFacts source={review.snapshot} tr={tr} /></details> : <p>{tr ? 'Politika kopyası kullanılamıyor.' : 'Policy snapshot unavailable.'}</p>}</article>)}
      </section>}
    </div>
  </div></div>;
}
