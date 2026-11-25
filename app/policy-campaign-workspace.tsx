"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { requestJsonWithDeadline } from './bounded-json-request';
import { useRecordDialog } from './use-record-dialog';
import type { CampaignWorkspace, PolicyCampaign } from './policy-lifecycle/campaigns';
import './policy-campaign-workspace.css';

export default function PolicyCampaignWorkspace({ campaigns, tr, onChanged, openId, onCloseOpen }: { campaigns: PolicyCampaign[]; tr: boolean; onChanged: () => void; openId?: string; onCloseOpen?: () => void }) {
  const [id, setId] = useState(''), [query, setQuery] = useState(''), [scope, setScope] = useState('open'), [page, setPage] = useState(0);
  const matches = campaigns.filter(c => (scope === 'all' || c.status === scope) && `${c.name} ${c.audience} ${c.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="pcw-list" aria-label={tr ? 'Kampanya sonuçları' : 'Campaign outcomes'}>
    <header><div><h3>{tr ? 'Kampanya sonuçları' : 'Campaign outcomes'}</h3><p>{tr ? 'Yanıtları inceleyin; tamamlanan veya durdurulan kampanyaları gerekçesiyle kapatın.' : 'Review responses and close completed or discontinued campaigns with a reason.'}</p></div></header>
    <div className="pcw-filters"><label>{tr ? 'Kampanya ara' : 'Search campaigns'}<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><label>{tr ? 'Kampanya durumu' : 'Campaign status'}<select aria-label={tr ? 'Kampanya durumu' : 'Campaign status'} value={scope} onChange={e => { setScope(e.target.value); setPage(0); }}><option value="open">{tr ? 'Açık' : 'Open'}</option><option value="closed">{tr ? 'Kapalı' : 'Closed'}</option><option value="all">{tr ? 'Tümü' : 'All'}</option></select></label></div>
    {campaigns.length >= 1000 && <p role="status">{tr ? 'İlk 1.000 kampanya gösteriliyor; liste tüm geçmişi kapsamayabilir.' : 'Showing the first 1,000 campaigns; older history may be outside this list.'}</p>}
    <div className="pcw-cards">{matches.slice(page * 10, page * 10 + 10).map(c => <article key={c.id}><div><h4>{c.name}</h4><p>{c.audience}</p><small>{c.dueDate} · {c.status === 'open' ? (tr ? 'Açık' : 'Open') : (tr ? 'Kapalı' : 'Closed')}</small></div><p>{tr ? 'Kabul' : 'Accepted'}: {c.attestedCount} · {tr ? 'Ret' : 'Declined'}: {c.declinedCount} · {tr ? 'Cevapsız' : 'Unanswered'}: {c.pendingCount}</p><button type="button" onClick={() => setId(c.id)} aria-label={`${tr ? 'Kampanyayı incele' : 'Review campaign'}: ${c.name}`}>{tr ? 'Sonuçları incele' : 'Review outcomes'}</button></article>)}</div>
    {!matches.length && <p>{tr ? 'Bu seçimde kampanya yok.' : 'No campaigns match this selection.'}</p>}
    {matches.length > 10 && <div className="pcw-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{tr ? 'Önceki' : 'Previous'}</button><span>{page + 1} / {Math.ceil(matches.length / 10)}</span><button disabled={(page + 1) * 10 >= matches.length} onClick={() => setPage(p => p + 1)}>{tr ? 'Sonraki' : 'Next'}</button></div>}
    {(openId || id) && <CampaignDialog key={openId || id} id={openId || id} tr={tr} close={changed => { setId(''); onCloseOpen?.(); if (changed) onChanged(); }} />}
  </section>;
}

function CampaignDialog({ id, tr, close }: { id: string; tr: boolean; close: (changed: boolean) => void }) {
  const [data, setData] = useState<CampaignWorkspace | null>(null), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [stale, setStale] = useState(false);
  const [draft, setDraft] = useState<{ revision: string; requestId: string; note: string; confirmed: boolean; outstanding: boolean } | null>(null);
  const [filter, setFilter] = useState('all'), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const changed = useRef(false), controller = useRef<AbortController | null>(null), closeRef = useRef(() => {});
  useEffect(() => { closeRef.current = () => { if (!busy) close(changed.current); }; }, [busy, close]);
  const dismiss = useCallback(() => closeRef.current(), []), dialog = useRecordDialog(true, dismiss);
  const prepareButton = useRef<HTMLButtonElement>(null), reasonField = useRef<HTMLTextAreaElement>(null), hadDraft = useRef(false), returnFocus = useRef(false), hasDraft = Boolean(draft);
  useEffect(() => {
    if (hasDraft && !hadDraft.current) reasonField.current?.focus({ preventScroll: true });
    if (!hasDraft && hadDraft.current) { returnFocus.current = true; dialog.current?.focus({ preventScroll: true }); }
    if (!hasDraft && returnFocus.current && !loading && !busy) {
      if (document.activeElement === dialog.current) (prepareButton.current && !prepareButton.current.disabled ? prepareButton.current : dialog.current)?.focus({ preventScroll: true });
      returnFocus.current = false;
    }
    hadDraft.current = hasDraft;
  }, [hasDraft, loading, busy, dialog]);
  const load = useCallback(async () => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current; setLoading(true); setFailed(false);
    try {
      const { response, body } = await requestJsonWithDeadline(withBasePath(`/api/policy-lifecycle?view=campaign&campaignId=${encodeURIComponent(id)}`), { cache: 'no-store', signal: current.signal }, fetch, 10_000);
      if (!response.ok || !body.campaign || !body.version || !Array.isArray(body.recipients) || typeof body.revision !== 'string' || typeof body.complete !== 'boolean') throw new Error('read');
      if (!current.signal.aborted && controller.current === current) { setData(body as unknown as CampaignWorkspace); if ((body.campaign as {status:string}).status === 'closed') changed.current = true; setStale(false); }
    } catch { if (!current.signal.aborted && controller.current === current) setFailed(true); }
    finally { if (!current.signal.aborted && controller.current === current) setLoading(false); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { window.clearTimeout(timer); controller.current?.abort(); }; }, [load]);
  const recipients = useMemo(() => data?.recipients.filter(r => (filter === 'all' || r.status === filter) && `${r.email} ${r.note}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) || [], [data, filter, search]);
  const ready = !!data && !loading && !failed && !stale && data.complete;
  const changedRevision = !!draft && !!data && draft.revision !== data.revision;
  async function submit() {
    if (!draft || !data || !ready || changedRevision || !draft.confirmed) return;
    setBusy(true); setNotice('');
    try {
      const { response, body } = await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'close-campaign', campaignId: id, requestId: draft.requestId, expectedRevision: draft.revision, note: draft.note, acknowledgeOutstanding: draft.outstanding, confirmation: 'CLOSE CAMPAIGN' }) }, fetch, 15_000);
      if (!response.ok) {
        if (response.status === 409) setStale(true);
        setNotice(response.status === 409 ? (tr ? 'Sonuçlar değişti. Gerekçeniz korundu; sonuçları yenileyip güncel sürümü inceleyin.' : 'Results changed. Your reason is retained; refresh and review the current results.') : response.status === 403 ? (tr ? 'Kampanya kapatma yetkiniz yok. Hesap erişimini kontrol edin.' : 'You cannot close this campaign. Check account access.') : (tr ? 'Kapatma kaydedilemedi. Gerekçeyi ve onayları kontrol edin.' : 'Closure was not saved. Check the reason and acknowledgements.'));
        if (body.code === 'CAMPAIGN_CONFLICT') setStale(true); return;
      }
      changed.current = true; setDraft(null); setNotice(tr ? 'Kampanya kapatıldı. Katılımcı yanıtları değiştirilmedi.' : 'Campaign closed. Participant responses were preserved.'); await load();
    } catch { setNotice(tr ? 'İşlemin sonucu doğrulanamadı. Aynı kararı yeniden gönderin veya sonuçları yenileyin; tekrar gönderim ikinci kapanış oluşturmaz.' : 'The outcome could not be confirmed. Retry the same decision or refresh results; an identical retry does not create another closure.'); }
    finally { setBusy(false); }
  }
  const statusLabel = (status: string) => ({ pending: tr ? 'Cevapsız' : 'Unanswered', attested: tr ? 'Kabul edildi' : 'Accepted', declined: tr ? 'Reddedildi' : 'Declined' })[status] || status;
  return <div className="overlay" onClick={e => { if (e.target === e.currentTarget) dismiss(); }}><div data-escape-layer className="modal plm-modal pcw-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={tr ? 'Kampanya sonuçları ve kapanış' : 'Campaign outcomes and closure'} tabIndex={-1}>
    <header><div><h3>{tr ? 'Kampanya sonuçları ve kapanış' : 'Campaign outcomes and closure'}</h3><p>{data?.campaign.name}</p></div><button data-escape-close type="button" disabled={busy} onClick={dismiss} aria-label={tr ? 'Kapat' : 'Close'}>×</button></header>
    <div className="pcw-body">{!draft&&<button type="button" disabled={loading || busy} onClick={() => void load()}>{tr ? 'Sonuçları yenile' : 'Refresh results'}</button>}
      {loading && <p role="status">{tr ? 'Kampanya yükleniyor…' : 'Loading campaign…'}</p>}
      {failed && !draft && <p role="alert">{tr ? 'Kampanya sonuçları yüklenemedi. Tekrar deneyin; gerekçeniz korundu.' : 'Campaign results could not be loaded. Retry; your reason is retained.'}</p>}
      {notice && !draft && <p role="status">{notice}</p>}
      {data && <><div className="pcw-facts"><div><span>{tr ? 'Politika sürümü' : 'Policy version'}</span><b>{data.version.policyCode} · v{data.version.number}</b></div><div><span>{tr ? 'Kabul' : 'Accepted'}</span><b>{data.campaign.attestedCount}</b></div><div><span>{tr ? 'Ret' : 'Declined'}</span><b>{data.campaign.declinedCount}</b></div><div><span>{tr ? 'Cevapsız' : 'Unanswered'}</span><b>{data.campaign.pendingCount}</b></div></div>
        {data.campaign.createdBy && <p>{tr ? 'Kampanyayı açan' : 'Campaign opened by'}: {data.campaign.createdBy} · <time>{data.campaign.createdAt}</time></p>}
        <p>{data.campaign.audience} · {tr ? 'Son tarih' : 'Due'}: {data.campaign.dueDate}</p>
        {!data.complete && <p role="alert">{tr ? 'Katılımcı kapsamı doğrulanamadı. En fazla 500 kayıt gösterilir; eksik sonuçlarla kapatma yapılamaz.' : 'Recipient coverage could not be verified. Up to 500 records are shown; incomplete results cannot be closed.'}</p>}
        <details><summary>{tr ? 'Kampanyaya bağlı politika içeriği' : 'Policy content linked to this campaign'}</summary><h4>{data.version.policyTitle} · v{data.version.number}</h4><p className="pcw-content">{data.version.content}</p><code>{data.version.contentSha256}</code></details>
        <div className="pcw-filters"><label>{tr ? 'Katılımcı veya not ara' : 'Search participants or notes'}<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label><label>{tr ? 'Yanıt durumu' : 'Response status'}<select aria-label={tr ? 'Yanıt durumu' : 'Response status'} value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">{tr ? 'Tümü' : 'All'}</option>{['attested', 'declined', 'pending'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></div>
        <div className="pcw-recipients">{recipients.slice(page * 25, page * 25 + 25).map(r => <article key={r.id}><div><b>{r.email}</b><span>{statusLabel(r.status)}</span></div>{r.note && <p>{r.note}</p>}{r.respondedAt && <small>{r.respondedAt}</small>}</article>)}</div>
        {!recipients.length && <p>{tr ? 'Bu seçimde katılımcı yok.' : 'No participants match this selection.'}</p>}
        {recipients.length > 25 && <div className="pcw-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{tr ? 'Önceki yanıtlar' : 'Previous responses'}</button><span>{page + 1} / {Math.ceil(recipients.length / 25)}</span><button disabled={(page + 1) * 25 >= recipients.length} onClick={() => setPage(p => p + 1)}>{tr ? 'Sonraki yanıtlar' : 'Next responses'}</button></div>}
        {data.campaign.status === 'closed' && <section className="pcw-history"><h4>{tr ? 'Kapanış kaydı' : 'Closure record'}</h4><p>{data.campaign.closedBy} · {data.campaign.closedAt}</p>{data.closure ? <><p>{data.closure.note}</p><p>{tr ? 'Kapanış anında' : 'At closure'}: {data.closure.counts.attested} {tr ? 'kabul' : 'accepted'} · {data.closure.counts.declined} {tr ? 'ret' : 'declined'} · {data.closure.counts.pending} {tr ? 'cevapsız' : 'unanswered'}</p></> : <p>{tr ? 'Bu eski kapanış için ayrıntılı karar kaydı yok.' : 'A detailed decision record is unavailable for this legacy closure.'}</p>}<p>{tr ? 'Kapatma, cevapsız veya reddedilmiş yanıtları kabul edilmiş saymaz.' : 'Closing does not count unanswered or declined responses as accepted.'}</p></section>}
        {!draft && data.campaign.status === 'open' && <button ref={prepareButton} type="button" disabled={!ready || busy} onClick={() => { setDraft({ revision: data.revision, requestId: `PCC-${crypto.randomUUID()}`, note: '', confirmed: false, outstanding: false }); setNotice(''); }}>{tr ? 'Kapanışı hazırla' : 'Prepare closure'}</button>}
      </>}
      {draft && <form className="pcw-close" onSubmit={e => { e.preventDefault(); void submit(); }}><h4>{tr ? 'Kampanyayı kapat' : 'Close campaign'}</h4><p>{tr ? 'Yeni yanıt alımı duracak. Cevapsız kayıtlar geçmişte korunacak ve aktif iş kuyruğundan çıkacak.' : 'New responses will stop. Unanswered records remain in history and leave the active work queue.'}</p>
        {notice && <p role="status">{notice}</p>}
        {failed && <p role="alert">{tr ? 'Kampanya sonuçları yüklenemedi. Tekrar deneyin; gerekçeniz korundu.' : 'Campaign results could not be loaded. Retry; your reason is retained.'}</p>}
        <button type="button" disabled={loading || busy} onClick={() => void load()}>{tr ? 'Sonuçları yenile' : 'Refresh results'}</button>
        <label>{tr ? 'Kapanış gerekçesi' : 'Closure reason'}<textarea ref={reasonField} aria-label={tr ? 'Kapanış gerekçesi' : 'Closure reason'} required minLength={20} maxLength={1000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
        {changedRevision && <p role="alert">{tr ? 'Güncel sonuçlar taslağınızdaki sürümden farklı. Sayıları ve yanıtları yeniden inceleyin.' : 'Current results differ from the version in your draft. Review the counts and responses again.'} <button type="button" disabled={!ready || busy || data?.campaign.status !== 'open'} onClick={() => { if (data) { setDraft({ ...draft, revision: data.revision, requestId: `PCC-${crypto.randomUUID()}`, confirmed: false, outstanding: false }); setNotice(''); } }}>{tr ? 'Güncel sonuçları kullan' : 'Use current results'}</button></p>}
        <label className="pcw-check"><input type="checkbox" checked={draft.outstanding} onChange={e => setDraft({ ...draft, outstanding: e.target.checked })} />{tr ? 'Cevapsız ve reddedilmiş yanıtları inceledim; kabul edilmiş sayılmadan kampanyayı kapatıyorum.' : 'I reviewed unanswered and declined responses and am closing without counting them as accepted.'}</label>
        <label className="pcw-check"><input type="checkbox" required checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} />{tr ? 'Bu kampanyada yeni yanıt alımının durmasını onaylıyorum.' : 'I confirm that this campaign will stop accepting responses.'}</label>
        <footer><button type="button" disabled={busy} onClick={() => setDraft(null)}>{tr ? 'Taslağı iptal et' : 'Cancel draft'}</button><button type="submit" disabled={busy || !ready || changedRevision || data?.campaign.status !== 'open' || !draft.confirmed || (!!data && (data.campaign.pendingCount > 0 || data.campaign.declinedCount > 0) && !draft.outstanding)}>{tr ? 'Kampanyayı kapat' : 'Close campaign'}</button></footer>
      </form>}
    </div>
  </div></div>;
}
