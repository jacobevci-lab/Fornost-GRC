"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { withBasePath } from './base-path';
import { useWorkflowRecords } from './use-workflow-records';
import { minimumNextPlanReview, type ContinuityPlan, type ContinuityReviewWorkspace } from './continuity/plan';
import './continuity-plan-review.css';

type Draft = { requestId: string; expectedRevision: string; note: string; nextReviewDate: string; confirmed: boolean };
const newDraft = (plan: ContinuityPlan): Draft => ({ requestId: `BPR-${crypto.randomUUID()}`, expectedRevision: plan.updatedAt, note: '', nextReviewDate: '', confirmed: false });
function PlanFacts({ plan, tr }: { plan: ContinuityPlan; tr: boolean }) {
  const fields = [
    [tr ? 'Plan / Süreç' : 'Plan / Process', `${plan.name} · ${plan.process}`],
    [tr ? 'Durum' : 'Status', tr ? ({ draft: 'Taslak', approved: 'Onaylı', active: 'Etkin', retired: 'Yürürlükten kaldırıldı' }[plan.status] || plan.status) : plan.status],
    [tr ? 'Kritiklik' : 'Criticality', tr ? ({ critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' }[plan.criticality] || plan.criticality) : plan.criticality],
    ['BIA', plan.biaRef], [tr ? 'Plan sahibi' : 'Plan owner', plan.owner],
    [tr ? 'Oluşturan' : 'Created by', plan.createdBy],
    [tr ? 'Bağımsız incelemeci' : 'Independent reviewer', plan.reviewer], [tr ? 'Kriz lideri' : 'Crisis lead', plan.crisisLead],
    ['RTO / RPO / MTPD', `${plan.rtoHours}h / ${plan.rpoHours}h / ${plan.mtpdHours}h`],
    [tr ? 'Minimum personel' : 'Minimum staff', String(plan.minimumStaff)], [tr ? 'Gözden geçirme tarihi' : 'Review date', plan.reviewDate],
    [tr ? 'Bağımlılıklar' : 'Dependencies', plan.dependencies], [tr ? 'Kurtarma stratejisi' : 'Recovery strategy', plan.recoveryStrategy],
    [tr ? 'İletişim planı' : 'Communication plan', plan.communicationPlan], [tr ? 'Alternatif konum' : 'Alternate site', plan.alternateSite || '—'],
    [tr ? 'Tedarikçi bağımlılıkları' : 'Supplier dependencies', plan.supplierDependencies || '—'],
  ];
  return <dl className="cpr-facts">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export default function ContinuityPlanReview({ planId, tr, onClose, onSaved }: { planId: string; tr: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resource = useWorkflowRecords<ContinuityReviewWorkspace>(`/api/continuity?view=review&planId=${encodeURIComponent(planId)}`, null);
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const data = resource.data, stale = Boolean(draft && data && draft.expectedRevision !== data.plan.updatedAt);
  useEffect(() => {
    const element = dialog.current, trigger = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  const recorded = draft && data?.reviews.find(review => review.id === draft.requestId);
  const finish = async () => { setDraft(null); setNotice(tr ? 'Gözden geçirme kaydedildi; sonraki tarih güncellendi.' : 'Review recorded; the next review date is updated.'); await Promise.all([resource.reload(), onSaved()]); };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft?.confirmed || !resource.ready || !data?.canReview || stale || busy) return;
    setBusy(true); setNotice('');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(withBasePath('/api/continuity'), { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review-plan', planId, ...draft, confirmation: 'PLAN REVIEWED' }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok) { await finish(); return; }
      setNotice(response.status === 409 ? (tr ? 'Plan veya yetkiler değişti. Planı yenileyip güncel sürümü inceleyin; taslağınız korunuyor.' : 'The plan or permissions changed. Refresh and inspect the current version; your draft is retained.')
        : result.code === 'REVIEW_INPUT' ? (tr ? 'En az 20 karakter gerekçe ve bugünden/mevcut tarihten sonraki geçerli bir tarih girin.' : 'Enter a reason of at least 20 characters and a valid date after today and the current review date.')
          : response.status === 403 ? (tr ? 'Yalnız atanmış bağımsız ve etkin Admin incelemeci kaydedebilir.' : 'Only the assigned independent active Admin reviewer may record this review.')
            : (tr ? 'İşlemin sonucu doğrulanamadı. Aynı taslakla yeniden deneyin; tekrar deneme çift kayıt oluşturmaz.' : 'The outcome could not be confirmed. Retry the same draft; retrying does not create a duplicate.'));
    } catch {
      setNotice(tr ? 'İşlemin sonucu doğrulanamadı. Aynı taslakla yeniden deneyin; tekrar deneme çift kayıt oluşturmaz.' : 'The outcome could not be confirmed. Retry the same draft; retrying does not create a duplicate.');
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  return <dialog ref={dialog} className="continuity-overlay cpr-dialog" aria-label={tr ? 'Plan ayrıntıları ve incelemeler' : 'Plan details and reviews'} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <article><header><h3>{tr ? 'Plan ayrıntıları ve incelemeler' : 'Plan details and reviews'}</h3><button type="button" aria-label={tr ? 'Kapat' : 'Close'} disabled={busy} onClick={onClose}>×</button></header>
      <div className="cpr-body" aria-busy={resource.loading}>
        <div className="cpr-toolbar"><p>{tr ? 'Mevcut planın geçerliliğini inceleyin ve sonraki gözden geçirme tarihini karara bağlayın.' : 'Review the current plan’s continued suitability and decide its next review date.'}</p><button type="button" disabled={busy || resource.loading} onClick={() => void resource.reload()}>{tr ? 'Planı yenile' : 'Refresh plan'}</button></div>
        {resource.loading && <p role="status">{tr ? 'Plan yükleniyor…' : 'Loading plan…'}</p>}
        {resource.error && <p role="alert">{tr ? 'Plan bulunamadı, erişilemiyor veya okunamadı. Planı yenileyerek tekrar deneyin.' : 'The plan was not found, is inaccessible or could not be read. Refresh the plan to retry.'}</p>}
        {notice && <p role="status" className="cpr-notice">{notice}</p>}
        {data && <>
          <h4>{data.plan.code} · v{data.plan.version}</h4><PlanFacts plan={data.plan} tr={tr} />
          <p>{tr ? 'Bu karar planın stratejisini veya hedeflerini değiştirmez; tatbikat doğrulaması yerine geçmez ve iyileştirme açıklarını kapatmaz.' : 'This decision preserves the plan’s strategy and targets; it does not replace exercise verification or close improvement gaps.'}</p>
          {!draft && data.canReview && <button type="button" disabled={!resource.ready || busy} onClick={() => { setDraft(newDraft(data.plan)); setNotice(''); }}>{tr ? 'Gözden geçirmeyi kaydet' : 'Record periodic review'}</button>}
          {!data.canReview && <p>{tr ? 'Kayıt işlemi yalnız etkin planın atanmış bağımsız Admin incelemecisine açıktır.' : 'Recording is available only to the active plan’s assigned independent Admin reviewer.'}</p>}
          {draft && <form className="cpr-form" onSubmit={event => void submit(event)}>
            {recorded ? <p role="status">{tr ? 'Bu karar zaten kaydedilmiş. Kaydedilen sonuçla devam edin.' : 'This decision is already recorded. Continue with the saved result.'} <button type="button" disabled={busy} onClick={() => void finish()}>{tr ? 'Kaydedilen sonucu kullan' : 'Use recorded result'}</button></p> : <>
              {stale && <p role="alert">{tr ? 'Plan taslağınızdan sonra değişti. Yukarıdaki güncel ayrıntıları inceleyin.' : 'The plan changed after your draft. Inspect the current details above.'} <button type="button" disabled={!resource.ready || busy || !data.canReview} onClick={() => setDraft({ ...draft, expectedRevision: data.plan.updatedAt, requestId: `BPR-${crypto.randomUUID()}`, confirmed: false })}>{tr ? 'Güncel plan sürümünü kullan' : 'Use current plan version'}</button></p>}
              <label>{tr ? 'İnceleme gerekçesi' : 'Review rationale'}<textarea required minLength={20} maxLength={2000} value={draft.note} disabled={busy} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
              <label>{tr ? 'Sonraki gözden geçirme tarihi' : 'Next review date'}<input type="date" required min={minimumNextPlanReview(data.plan.reviewDate)} value={draft.nextReviewDate} disabled={busy} onChange={event => setDraft({ ...draft, nextReviewDate: event.target.value })} /></label>
              <p>{tr ? 'Kaydedilecek tarih' : 'Date to save'}: {data.plan.reviewDate} → {draft.nextReviewDate || '—'}</p>
              <label className="cpr-confirm"><input type="checkbox" required checked={draft.confirmed} disabled={busy || stale} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />{tr ? 'Mevcut planı inceledim ve geçerliliğinin devam ettiğini doğruluyorum.' : 'I reviewed the current plan and confirm its continued suitability.'}</label>
              <button type="submit" disabled={busy || !resource.ready || !data.canReview || stale}>{busy ? (tr ? 'Kaydediliyor…' : 'Recording…') : (tr ? 'İncelemeyi kaydet' : 'Record review')}</button>
            </>}
            <button type="button" disabled={busy} onClick={() => setDraft(null)}>{tr ? 'Taslağı iptal et' : 'Cancel draft'}</button>
          </form>}
          <section className="cpr-history" aria-label={tr ? 'İnceleme geçmişi' : 'Review history'}><h4>{tr ? 'İnceleme geçmişi' : 'Review history'}</h4>
            {data.hasMore && <p role="status">{tr ? 'En son 20 inceleme gösteriliyor. Önceki kararlar saklanmaya devam eder.' : 'Showing the latest 20 reviews. Earlier decisions remain retained.'}</p>}
            {!data.historyVerified && <p role="alert">{tr ? 'Bazı kayıtların plan kopyası okunamadı.' : 'Some retained plan snapshots could not be read.'}</p>}
            {!data.reviews.length && <p>{tr ? 'Henüz periyodik inceleme kaydedilmedi.' : 'No periodic review has been recorded yet.'}</p>}
            {data.reviews.map(review => <article key={review.id}><p><strong>{review.actor}</strong> · <time>{review.reviewedAt}</time></p><p>{review.previousDate} → {review.nextDate}</p><p className="cpr-note">{review.note}</p>
              {review.snapshot ? <details><summary>{tr ? 'İncelenen plan kopyası' : 'Reviewed plan snapshot'} · v{review.snapshot.version}</summary><PlanFacts plan={review.snapshot} tr={tr} /></details> : <p>{tr ? 'Plan kopyası kullanılamıyor.' : 'Plan snapshot unavailable.'}</p>}
            </article>)}
          </section>
        </>}
      </div>
    </article>
  </dialog>;
}
