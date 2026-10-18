"use client";
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { ReportSource } from './audit-status-report-panel';
import { auditReportSummary } from './audit-status-report';
import { auditClosureActionLabels, auditClosureBlockerLabels, auditClosureLabels, type AuditClosureAction, type AuditClosureDetail, type AuditClosureHistory, type AuditClosurePreview } from './audit-closure';
import './audit-status-report.css';

const messages: Record<string, [string, string]> = {
  changed: ['Kaynaklar veya kapanış durumu değişti. Yenileyin. Onaydaki paket eskidiyse iade edin veya geri çekip yeniden gönderin. Yazdıklarınız korunuyor.', 'Sources or closure state changed. Refresh. Return or withdraw an outdated package and resubmit it. Your text is retained.'],
  blockers: ['Kapanış koşulları sağlanmıyor. Önizlemeyi yenileyip eksikleri tamamlayın.', 'Closure conditions are not met. Refresh the preview and resolve the blockers.'],
  'independent-review': ['Kararı yalnız atanan bağımsız yönetici verebilir; hazırlayan kendi kapanışını onaylayamaz.', 'Only the assigned independent administrator can decide; preparers cannot approve their own closure.'],
  reviewer: ['Etkin ve hazırlayandan farklı bir yönetici seçin.', 'Choose an active administrator other than the preparer.'],
  preparer: ['Yalnız hazırlayan kişi onaydan geri çekebilir.', 'Only the preparer can withdraw the submission.'],
  'follow-up': ['Açık bulgular için en az 10 karakterlik takip planı yazın.', 'Enter a follow-up plan of at least 10 characters for open findings.'],
  fields: ['Özet veya gerekçe 10–4.000 karakter olmalı. İnceleyeni ve zorunlu alanları kontrol edin.', 'The summary or reason must be 10–4,000 characters. Check the reviewer and required fields.'],
  integrity: ['Kayıt bütünlüğü doğrulanamadı. Onay ve indirme kapalı.', 'Record integrity could not be verified. Approval and download are disabled.'],
  state: ['Bu işlem güncel kapanış durumuna uygun değil. Yenileyin.', 'This action does not match the current closure state. Refresh.'],
  forbidden: ['Kapanış paketi CAPA verisi içerir ve yönetici yetkisi gerektirir.', 'The closure package includes CAPA data and requires administrator access.'],
  limit: ['Tam kaynak sınırı aşıldı; eksik kapanış paketi oluşturulmadı.', 'The complete source limit was exceeded; no partial closure package was created.'],
  'scope-ambiguous': ['Bulgu kaynak referanslarından biri birden fazla kayıtla eşleşiyor. Tekil kayıt kimliğini kullanın.', 'A finding source reference matches multiple records. Use a unique record ID.'],
  'source-invalid': ['Kaynak verileri eksik veya okunamıyor. Kayıtları kontrol edip yeniden deneyin.', 'Source data is incomplete or unreadable. Check the records and retry.'],
  unavailable: ['İşlem sonucu doğrulanamadı. Durumu yenileyin veya aynı işlemi tekrar deneyin; yazdıklarınız korunuyor.', 'The outcome could not be confirmed. Refresh the state or retry the same operation; your text is retained.'],
};
export function AuditClosurePanel({ auditId, lang, onChanged, focusId = '' }: { auditId: string; lang: string; focusId?: string; onChanged: () => Promise<unknown> }) {
  const tr = lang !== 'en', t = (a: string, b: string) => tr ? a : b, formId = useId();
  const [history, setHistory] = useState<AuditClosureHistory | null>(null), [preview, setPreview] = useState<AuditClosurePreview | null>(null), [detail, setDetail] = useState<AuditClosureDetail | null>(null);
  const [note, setNote] = useState(''), [followUp, setFollowUp] = useState(''), [limitations, setLimitations] = useState(''), [reviewerId, setReviewerId] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [reviewed, setReviewed] = useState(false);
  const pending = useRef(false), live = useRef(true), attempt = useRef<{ key: string; id: string } | null>(null);
  const endpoint = `/api/audits/closure?auditId=${encodeURIComponent(auditId)}`;
  const read = useCallback(async (suffix = '') => {
    const r = await fetch(withBasePath(endpoint + suffix), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'unavailable'); return data;
  }, [endpoint]);
  const reload = useCallback(async () => { const data = await read(); if (live.current) { setHistory(data); setReady(true); } }, [read]);
  const run = useCallback(async (work: () => Promise<void>) => {
    if (pending.current) return; pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { if (live.current) setError(e instanceof Error ? e.message : 'unavailable'); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }, []);
  useEffect(() => {
    live.current = true;
    const timer = window.setTimeout(() => void run(async () => { await reload(); if (focusId) { const value = await read(`&eventId=${encodeURIComponent(focusId)}`); if (live.current) { setDetail(value); setReviewed(false); } } }), 0);
    return () => { live.current = false; window.clearTimeout(timer); };
  }, [reload, run, focusId, read]);
  const state = history?.state;
  async function refresh() {
    setReady(false); setReviewed(false); setPreview(null);
    await reload(); await onChanged();
  }
  async function loadPreview() {
    setPreview(null); setReady(false); await reload(); const data = await read('&preview=1');
    if (live.current) { setPreview(data); setDetail(null); }
  }
  async function loadDetail(id: string) {
    setDetail(null); setReviewed(false); const data = await read(`&eventId=${encodeURIComponent(id)}`);
    if (live.current) setDetail(data);
  }
  async function mutate(action: AuditClosureAction) {
    if (!ready || !state || note.trim().length < 10) return;
    const data = { auditId, action, expectedRevision: state.revision, note, ...(action === 'submit' && preview ? { reviewerId, expectedSourceRevision: preview.source.sourceRevision, followUp, limitations } : {}) };
    const key = JSON.stringify(data); if (attempt.current?.key !== key) attempt.current = { key, id: `ACL-${crypto.randomUUID()}` };
    const r = await fetch(withBasePath('/api/audits/closure'), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ ...data, eventId: attempt.current.id }) });
    const result = await r.json(); if (!r.ok) { if (live.current) { setPreview(null); setReviewed(false); } throw new Error(result.error || 'unavailable'); }
    if (!live.current) return;
    setReady(false); setPreview(null); setReviewed(false); setNote(''); attempt.current = null;
    await reload(); await loadDetail(result.id); await onChanged();
    if (live.current) setNotice(action);
  }
  const currentPackage = !!state && detail?.event.id === state.submissionId;
  const canReview = currentPackage && history?.actorId === detail?.event.reviewerId && history?.actorId !== detail?.event.preparerId;
  const canWithdraw = currentPackage && history?.actorId === detail?.event.preparerId;
  const unresolved = preview ? auditReportSummary(preview.source.items).unresolvedFindings : 0;
  return <section className="audit-status-report audit-closure" aria-busy={busy}>
    <h3>{t('Kapanış ve onay', 'Closure and approval')}</h3><div className="asr-content">
      <p>{t('Kayıtlı planı, maddeleri, kanıt taleplerini ve doğrudan bağlı CAPA bulgularını bağımsız incelemeye gönderin. Onay denetimi kilitler; yeniden açmak gerekçe gerektirir.', 'Submit the saved plan, requirements, evidence requests and directly linked CAPA findings for independent review. Approval locks the audit; reopening requires a reason.')}</p>
      <p className="asr-scope">{t('Açık bulgular kendi takip akışında kalır. Bu karar otomatik denetim görüşü veya sertifikasyon değildir; dolaylı ve serbest metin bulgu bağlantıları kapsam dışındadır.', 'Open findings remain in their own follow-up workflow. This decision is not an automatic audit opinion or certification; indirect and free-text finding links are excluded.')}</p>
      <div className="asr-actions"><strong>{state ? auditClosureLabels[state.state][tr ? 0 : 1] : t('Durum yükleniyor', 'Loading state')}</strong><button disabled={busy} onClick={() => void run(refresh)}>{t('Kapanış durumunu yenile', 'Refresh closure state')}</button>
        {ready && state?.state === 'open' && <button disabled={busy} onClick={() => void run(loadPreview)}>{t('Kapanış paketini hazırla', 'Prepare closure package')}</button>}
        {ready && state && state.state !== 'open' && <button disabled={busy} onClick={() => void run(() => loadDetail(state.submissionId))}>{t('Güncel paketi incele', 'Review current package')}</button>}
      </div>
      {busy && <p role="status">{t('Kapanış kaydı işleniyor…', 'Processing closure record…')}</p>}
      {error && <p role="alert">{(messages[error] || messages.unavailable)[tr ? 0 : 1]}</p>}
      {notice && <p role="status">{auditClosureActionLabels[notice as AuditClosureAction]?.[tr ? 0 : 1]}</p>}
      {state?.state === 'closed' && <p>{t('Plan, maddeler ve talepler değişikliğe kapalıdır. Açık CAPA aksiyonlarının takibi devam eder.', 'The plan, requirements and requests are locked. Follow-up of open CAPA actions continues.')}</p>}
      {preview && state?.state === 'open' && <div className="asr-preview">
        <h4>{t('Kapanış paketi önizlemesi', 'Closure package preview')}</h4><div inert={busy}><ReportSource source={preview.source} tr={tr}/></div>
        {!!preview.blockers.length && <div role="status"><b>{t('Kapanışı engelleyenler', 'Closure blockers')}</b><ul>{preview.blockers.map(b => <li key={b}>{auditClosureBlockerLabels[b]?.[tr ? 0 : 1] || b}</li>)}</ul></div>}
        <fieldset disabled={busy || !ready}>
          <div className="asr-field"><label htmlFor={`${formId}-reviewer`}>{t('Bağımsız onaylayan', 'Independent approver')}</label><select id={`${formId}-reviewer`} value={reviewerId} onChange={e => setReviewerId(e.target.value)}><option value="">{t('Yönetici seçin', 'Select an administrator')}</option>{preview.reviewers.map(r => <option key={r.id} value={r.id}>{r.name} · {r.email}</option>)}</select></div>
          {!preview.reviewers.length && <p>{t('Etkin başka bir yönetici yok. Kullanıcı yönetiminde bağımsız onaylayan hesabı oluşturulmalı.', 'There is no other active administrator. An independent approver account must be created in user administration.')}</p>}
          {!preview.reviewersComplete && <p>{t('İlk 1.000 yönetici gösteriliyor.', 'Showing the first 1,000 administrators.')}</p>}
          <div className="asr-field"><label htmlFor={`${formId}-follow`}>{t('Açık bulguların takip planı', 'Follow-up plan for open findings')}{unresolved ? ` (${t('zorunlu', 'required')})` : ''}</label><textarea id={`${formId}-follow`} rows={3} maxLength={4000} value={followUp} onChange={e => setFollowUp(e.target.value)}/></div>
          <div className="asr-field"><label htmlFor={`${formId}-limitations`}>{t('Kapsam kısıtları ve notlar', 'Scope limitations and notes')}</label><textarea id={`${formId}-limitations`} rows={2} maxLength={4000} value={limitations} onChange={e => setLimitations(e.target.value)}/></div>
        </fieldset>
      </div>}
      {detail && <div className="asr-saved"><h4>{auditClosureActionLabels[detail.event.action][tr ? 0 : 1]}</h4><p>{detail.event.actorEmail} · {new Date(detail.event.createdAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</p><p className="asr-narrative">{detail.event.note}</p>
        <p><b>{t('Hazırlayan', 'Preparer')}:</b> {detail.event.preparerEmail}<br/><b>{t('Bağımsız onaylayan', 'Independent approver')}:</b> {detail.event.reviewerEmail}</p>
        <p className="asr-narrative"><b>{t('Kapanış özeti', 'Closure summary')}:</b> {detail.report.snapshot.summary}</p>
        {detail.event.followUp && <p className="asr-narrative"><b>{t('Bulgu takip planı', 'Finding follow-up plan')}:</b> {detail.event.followUp}</p>}
        {detail.report.snapshot.limitations && <p className="asr-narrative"><b>{t('Kısıtlar', 'Limitations')}:</b> {detail.report.snapshot.limitations}</p>}
        <ReportSource source={detail.report.snapshot} tr={tr}/>
        <p>{t('Karar ve saklanan paketin SHA-256 özetleri doğrulandı.', 'Decision and saved package SHA-256 digests verified.')}</p>
        <a href={withBasePath(`${endpoint}&eventId=${encodeURIComponent(detail.event.id)}&download=1`)}>{t('Karar ve tam paketi indir (JSON)', 'Download decision and complete package (JSON)')}</a>
      </div>}
      {ready && state && ((state.state === 'open' && preview) || state.state !== 'open') && <fieldset disabled={busy}>
        <div className="asr-field"><label htmlFor={`${formId}-note`}>{state.state === 'open' ? t('Kapanış özeti', 'Closure summary') : t('Karar veya yeniden açma gerekçesi', 'Decision or reopening reason')}</label><textarea id={`${formId}-note`} rows={3} minLength={10} maxLength={4000} value={note} onChange={e => setNote(e.target.value)}/></div>
        {state.state === 'pending' && canReview && <label className="acl-confirm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>{t('Paketin kapsamını, sonuçlarını ve açık bulguların takibini inceledim.', 'I reviewed the package scope, results and follow-up of open findings.')}</label>}
        <div className="asr-actions">
          {state.state === 'open' && preview && <button disabled={note.trim().length < 10 || !reviewerId || !!preview.blockers.length || (unresolved > 0 && followUp.trim().length < 10)} onClick={() => void run(() => mutate('submit'))}>{t('Bağımsız onaya gönder', 'Submit for independent approval')}</button>}
          {state.state === 'pending' && <>
            {canReview && <><button disabled={!reviewed || note.trim().length < 10} onClick={() => void run(() => mutate('approve'))}>{t('Onayla ve denetimi kapat', 'Approve and close audit')}</button><button disabled={note.trim().length < 10} onClick={() => void run(() => mutate('return'))}>{t('Düzeltme için iade et', 'Return for changes')}</button></>}
            {canWithdraw && <button disabled={note.trim().length < 10} onClick={() => void run(() => mutate('withdraw'))}>{t('Onaydan geri çek', 'Withdraw from review')}</button>}
          </>}
          {state.state === 'closed' && <button disabled={note.trim().length < 10} onClick={() => void run(() => mutate('reopen'))}>{t('Gerekçeyle yeniden aç', 'Reopen with reason')}</button>}
        </div>
      </fieldset>}
      <details className="asr-history"><summary>{t('Kapanış karar geçmişi', 'Closure decision history')}</summary>
        {!history ? <p>{t('Geçmiş henüz yüklenmedi.', 'History has not loaded yet.')}</p> : <>{!history.complete && <p>{t('En son 20 karar gösteriliyor.', 'Showing the latest 20 decisions.')}</p>}{!history.events.length && <p>{t('Henüz kapanış kararı yok.', 'No closure decisions yet.')}</p>}<ol>{history.events.map(event => <li key={event.id}><button disabled={busy} onClick={() => void run(() => loadDetail(event.id))}>{auditClosureActionLabels[event.action][tr ? 0 : 1]}</button><small>{event.actorEmail} · {new Date(event.createdAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</small></li>)}</ol></>}
      </details>
    </div>
  </section>;
}
