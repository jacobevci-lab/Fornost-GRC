"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { withBasePath } from './base-path';
import { requestJsonWithDeadline } from './bounded-json-request';
import { useWorkflowRecords } from './use-workflow-records';
import { useRecordDialog } from './use-record-dialog';
import { attestationPhrase, type AttestationSource, type AttestationWorkspace } from './policy-lifecycle/attestation';
import './continuity-plan-review.css';
import './policy-attestation-response.css';

type Decision = 'attested' | 'declined';
type Draft = { requestId: string; expectedRevision: string; decision: Decision; note: string; confirmed: boolean };
function PolicyContent({ source, tr }: { source: AttestationSource; tr: boolean }) {
  const { policy: p, version: v, campaign: c, attestation: a } = source;
  const mappings = (value: unknown) => { try { const list = JSON.parse(String(value)); return Array.isArray(list) ? list.join(', ') || '—' : '—'; } catch { return tr ? 'Okunamıyor' : 'Unreadable'; } };
  const fields = [[tr ? 'Politika' : 'Policy', `${p.code} · ${p.title}`], [tr ? 'Atanmış sürüm / yürürlük tarihi' : 'Assigned version / effective date', `v${v.version_number} · ${v.effective_date}`], [tr ? 'Kampanya' : 'Campaign', c.name], [tr ? 'Katılımcı' : 'Subject', a.subject_email], [tr ? 'Hedef kitle' : 'Audience', c.audience], [tr ? 'Son tarih' : 'Due date', c.due_date], [tr ? 'Politika sahibi' : 'Policy owner', p.owner], [tr ? 'İncelemeci' : 'Reviewer', p.reviewer]];
  return <><dl className="cpr-facts">{fields.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="par-content" aria-label={tr ? 'Atanmış politika metni' : 'Assigned policy content'}><h3>{tr ? 'Atanmış politika metni' : 'Assigned policy content'}</h3><p>{v.summary}</p><p className="plm-decision-content">{v.content}</p>
      <dl className="cpr-facts">{[[tr ? 'Kontroller' : 'Controls', v.control_refs_json], [tr ? 'Regülasyonlar' : 'Regulations', v.regulation_refs_json], [tr ? 'Riskler' : 'Risks', v.risk_refs_json]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{mappings(value)}</dd></div>)}</dl><p>SHA-256: <code>{v.content_sha256}</code></p></section></>;
}
export default function PolicyAttestationResponse({ id, initialDecision, tr, close }: { id: string; initialDecision: Decision; tr: boolean; close: (saved: boolean) => void }) {
  const resource = useWorkflowRecords<AttestationWorkspace>(`/api/policy-lifecycle?view=attestation&attestationId=${encodeURIComponent(id)}`, null);
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [blocked, setBlocked] = useState(false), [uncertain, setUncertain] = useState(false), [initialized, setInitialized] = useState(false);
  const changed = useRef(false), closeRef = useRef(() => {}), fieldId = useId();
  useEffect(() => { closeRef.current = () => { if (!busy) close(changed.current); }; }, [busy, close]);
  const dismiss = useCallback(() => closeRef.current(), []), dialog = useRecordDialog(true, dismiss);
  const raw = resource.data;
  const data = raw && raw.attestation?.id === id && raw.policy && raw.version && raw.campaign && typeof raw.revision === 'string' && typeof raw.canRespond === 'boolean' ? raw : null;
  const ready = resource.ready && !!data, stale = !!(draft && data && draft.expectedRevision !== data.revision), recorded = !!(draft && data?.receipt?.id === draft.requestId);
  // Initialize once when the source arrives; subsequent refreshes preserve the user's draft.
  if (!initialized && ready && data) { setInitialized(true); if (data.canRespond) setDraft({ requestId: `PAR-${crypto.randomUUID()}`, expectedRevision: data.revision, decision: initialDecision, note: '', confirmed: false }); }
  async function refresh() { const fresh = await resource.reload(); if (fresh) { setBlocked(false); setUncertain(false); if (fresh.attestation?.status !== 'pending') changed.current = true; } }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft || !ready || busy || blocked || stale || !data?.canRespond || !draft.confirmed) return;
    setBusy(true); setNotice('');
    try {
      const { response, body } = await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'attest', attestationId: id, responseMode: 'reviewed', ...draft, confirmation: attestationPhrase(draft.decision) }) }, fetch, 15_000);
      if (response.ok) { changed.current = true; setDraft(null); setUncertain(false); setNotice(tr ? 'Yanıtınız kaydedildi. Yanıt ve incelenen sürüm aşağıda saklanıyor.' : 'Your response is recorded. The response and reviewed version are retained below.'); await refresh(); return; }
      if (response.status === 409 || response.status === 403) setBlocked(true);
      setUncertain(response.status >= 500);
      setNotice(response.status === 409 ? (tr ? 'Kampanya, politika veya yetkiler değişti. Ayrıntıları yenileyip inceleyin; notunuz korundu.' : 'The campaign, policy or permissions changed. Refresh and inspect the details; your note is retained.') : response.status === 403 ? (tr ? 'Yalnız atanmış ve yetkili etkin kullanıcı yanıt verebilir.' : 'Only the assigned active user with access may respond.') : body.code === 'ATTESTATION_INPUT' ? (tr ? 'En az 3 karakter not girin ve kararınızı onaylayın.' : 'Enter a note of at least 3 characters and confirm your decision.') : (tr ? 'Sonuç doğrulanamadı. Aynı yanıtla tekrar deneyin veya ayrıntıları yenileyin; çift yanıt kaydedilmez.' : 'The outcome could not be confirmed. Retry the same response or refresh the details; no duplicate response is recorded.'));
    } catch { setUncertain(true); setNotice(tr ? 'Sonuç doğrulanamadı. Aynı yanıtla tekrar deneyin veya ayrıntıları yenileyin; çift yanıt kaydedilmez.' : 'The outcome could not be confirmed. Retry the same response or refresh the details; no duplicate response is recorded.'); }
    finally { setBusy(false); }
  }
  const editable = !busy && !uncertain;
  const result = data?.receipt;
  return typeof document === 'undefined' ? null : createPortal(<div className="overlay ppr-overlay par-overlay" onMouseDown={event => { if (event.target === event.currentTarget) dismiss(); }}><div ref={dialog} data-escape-layer className="modal plm-modal plm-decision par-dialog" role="dialog" aria-modal="true" aria-label={tr ? 'Politika yanıtı' : 'Policy response'} tabIndex={-1}>
    <header className="modal-head"><h2>{tr ? 'Politika yanıtı' : 'Policy response'}</h2><button data-escape-close type="button" aria-label={tr ? 'Kapat' : 'Close'} disabled={busy} onClick={dismiss}>×</button></header>
    <div className="cpr-body" aria-busy={resource.loading}>
      <div className="cpr-toolbar"><p>{tr ? 'Kampanyada size atanmış sürümü okuyup yanıt verin. Yanıtınız bu sürümün içeriğine bağlanır.' : 'Read and respond to the version assigned in this campaign. Your response is linked to this version’s content.'}</p><button type="button" disabled={busy || resource.loading} onClick={() => void refresh()}>{tr ? 'Ayrıntıları yenile' : 'Refresh details'}</button></div>
      {resource.loading && <p role="status">{tr ? 'Atanmış sürüm yükleniyor…' : 'Loading the assigned version…'}</p>}
      {(resource.error || (resource.ready && !data)) && <p role="alert">{tr ? 'Atanmış politika okunamadı. Notunuz korundu; yenileyerek tekrar deneyin.' : 'The assigned policy could not be read. Your note is retained; refresh to retry.'}</p>}
      {notice && <p role="status" className="cpr-notice">{notice}</p>}
      {data && <>
        {data.campaign.status === 'closed' && <p role="status">{tr ? 'Kampanya kapalı; yeni yanıt kaydedilemez.' : 'The campaign is closed; no new response can be recorded.'}</p>}
        {data.campaign.status === 'open' && String(data.campaign.due_date) < new Date().toISOString().slice(0, 10) && <p>{tr ? 'Son tarih geçti. Kampanya açık olduğu için yanıt verebilirsiniz.' : 'The due date has passed. You can still respond while the campaign is open.'}</p>}
        {data.previousVersion && <p role="status">{tr ? 'Bu kampanya önceki bir sürüme bağlı. Yanıtınız aşağıda gösterilen atanmış sürüm için kaydedilir.' : 'This campaign is tied to an earlier version. Your response applies to the assigned version shown below.'}</p>}
        <PolicyContent source={result?.snapshot || data} tr={tr} />
        {!data.contentVerified && <p role="alert">{tr ? 'Güncel kaynak bütünlüğü doğrulanamadı; yeni yanıt kaydedilemez.' : 'The current source integrity could not be verified; no new response can be recorded.'}</p>}
      </>}
      {draft && !recorded && <form className="cpr-form" onSubmit={event => void submit(event)}>
        {stale && data && <p role="alert">{tr ? 'Ayrıntılar karar taslağınızdan sonra değişti. Atanmış metni ve kampanyayı yeniden inceleyin.' : 'The details changed after your draft. Review the assigned text and campaign again.'} <button type="button" disabled={!ready || busy || !data.canRespond} onClick={() => { setDraft({ ...draft, expectedRevision: data.revision, requestId: `PAR-${crypto.randomUUID()}`, confirmed: false }); setBlocked(false); setUncertain(false); }}>{tr ? 'Güncel bağlamı kullan' : 'Use current context'}</button></p>}
        <label htmlFor={`${fieldId}-decision`}>{tr ? 'Yanıt' : 'Response'}</label><select id={`${fieldId}-decision`} disabled={!editable} value={draft.decision} onChange={event => setDraft({ ...draft, decision: event.target.value as Decision, confirmed: false })}><option value="attested">{tr ? 'Kabul ediyorum' : 'I accept'}</option><option value="declined">{tr ? 'Kabul etmiyorum' : 'I decline'}</option></select>
        <label htmlFor={`${fieldId}-note`}>{tr ? 'Karar / işlem notu' : 'Decision / action note'}</label><textarea id={`${fieldId}-note`} required minLength={3} maxLength={1000} disabled={!editable} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} />
        <label className="cpr-confirm"><input type="checkbox" required checked={draft.confirmed} disabled={!editable || stale || !ready} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />{draft.decision === 'attested' ? (tr ? 'Atanmış sürümü okudum ve kabul ettiğimi doğruluyorum.' : 'I have read the assigned version and confirm my acceptance.') : (tr ? 'Atanmış sürümü okudum ve kabul etmediğimi doğruluyorum.' : 'I have read the assigned version and confirm my refusal.')}</label>
        <button type="submit" disabled={busy || !ready || !data?.canRespond || stale || blocked}>{busy ? (tr ? 'Kaydediliyor…' : 'Recording…') : (tr ? 'Yanıtı kaydet' : 'Record response')}</button>
      </form>}
      {recorded && <p role="status">{tr ? 'Bu yanıt zaten kaydedilmiş; saklanan sonuç aşağıda gösteriliyor.' : 'This response is already recorded; the retained result is shown below.'}</p>}
      {data && data.attestation.status !== 'pending' && <section className="cpr-history" aria-label={tr ? 'Kaydedilen yanıt' : 'Recorded response'}><h3>{tr ? 'Kaydedilen yanıt' : 'Recorded response'}</h3><article><p><strong>{data.attestation.status === 'attested' ? (tr ? 'Kabul edildi' : 'Accepted') : (tr ? 'Kabul edilmedi' : 'Declined')}</strong> · {result?.actor || data.attestation.subject_email} · <time>{result?.respondedAt || data.attestation.attested_at}</time></p><p className="cpr-note">{result?.note || data.attestation.note}</p><code>{result?.contentSha256 || data.attestation.content_sha256}</code>
        {result ? <><p>{tr ? 'Yanıt kaydı' : 'Response receipt'}: {result.id}</p><p role={result.snapshot ? undefined : 'alert'}>{result.snapshot ? (tr ? 'Yukarıdaki içerik, yanıt sırasında incelenen ve saklanan kopyadır.' : 'The content above is the retained copy reviewed when responding.') : (tr ? 'Saklanan inceleme kopyası doğrulanamadı; yukarıda güncel kampanya kaynağı gösteriliyor.' : 'The retained reviewed copy could not be verified; the current campaign source is shown above.')}</p></> : <p>{tr ? 'Bu eski yanıt için incelenen içerik kopyası saklanmamış. Yukarıda kampanyanın atanmış sürümü gösteriliyor.' : 'No reviewed content snapshot was retained for this legacy response. The campaign’s assigned version is shown above.'}</p>}
      </article></section>}
    </div>
  </div></div>, document.body);
}
