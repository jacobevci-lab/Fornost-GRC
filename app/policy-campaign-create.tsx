"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { withBasePath } from './base-path';
import { requestJsonWithDeadline } from './bounded-json-request';
import { useRecordDialog } from './use-record-dialog';
import { useWorkflowRecords } from './use-workflow-records';
import type { CampaignIssueInput, CampaignIssuePreview, CampaignPeople, CampaignPerson } from './policy-lifecycle/campaign-issuance';
import './continuity-plan-review.css';
import './policy-campaign-create.css';

function references(value: unknown) {
  try { const refs: unknown = JSON.parse(String(value)); return Array.isArray(refs) ? refs.filter(v => typeof v === 'string').join(', ') || '—' : '—'; } catch { return '—'; }
}

type PolicyChoice = { id: string; code: string; title: string; audience: string };
export default function PolicyCampaignCreate({ policies, tr, close }: { policies: PolicyChoice[]; tr: boolean; close: (changed: boolean, id?: string) => void }) {
  const [form, setForm] = useState({ policyId: policies[0]?.id || '', name: '', audience: policies[0]?.audience || '', dueDate: '' });
  const [selected, setSelected] = useState<CampaignPerson[]>([]), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const [preview, setPreview] = useState<CampaignIssuePreview | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [blocked, setBlocked] = useState(false), [uncertain, setUncertain] = useState(false), [created, setCreated] = useState(''), [unavailableIds, setUnavailableIds] = useState<string[]>([]);
  const [requestId] = useState(() => `PAC-${crypto.randomUUID()}`), fieldId = useId();
  const changed = useRef(false), closeRef = useRef(() => {});
  useEffect(() => { closeRef.current = () => { if (!busy) close(changed.current); }; }, [busy, close]);
  const dismiss = useCallback(() => closeRef.current(), []), dialog = useRecordDialog(true, dismiss);
  useEffect(() => {
    if (preview) dialog.current?.focus({ preventScroll: true });
    else dialog.current?.querySelector('select')?.focus({ preventScroll: true });
  }, [preview, created, dialog]);
  const directory = useWorkflowRecords<CampaignPeople>(`/api/policy-lifecycle?view=campaign-people&q=${encodeURIComponent(query)}&page=${page}`, null);
  const people = directory.data && Array.isArray(directory.data.people) && typeof directory.data.hasMore === 'boolean' ? directory.data : null;
  function message(code: unknown, fallback: string) {
    const messages: Record<string, [string, string]> = {
      CAMPAIGN_ISSUE_ACCESS: ['Kampanyayı yalnız etkin Admin hazırlayabilir.', 'Only an active Admin can prepare a campaign.'],
      CAMPAIGN_ISSUE_INPUT: ['Kampanya bilgilerini, geçerli tarihi ve 1–500 kişi seçimini kontrol edin.', 'Check the campaign details, valid date and selection of 1–500 people.'],
      CAMPAIGN_ISSUE_RECIPIENTS: ['Seçilen hesaplardan biri artık uygun değil. Seçimi düzenleyip etkin ve erişimi olan kişileri yeniden seçin.', 'A selected account is no longer eligible. Edit the selection and choose active accounts with access again.'],
      CAMPAIGN_ISSUE_SOURCE: ['Güncel yayımlanmış politika doğrulanamadı. Politika seçimini kontrol edin.', 'The current published policy could not be verified. Check the policy selection.'],
      POLICY_SOURCE_MISSING: ['Politika veya sürüm artık bulunamıyor. Seçimi düzenleyin.', 'The policy or version is no longer available. Edit the selection.'],
    };
    return messages[String(code)]?.[tr ? 0 : 1] || fallback;
  }
  async function review(event?: FormEvent) {
    event?.preventDefault(); if (busy || uncertain || created) return;
    setBusy(true); setNotice(''); setConfirmed(false); setBlocked(true);
    const input: CampaignIssueInput = { ...form, subjectIds: selected.map(p => p.id) };
    try {
      const { response, body } = await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview-campaign', ...input }) }, fetch, 15_000);
      if (Array.isArray(body.unavailableIds)) setUnavailableIds(body.unavailableIds.filter((id): id is string => typeof id === 'string'));
      if (!response.ok || !body.policy || !body.version || !Array.isArray(body.participants) || !body.request || typeof body.revision !== 'string') { setNotice(message(body.code, tr ? 'Önizleme okunamadı. Bilgileriniz ve seçimleriniz korundu; tekrar deneyin.' : 'The preview could not be read. Your details and selections are retained; retry.')); return; }
      setPreview(body as unknown as CampaignIssuePreview); setBlocked(false); setUnavailableIds([]);
    } catch { setNotice(tr ? 'Önizleme okunamadı. Bilgileriniz ve seçimleriniz korundu; tekrar deneyin.' : 'The preview could not be read. Your details and selections are retained; retry.'); }
    finally { setBusy(false); }
  }
  async function issue() {
    if (!preview || !confirmed || busy || blocked || created) return;
    setBusy(true); setNotice(''); changed.current = true;
    try {
      const { response, body } = await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create-campaign', issueMode: 'directory-reviewed', ...preview.request, expectedRevision: preview.revision, requestId, confirmation: 'ISSUE POLICY CAMPAIGN' }) }, fetch, 15_000);
      if (Array.isArray(body.unavailableIds)) setUnavailableIds(body.unavailableIds.filter((id): id is string => typeof id === 'string'));
      if (response.ok && body.id === requestId) { setCreated(requestId); setUncertain(false); setNotice(tr ? 'Kampanya açıldı. Seçilen kişilerin İşlerim listesinde atanmış sürüm için görevleri hazır.' : 'Campaign created. Selected participants now have tasks for the assigned version in My Work.'); return; }
      if (response.status === 409 || response.status === 403 || response.status === 400) { setBlocked(true); setUncertain(false); setConfirmed(false); }
      else setUncertain(true);
      setNotice(response.status >= 500 ? (tr ? 'Sonuç doğrulanamadı. Bu pencereyi açık tutup aynı kampanya kaydını tekrar deneyin; ikinci kampanya açılmaz.' : 'The outcome could not be confirmed. Keep this window open and retry the same campaign; no second campaign is created.') : message(body.code, tr ? 'Politika, katılımcılar veya yetkiler değişti. Önizlemeyi yenileyip tekrar onaylayın; bilgileriniz korundu.' : 'The policy, participants or permissions changed. Refresh the preview and confirm again; your details are retained.'));
    } catch { setUncertain(true); setNotice(tr ? 'Sonuç doğrulanamadı. Bu pencereyi açık tutup aynı kampanya kaydını tekrar deneyin; ikinci kampanya açılmaz.' : 'The outcome could not be confirmed. Keep this window open and retry the same campaign; no second campaign is created.'); }
    finally { setBusy(false); }
  }
  const role = (value: string) => tr ? ({ Admin: 'Yönetici', Editor: 'Düzenleyen', Viewer: 'Görüntüleyen' }[value] || value) : value;
  return typeof document === 'undefined' ? null : createPortal(<div className="overlay ppr-overlay pci-overlay" onMouseDown={event => { if (event.target === event.currentTarget) dismiss(); }}><div ref={dialog} data-escape-layer className="modal plm-modal plm-decision pci-dialog" role="dialog" aria-modal="true" aria-label={tr ? 'Attestation kampanyası' : 'Attestation campaign'} tabIndex={-1}>
    <header className="modal-head"><h2>{tr ? 'Attestation kampanyası' : 'Attestation campaign'}</h2><button type="button" data-escape-close disabled={busy} aria-label={tr ? 'Kapat' : 'Close'} onClick={dismiss}>×</button></header>
    <div className="cpr-body" aria-busy={busy}>
      {notice && <p className="cpr-notice" role={created ? 'status' : 'alert'}>{notice}</p>}
      {unavailableIds.length > 0 && <p role="alert">{tr ? 'Seçimi kontrol edin' : 'Check these selections'}: {selected.filter(p => unavailableIds.includes(p.id)).map(p => p.email).join(', ')}</p>}
      {!preview ? <form className="cpr-form" onSubmit={event => void review(event)}>
        <p>{tr ? 'Yayımlanmış politikayı ve görev alacak kişileri seçin. Hedef kitle açıklaması otomatik kişi eklemez; yalnız seçtiğiniz hesaplara görev açılır.' : 'Choose a published policy and the people who will receive tasks. The audience description does not add people automatically; only selected accounts receive assignments.'}</p>
        <label htmlFor={`${fieldId}-policy`}>{tr ? 'Yayındaki politika' : 'Published policy'}</label><select id={`${fieldId}-policy`} required disabled={busy} value={form.policyId} onChange={event => { const p = policies.find(p => p.id === event.target.value); setForm({ ...form, policyId: event.target.value, audience: p?.audience || form.audience }); }}><option value="">{tr ? 'Politika seçin' : 'Select policy'}</option>{policies.map(p => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}</select>
        {!policies.length && <p role="status">{tr ? 'Henüz yayımlanmış politika yok. Önce mevcut sürüm yayımlama sürecini tamamlayın.' : 'No published policy is available. Complete the existing publication workflow first.'}</p>}
        <label htmlFor={`${fieldId}-name`}>{tr ? 'Kampanya adı' : 'Campaign name'}</label><input id={`${fieldId}-name`} required minLength={5} maxLength={200} disabled={busy} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
        <label htmlFor={`${fieldId}-date`}>{tr ? 'Son tarih' : 'Due date'}</label><input id={`${fieldId}-date`} type="date" required min={new Date().toISOString().slice(0, 10)} disabled={busy} value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} />
        <label htmlFor={`${fieldId}-audience`}>{tr ? 'Hedef kitle açıklaması' : 'Audience description'}</label><input id={`${fieldId}-audience`} required minLength={3} maxLength={500} disabled={busy} value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value })} />
        <fieldset className="pci-people"><legend>{tr ? 'Katılımcılar' : 'Participants'}</legend><p>{tr ? 'Etkin ve tam erişimli hesapları seçin. Görüntüleyen hesaplar da politika yanıtı verebilir. En fazla 500 kişi.' : 'Select active accounts with full access. Viewers can also respond to policies. Up to 500 people.'}</p>
          <label htmlFor={`${fieldId}-search`}>{tr ? 'Katılımcı ara' : 'Search participants'}</label><input id={`${fieldId}-search`} type="search" maxLength={160} disabled={busy} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
          {directory.loading && <p role="status">{tr ? 'Kişiler yükleniyor…' : 'Loading people…'}</p>}
          {(directory.error || (directory.ready && !people)) && <p role="alert">{tr ? 'Kişiler okunamadı; seçiminiz korundu.' : 'People could not be read; your selection is retained.'} <button type="button" disabled={busy || directory.loading} onClick={() => void directory.reload()}>{tr ? 'Kişileri yenile' : 'Refresh people'}</button></p>}
          {people && <><div className="pci-choices">{people.people.map(person => <label key={person.id}><input type="checkbox" disabled={busy || (!selected.some(p => p.id === person.id) && selected.length >= 500)} checked={selected.some(p => p.id === person.id)} onChange={event => setSelected(event.target.checked ? [...selected, person] : selected.filter(p => p.id !== person.id))} /><span><b>{person.name}</b><small>{person.email} · {role(person.role)}</small></span></label>)}</div>
            {!people.people.length && <p>{tr ? 'Bu sayfada uygun kişi yok. Aramayı değiştirin veya sonraki sayfayı kontrol edin.' : 'No eligible people on this page. Change the search or check the next page.'}</p>}
            <div className="pci-pages"><button type="button" disabled={busy || directory.loading || page === 0} onClick={() => setPage(p => p - 1)}>{tr ? 'Önceki kişiler' : 'Previous people'}</button><span>{tr ? 'Sayfa' : 'Page'} {page + 1}</span><button type="button" disabled={busy || directory.loading || !people.hasMore} onClick={() => setPage(p => p + 1)}>{tr ? 'Sonraki kişiler' : 'Next people'}</button></div><small>{tr ? 'Her sayfada en fazla 50 hesap taranır; yetkisiz hesaplar gösterilmez.' : 'Each page checks up to 50 accounts; ineligible accounts are omitted.'}</small></>}
          <section className="pci-selected" aria-label={tr ? 'Seçilen katılımcılar' : 'Selected participants'}><h3>{tr ? 'Seçilen katılımcılar' : 'Selected participants'} ({selected.length}/500)</h3>{!selected.length && <p>{tr ? 'Henüz kişi seçilmedi.' : 'No people selected yet.'}</p>}{selected.map(person => <div key={person.id}><span>{person.name} · {person.email}</span><button type="button" disabled={busy} aria-label={`${tr ? 'Kaldır' : 'Remove'}: ${person.email}`} onClick={() => setSelected(selected.filter(p => p.id !== person.id))}>{tr ? 'Kaldır' : 'Remove'}</button></div>)}</section>
        </fieldset>
        <button type="submit" disabled={busy || !policies.length || !selected.length || !directory.ready || !people}>{busy ? (tr ? 'Hazırlanıyor…' : 'Preparing…') : (tr ? 'Kampanyayı önizle' : 'Preview campaign')}</button>
      </form> : <section className="pci-preview" aria-label={tr ? 'Kampanya önizlemesi' : 'Campaign preview'}>
        <dl className="cpr-facts">{[[tr ? 'Kampanya' : 'Campaign', preview.request.name], [tr ? 'Hedef kitle' : 'Audience', preview.request.audience], [tr ? 'Son tarih' : 'Due date', preview.request.dueDate], [tr ? 'Politika' : 'Policy', `${preview.policy.code} · ${preview.policy.title}`], [tr ? 'Atanacak sürüm' : 'Version to assign', `v${preview.version.version_number} · ${preview.version.effective_date}`], [tr ? 'Katılımcı sayısı' : 'Participant count', preview.participants.length]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <details open><summary>{tr ? 'Atanacak politika metni' : 'Policy content to assign'}</summary><p>{preview.version.summary}</p><p className="plm-decision-content">{preview.version.content}</p>{[[tr ? 'Kontroller' : 'Controls', preview.version.control_refs_json], [tr ? 'Regülasyonlar' : 'Regulations', preview.version.regulation_refs_json], [tr ? 'Riskler' : 'Risks', preview.version.risk_refs_json]].map(([label, value]) => <p key={String(label)}>{label}: {references(value)}</p>)}<code>{preview.version.content_sha256}</code></details>
        <details open><summary>{tr ? 'Görev açılacak kişiler' : 'People receiving assignments'} ({preview.participants.length})</summary><ul className="pci-preview-people" tabIndex={0} aria-label={tr ? 'Görev açılacak kişiler' : 'People receiving assignments'}>{preview.participants.map(person => <li key={person.id}><strong>{person.name}</strong><span>{person.email} · {role(person.role)}</span></li>)}</ul></details>
        {created ? <><p>{tr ? 'Kampanya kaydı' : 'Campaign record'}: <code>{created}</code></p><button type="button" onClick={() => close(true, created)}>{tr ? 'Kampanyayı aç' : 'Open campaign'}</button></> : <div className="cpr-form">
          <label className="cpr-confirm"><input type="checkbox" checked={confirmed} disabled={busy || uncertain || blocked} onChange={event => setConfirmed(event.target.checked)} />{tr ? 'Politika sürümünü ve seçilen kişileri inceledim; bu kişilere görev açılmasını onaylıyorum.' : 'I reviewed the policy version and selected people and confirm creating their assignments.'}</label>
          <button type="button" disabled={busy || blocked || !confirmed} onClick={() => void issue()}>{busy ? (tr ? 'Kaydediliyor…' : 'Recording…') : (tr ? 'Kampanyayı oluştur' : 'Create campaign')}</button>
          <div className="pci-pages"><button type="button" disabled={busy || uncertain} onClick={() => void review()}>{tr ? 'Önizlemeyi yenile' : 'Refresh preview'}</button><button type="button" disabled={busy || uncertain} onClick={() => { setPreview(null); setConfirmed(false); setBlocked(false); }}>{tr ? 'Seçimi düzenle' : 'Edit selection'}</button></div>
        </div>}
      </section>}
    </div>
  </div></div>, document.body);
}
