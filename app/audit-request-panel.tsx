"use client";
import { CopyRecordLink } from './record-link-controls';
import { useCallback, useEffect, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import { emptyAuditRequest, requestDraftPreview, requestNextActor, requestNextDue, requestStatusLabels, validateAuditRequestFields, type AuditRequest, type AuditRequestEvidence, type AuditRequestFields, type AuditRequestWorkflow } from './audit-requests';
import { auditRequestProgress } from './audit-request-progress';
import { AuditReminderPanel } from './audit-reminder-panel';
import type { SavedAuditReminderProfile } from './audit-reminder-profile';
import { AuditWorkplanPanel } from './audit-workplan-panel';
import './audit-request-panel.css';
import { EvidenceDocumentPreview } from './evidence-document-preview';
import { AuditDeadlineAdjustmentPanel, DeadlineAdjustmentHistory } from './audit-deadline-adjustment-panel';
import { sameDeadlineDates, type DeadlineAdjustment, type DeadlineAdjustmentInput, type DeadlineDates } from './audit-deadline-adjustment';

type ProposedDates = { input: DeadlineAdjustmentInput; after: DeadlineDates } | null;

type Data = { reminderProfile: SavedAuditReminderProfile; workflow: AuditRequestWorkflow; requests: AuditRequest[]; complete: boolean; actorEmail: string; canManage: boolean; evidenceAccess: boolean;
  people: { email: string; name: string }[]; peopleComplete: boolean; evidenceChoices: AuditRequestEvidence[]; evidenceChoicesComplete: boolean;
  planRevision: string; periodStart: string; periodEnd: string; eventsComplete: boolean;
  events: { id: string; request_id: string; action: string; actor: string; created_at: string; note: string; activationReason: string; planRevision: string; status: AuditRequest['status']; versionIds: string[]; deadlineAdjustment?: DeadlineAdjustment }[] };
const messages: Record<string, [string, string]> = {
  'deadline-calendar-conflict': ['Takvim değişti. Taslağınız korundu; takvimi yenileyin, öneriyi geri alın ve tarihleri yeniden önizleyin.', 'The calendar changed. Your draft is retained; refresh the calendar, undo the proposal and preview the dates again.'],
  'deadline-adjustment': ['Tarih önerisi taslakla eşleşmiyor. Tarihleri yeniden önizleyin.', 'The date proposal does not match the draft. Preview the dates again.'],
  'deadline-calendar': ['İş günü takvimini kaydedip tarihleri yeniden önizleyin.', 'Save a business-day calendar and preview the dates again.'],
  'audit-closed': ['Denetim kapalı. Önce Kapanış ve onay görünümünden gerekçeyle yeniden açın.', 'The audit is closed. Reopen it with a reason in Closure and approval first.'],
  'reminder-profile': ['Hatırlatma takvimini, eşikleri ve eskalasyon kişisini kontrol edin.', 'Check the reminder calendar, thresholds and escalation recipient.'],
  'calendar-source': ['Takvim içeriği kaynak sürümle eşleşmiyor. Güncel takvimi yeniden önizleyin veya yerel takvime geçin.', 'Calendar content does not match its source version. Preview the calendar again or use a local calendar.'],
  'calendar-changed': ['Ortak takvim değişti veya arşivlendi. Taslağınız korundu; güncel sürümü kontrol edip yeniden uygulayın.', 'The shared calendar changed or was archived. Your draft was retained; inspect and apply the current version.'],
  fields: ['Başlık, kabul ölçütü, sorumlu ve inceleyeni doldurun.', 'Complete the title, acceptance criteria, owner and reviewer.'],
  dates: ['Gerçek ve sıralı tarihler girin. İnceleme tarihi teslimden önce olamaz.', 'Enter valid date ranges. Review cannot be due before submission.'],
  'independent-reviewer': ['İnceleyen sorumludan farklı olmalı.', 'The reviewer must differ from the owner.'],
  assignee: ['Sorumlu ve inceleyen etkin hesap olmalı; denetim yazma ve kanıt okuma yetkisi gerekir.', 'Owner and reviewer need active accounts, audit write and evidence read access.'],
  forbidden: ['Bu işlemi yapma yetkiniz yok.', 'You cannot perform this action.'],
  conflict: ['Kayıt değişmiş olabilir. Taslağınız korunuyor; güncel kaydı yeniden yükleyin.', 'The record may have changed. Your draft is retained; reload the current record.'],
  'preview-changed': ['Taslak talepler değişti. Yeniden yükleyip güncel özeti kontrol edin.', 'Draft requests changed. Reload and check the current preview.'],
  'plan-changed': ['Denetim planı değişti. Yeniden yükleyip başlangıç özetini kontrol edin.', 'The audit plan changed. Reload and review the launch summary.'],
  transition: ['Kayıt artık bu işleme uygun durumda değil. Yeniden yükleyin.', 'The record is no longer in a state that allows this action. Reload.'],
  empty: ['Başlatmak için en az bir taslak talep ekleyin.', 'Add at least one draft request before starting.'],
  evidence: ['1–10 mevcut kanıt sürümü seçin. Kayıp veya değişmiş sürümler kabul edilemez.', 'Select 1–10 available evidence versions. Missing or changed versions cannot be accepted.'],
  note: ['En az 5 karakterlik karar gerekçesi yazın.', 'Enter a decision reason of at least 5 characters.'],
  timezone: ['Geçerli bir IANA saat dilimi girin; örneğin Europe/Istanbul.', 'Enter a valid IANA time zone, such as Europe/Istanbul.'],
  'workplan-closed': ['İş planı kapalı. Yeni talep için gerekçeyle yeniden açın.', 'The work plan is closed. Reopen it with a reason before adding requests.'],
  'audit-missing': ['Denetim bulunamadı veya silindi.', 'The audit is unavailable or has been deleted.'],
  unavailable: ['İşlem sonucu doğrulanamadı. Tekrar göndermeden güncel kaydı yükleyin; taslağınız korunuyor.', 'The outcome could not be confirmed. Reload before retrying; your draft is retained.'],
  limit: ['Kayıt sınırına ulaşıldı. Eksik veriyle işlem yapılamaz.', 'The record limit was reached. Incomplete data cannot be used.'],
};
const actions: Record<string, [string, string]> = { create: ['Taslak eklendi', 'Draft added'], edit: ['Güncellendi', 'Updated'], start: ['Başlatıldı', 'Started'], activate: ['Ek talep etkinleştirildi', 'Additional request activated'], submit: ['Sunuldu', 'Submitted'], return: ['Düzeltme istendi', 'Returned'], accept: ['Kabul edildi', 'Accepted'], cancel: ['İptal edildi', 'Cancelled'] };
const dateAfter = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export function AuditRequestPanel({ auditId, lang, focusId = '', readOnly = false }: { auditId: string; lang: string; focusId?: string; readOnly?: boolean }) {
  const en = lang === 'en', t = (tr: string, eng: string) => en ? eng : tr;
  const [data, setData] = useState<Data | null>(null), [loading, setLoading] = useState(true), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(focusId), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string; revision: string } | null>(null), [draft, setDraft] = useState<AuditRequestFields>({ ...emptyAuditRequest });
  const [draftAdjustment, setDraftAdjustment] = useState<ProposedDates>(null), [returnAdjustment, setReturnAdjustment] = useState<ProposedDates>(null);
  const [activationReason, setActivationReason] = useState('');
  const [launch, setLaunch] = useState(false), [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), [versions, setVersions] = useState<string[]>([]), [note, setNote] = useState('');
  const [returnDue, setReturnDue] = useState<string | null>(null), [returnReviewDue, setReturnReviewDue] = useState<string | null>(null), generation = useRef(0), live = useRef(true);
  const [page, setPage] = useState(0);
  const [previewVersion, setPreviewVersion] = useState('');
  const load = useCallback(async () => {
    const sequence = ++generation.current; setLoading(true); setReady(false);
    try {
      const response = await fetch(withBasePath(`/api/audits/requests?auditId=${encodeURIComponent(auditId)}`), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'unavailable');
      if (!body.workflow || !Array.isArray(body.requests) || !Array.isArray(body.people) || !Array.isArray(body.evidenceChoices) || !Array.isArray(body.events)) throw new Error('unavailable');
      if (live.current && sequence === generation.current) { setData(body); setReady(true); }
      return true;
    } catch (err) { if (live.current && sequence === generation.current) setError(err instanceof Error ? err.message : 'unavailable'); return false; }
    finally { if (live.current && sequence === generation.current) setLoading(false); }
  }, [auditId]);
  useEffect(() => { live.current = true; const timer = window.setTimeout(() => void load(), 0); return () => { live.current = false; window.clearTimeout(timer); }; }, [load]);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  const progress = data ? auditRequestProgress(data.requests, data.workflow, data.complete && ready, clock) : null;
  const row = data?.requests.find(item => item.id === selected);
  const reviewEvidence = row?.evidence.find(version => version.id === previewVersion) || row?.evidence[0];
  const canOperate = !readOnly && !!data?.canManage && ready && !!data?.complete && data?.workflow.state !== 'closed';
  const editable = canOperate && !busy && !loading;
  const requestZone = data?.workflow.timeZone || 'UTC';
  const returnDates = {dueDate: returnDue ?? row?.dueDate ?? '', reviewDueDate: returnReviewDue ?? row?.reviewDueDate ?? '', timeZone: requestZone};
  const choose = (item: AuditRequest) => { setSelected(item.id); setVersions(item.evidence.map(v => v.id)); setNote(''); setReturnDue(item.dueDate); setReturnReviewDue(item.reviewDueDate); setReturnAdjustment(null); setDraftAdjustment(null); setEditing(null); setError(''); };
  const beginEdit = (item?: AuditRequest) => {
    setEditing({ id: item?.id || `ARQ-${crypto.randomUUID()}`, revision: item?.revision || '' });
    setDraft(item ? { ...item } : { ...emptyAuditRequest, owner: data?.actorEmail || '', periodStart: data?.periodStart || '', periodEnd: data?.periodEnd || '', dueDate: dateAfter(7), reviewDueDate: dateAfter(10) });
    setDraftAdjustment(null); setReturnAdjustment(null); setError(''); setLaunch(false); setActivationReason('');
  };
  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    if (busyRef.current || !ready || !data?.complete) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(withBasePath('/api/audits/requests'), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ auditId, action, requestId: row?.id, expectedRevision: row?.revision || '', ...extra }) });
      const body = await response.json(); if (!response.ok) { if ((response.status === 409 && !['calendar-changed', 'deadline-calendar-conflict'].includes(body.error)) || response.status >= 500) setReady(false); throw new Error(body.error || 'unavailable'); }
      if (!live.current) return;
      setEditing(null); setLaunch(false); setNote(''); setDraftAdjustment(null); setReturnAdjustment(null); setReturnDue(null); setReturnReviewDue(null);
      if (extra.requestId) setSelected(String(extra.requestId));
      setNotice(body.remindersPending ? 'pending' : 'saved'); await load();
    } catch (err) { if (live.current) { setError(err instanceof Error ? err.message : 'unavailable'); if (!(err instanceof Error) || !messages[err.message]) setReady(false); } }
    finally { busyRef.current = false; if (live.current) setBusy(false); }
  }
  async function refreshDeadlineCalendar() {
    if (busyRef.current || !data || !ready) return;
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      const response = await fetch(withBasePath(`/api/audits/requests?auditId=${encodeURIComponent(auditId)}`), {cache: 'no-store', signal: AbortSignal.timeout(20000)});
      const body: Data = await response.json(); if (!response.ok || !body.workflow || !body.reminderProfile || !Array.isArray(body.requests)) throw new Error('unavailable');
      if (!live.current) return;
      // Refresh only the calendar. Never silently adopt a newer record/workflow revision over a draft.
      const expected = editing || row;
      if (body.workflow.revision !== data.workflow.revision || body.workflow.timeZone !== data.workflow.timeZone || body.workflow.state !== data.workflow.state ||
          (expected && (body.requests.find(r => r.id === expected.id)?.revision || '') !== expected.revision)) { setReady(false); throw new Error('conflict'); }
      setData(previous => previous ? {...previous, reminderProfile: body.reminderProfile, canManage: body.canManage, evidenceAccess: body.evidenceAccess} : previous);
      setError(''); setNotice('calendar');
    } catch (err) { if (live.current) setError(err instanceof Error ? err.message : 'unavailable'); }
    finally { busyRef.current = false; if (live.current) setBusy(false); }
  }
  const visible = (data?.requests || []).filter(item => (filter === 'all' || (filter === 'pending' ? progress?.pendingIds.includes(item.id) : filter === 'overdue' ? progress?.overdueIds.includes(item.id) : item.status === filter)) && `${item.title} ${item.owner} ${item.reviewer} ${item.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const drafts = data?.requests.filter(item => item.status === 'draft') || [];
  const evidenceOptions = [...(data?.evidenceChoices || []), ...(row?.evidence || []).filter(v => !data?.evidenceChoices.some(e => e.id === v.id))];
  const errorMessage = error ? (messages[error] || messages.unavailable)[en ? 1 : 0] : '';
  return <section className="audit-request-panel" aria-label={t('Denetim talepleri ve inceleme', 'Audit requests and review')} aria-busy={busy || loading}>
    <header><div><h3>{t('Talepler ve inceleme', 'Requests and review')}</h3><p>{t('İstenen kanıtı, sorumluyu, teslimi ve kabul kararını birlikte takip edin.', 'Track requested evidence, ownership, delivery and acceptance together.')}</p></div><button type="button" disabled={busy || loading} onClick={() => { if ((editing || returnAdjustment || note || (returnDue !== null && returnDue !== row?.dueDate) || (returnReviewDue !== null && returnReviewDue !== row?.reviewDueDate)) && !window.confirm(t('Taslağı bırakıp güncel kayıtlar yüklensin mi?', 'Discard the draft and reload?'))) return; setEditing(null); setLaunch(false); setDraftAdjustment(null); setReturnAdjustment(null); setReturnDue(null); setReturnReviewDue(null); setNote(''); setError(''); void load(); }}>{t('Yeniden yükle', 'Reload')}</button></header>
    {errorMessage && <p className="ar-alert" role="alert">{errorMessage}</p>}
    {error === 'deadline-calendar-conflict' && <button type="button" disabled={busy || !ready} onClick={() => void refreshDeadlineCalendar()}>{t('Takvimi yenile (taslağı koru)', 'Refresh calendar (keep draft)')}</button>}
    {notice && <p role="status">{notice === 'calendar' ? t('Takvim yenilendi. Taslağınız korundu; öneriyi geri alıp yeniden önizleyin.', 'Calendar refreshed. Your draft was retained; undo the proposal and preview again.') : notice === 'pending' ? t('Kayıt kaydedildi. Hatırlatma kuyruğu henüz güncellenemedi; zamanlayıcı yeniden deneyecek.', 'Saved. Reminder reconciliation is pending; the scheduler will retry.') : t('Kaydedildi.', 'Saved.')}</p>}
    {loading && <p role="status">{t('Yükleniyor…', 'Loading…')}</p>}
    {data && <>
      {!data.complete && <p role="alert">{t('Liste eksik. Güvenli işlem için kayıt sınırı çözülmeli.', 'The list is incomplete. Resolve the record limit before making changes.')}</p>}
      {progress && <div className="ar-progress" aria-label={t('Talep tamamlanma özeti', 'Request completion summary')}>
        <h4>{progress.state === 'closed' ? t('İş planı kapalı', 'Work plan closed') : progress.state === 'resolved' ? t('Bekleyen talep kalmadı', 'No outstanding requests') : progress.state === 'incomplete' ? t('Tamamlanma doğrulanamadı', 'Completion not confirmed') : progress.state === 'empty' ? t('Henüz talep yok', 'No requests yet') : progress.state === 'draft' ? t('İş planı henüz başlamadı', 'Work plan has not started') : t('Tamamlanmayı bekleyen talepler', 'Outstanding requests')}</h4>
        <p>{t('Bu özet yalnızca kanıt taleplerini kapsar. Denetim kapanışı, bulgu çözümü veya olumlu denetim görüşü anlamına gelmez. İptal edilen talepler kabul edilmiş sayılmaz.', 'This summary covers evidence requests. It does not close the audit, resolve findings or imply a positive audit opinion. Cancelled requests do not count as accepted.')}</p>
        <div className="ar-summary">{([
          ['draft', t('Taslak', 'Draft'), progress.counts.draft],
          ['assigned', t('Teslim bekleyen', 'Awaiting delivery'), progress.counts.assigned],
          ['changes_requested', t('Düzeltme bekleyen', 'Changes requested'), progress.counts.changes_requested],
          ['submitted', t('İnceleme bekleyen', 'Awaiting review'), progress.counts.submitted],
          ['accepted', t('Kabul edilen', 'Accepted'), progress.counts.accepted],
          ['cancelled', t('İptal edilen', 'Cancelled'), progress.counts.cancelled],
          ['overdue', t('Geciken', 'Overdue'), progress.overdueIds.length],
        ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} disabled={loading || (value === 'overdue' && !progress.clockComplete)} onClick={() => { setFilter(value); setQuery(''); setPage(0); }}>{label}: <b>{value === 'overdue' && !progress.clockComplete ? '—' : count}</b></button>)}</div>
        <button type="button" disabled={loading} onClick={() => { setFilter('pending'); setQuery(''); setPage(0); }}>{t('Bekleyenleri göster', 'Show outstanding requests')} ({progress.pendingIds.length})</button>
        {!progress.clockComplete && <p role="status">{t('Saat dilimi veya son tarihler doğrulanamadı; gecikme sayısı gösterilemiyor.', 'The time zone or deadlines could not be verified; the overdue count is unavailable.')}</p>}
      </div>}

      <AuditWorkplanPanel key={auditId} auditId={auditId} lang={lang} workflow={data.workflow} canManage={!readOnly && data.canManage && ready && data.complete} evidenceAccess={data.evidenceAccess} disabled={busy || loading || !!editing} onBusy={value => { busyRef.current = value; setBusy(value); }} onChanged={load}/>
      {data.workflow.state === 'closed' ? <p>{t('İş planı kapalı; önceki talepler ve kararlar okunabilir.', 'The work plan is closed; previous requests and decisions remain readable.')}</p> : data.workflow.state === 'draft' ? <p>{t('Taslak talepler bildirim üretmez. Başlatmadan önce sorumluları, tarihleri ve kayıtlı denetim planını kontrol edin.', 'Draft requests do not generate notifications. Review owners, dates and the saved audit plan before starting.')}</p> : <p>{t('Hatırlatma saat dilimi', 'Reminder time zone')}: <b>{data.workflow.timeZone}</b> · {t('Teslim ve inceleme tarihleri ayrıdır.', 'Delivery and review have separate dates.')}</p>}
      {data.reminderProfile && <AuditReminderPanel key={`${auditId}:${data.reminderProfile.revision}`} saved={data.reminderProfile} lang={lang} disabled={!editable || !!editing || launch} canManage={canOperate} people={data.people} due={row ? requestNextDue(row) : data.requests[0] ? requestNextDue(data.requests[0]) : ''} timeZone={data.workflow.timeZone} onSave={profile => void mutate('reminder-profile', { profile, expectedRevision: data.reminderProfile.revision, expectedWorkflowRevision: data.workflow.revision })}/>}
      {!readOnly && data.canManage && data.workflow.state !== 'closed' && <div className="ar-actions"><button type="button" disabled={!editable || !!editing} onClick={() => beginEdit()}>{t('+ Talep ekle', '+ Add request')}</button><button type="button" disabled={!editable || !!editing || !drafts.length} onClick={() => setLaunch(!launch)}>{data.workflow.state === 'draft' ? t('Başlangıç özetini gör', 'Preview launch') : t('Ek talepleri gözden geçir', 'Review additions')}</button></div>}
      {launch && <div className="ar-launch"><h4>{data.workflow.state === 'draft' ? t('İş planını başlat', 'Start the work plan') : t('Ek talepleri etkinleştir', 'Activate additional requests')}</h4>
        <p>{drafts.length} {t('talep etkinleşecek.', 'requests will become active.')} {new Set(drafts.map(r => r.owner)).size} {t('sorumlu için atama bildirimi hazırlanacak. İnceleyenlere kanıt sunulduğunda iş açılır.', 'owners will receive assignment notifications. Reviewer work opens when evidence is submitted.')}</p>
        <ul className="ar-preview-list">{drafts.map(item => <li key={item.id}><b>{item.title}</b><span>{t('Sorumlu', 'Owner')}: {item.owner} · {t('İnceleyen', 'Reviewer')}: {item.reviewer}</span><span>{t('Teslim / inceleme', 'Delivery / review')}: {item.dueDate} / {item.reviewDueDate}</span><span>{t('Kanıt dönemi', 'Evidence period')}: {item.periodStart ? `${item.periodStart} – ${item.periodEnd}` : t('Belirtilmedi', 'Not specified')}</span><details><summary>{t('Kabul ölçütü', 'Acceptance criteria')}</summary><p className="ar-prewrap">{item.instructions}</p></details></li>)}</ul>
        {data.workflow.state === 'draft' ? <label>{t('Saat dilimi (IANA)', 'Time zone (IANA)')}<input value={zone} onChange={e => setZone(e.target.value)} disabled={busy} placeholder="Europe/Istanbul" /></label> : <><p>{t('Mevcut taleplerin durumları ve kabul kararları korunur. Yeni taslaklar etkinleşene kadar İşlerim ve hatırlatmalara eklenmez.', 'Existing requests and acceptance decisions are preserved. New drafts stay out of My Work and reminders until activated.')}</p><label className="ar-reason">{t('Ek talep gerekçesi', 'Reason for additional requests')}<textarea aria-label={t('Ek talep gerekçesi', 'Reason for additional requests')} required minLength={5} maxLength={2000} rows={3} value={activationReason} disabled={busy} onChange={e => setActivationReason(e.target.value)} /></label></>}
        <p>{t('E-posta gönderimi etkin taşıma ve zamanlayıcıya bağlıdır. Taleplerin kabulü denetim sonucunu otomatik değiştirmez.', 'Email depends on enabled transport and scheduling. Request acceptance does not automatically change the audit conclusion.')}</p>
        <button type="button" disabled={!editable || (data.workflow.state === 'active' && activationReason.trim().length < 5)} onClick={() => void mutate(data.workflow.state === 'draft' ? 'start' : 'activate', { expectedRevision: data.workflow.revision, expectedPlanRevision: data.planRevision, expectedDrafts: requestDraftPreview(data.requests), timeZone: zone, note: activationReason })}>{data.workflow.state === 'draft' ? t('İş planını başlat', 'Start work plan') : t('Ek talepleri etkinleştir', 'Activate additional requests')}</button>
      </div>}
      {editing && <form className="ar-editor" onSubmit={event => { event.preventDefault(); try { validateAuditRequestFields(draft); } catch (err) { setError(err instanceof Error ? err.message : 'fields'); return; } void mutate(editing.revision ? 'edit' : 'create', { requestId: editing.id, expectedRevision: editing.revision, expectedWorkflowRevision: data.workflow.revision, fields: draft, ...(draftAdjustment && sameDeadlineDates({...draft, timeZone: requestZone}, draftAdjustment.after) ? {deadlineAdjustment: draftAdjustment.input} : {}) }); }}>
        <h4>{editing.revision ? t('Talebi düzenle', 'Edit request') : t('Yeni kanıt talebi', 'New evidence request')}</h4>
        {!editing.revision && data.workflow.state === 'active' && <p>{t('Talep taslak olarak kaydedilecek. Gerekçeyi ve ek talepler özetini onayladığınızda sorumluya atanır.', 'This request will be saved as a draft. It is assigned after you confirm the reason and additions preview.')}</p>}
        {editing.revision && row?.status === 'submitted' && <p>{t('Bu değişiklik incelemeyi durdurur; sorumlu kanıtı yeniden sunmalıdır.', 'This change stops the review; the owner must resubmit evidence.')}</p>}
        <fieldset disabled={busy}><label className="ar-wide">{t('Başlık', 'Title')}<input required maxLength={180} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label className="ar-wide">{t('İstenen içerik ve kabul ölçütü', 'Requested content and acceptance criteria')}<textarea required rows={3} maxLength={4000} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} /></label>
          {(['owner', 'reviewer'] as const).map(key => <label key={key}>{key === 'owner' ? t('Sorumlu', 'Owner') : t('İnceleyen', 'Reviewer')}<select aria-label={key === 'owner' ? t('Sorumlu', 'Owner') : t('İnceleyen', 'Reviewer')} required value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}><option value="">{t('Seçin', 'Select')}</option>{draft[key] && !data.people.some(p => p.email === draft[key]) && <option value={draft[key]}>{draft[key]} — {t('hesabı doğrulayın', 'verify account')}</option>}{data.people.map(p => <option key={p.email} value={p.email}>{p.name} · {p.email}</option>)}</select></label>)}
          {(['dueDate', 'reviewDueDate', 'periodStart', 'periodEnd'] as const).map((key, index) => <label key={key}>{[t('Teslim tarihi', 'Delivery due'), t('İnceleme son tarihi', 'Review due'), t('Kanıt dönemi başlangıcı', 'Evidence period start'), t('Kanıt dönemi sonu', 'Evidence period end')][index]}<input type="date" required={index < 2} value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); if (index < 2) setDraftAdjustment(null); }} /></label>)}
        </fieldset><p>{t('İş planı saat dilimi', 'Work plan time zone')}: {requestZone}{data.workflow.state === 'draft' ? ` · ${t('İş planı başlatılırken seçilir; bu öneri yalnız tarihleri değiştirir.', 'Selected at launch; this proposal changes only the calendar dates.')}` : ''}</p>
        <RequestDeadlinePlanner tr={!en} saved={data.reminderProfile} dates={{dueDate: draft.dueDate, reviewDueDate: draft.reviewDueDate, timeZone: requestZone}} disabled={!editable} proposal={draftAdjustment} onChange={(dates, proposal) => {setDraft(d => ({...d, dueDate: dates.dueDate, reviewDueDate: dates.reviewDueDate})); setDraftAdjustment(proposal);}}/>
        {!data.peopleComplete && <p role="alert">{t('Kullanıcı listesi sınırlı; aradığınız kişi görünmüyorsa yöneticinize başvurun.', 'The people list is limited; contact your administrator if an assignee is missing.')}</p>}<div className="ar-actions"><button type="submit" disabled={!editable}>{busy ? t('Kaydediliyor…', 'Saving…') : t('Talebi kaydet', 'Save request')}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>{t('Vazgeç', 'Cancel')}</button></div>
      </form>}
      <div className="ar-filters"><label>{t('Ara', 'Search')}<input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder={t('Başlık, kişi veya referans', 'Title, person or reference')} /></label><label>{t('Durum', 'Status')}<select aria-label={t('Durum', 'Status')} value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">{t('Tümü', 'All')}</option><option value="pending">{t('Bekleyenler', 'Outstanding')}</option><option value="overdue">{t('Gecikenler', 'Overdue')}</option>{Object.entries(requestStatusLabels).map(([key, labels]) => <option value={key} key={key}>{labels[en ? 1 : 0]}</option>)}</select></label></div>
      <div className="ar-table"><table><thead><tr>{[t('Talep', 'Request'), t('Sıradaki kişi', 'Next owner'), t('Son tarih', 'Due date'), t('Durum', 'Status')].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.slice(page * 10, page * 10 + 10).map(item => <tr key={item.id} className={item.id === selected ? 'selected' : ''}><td><button type="button" disabled={busy || !!editing} onClick={() => choose(item)}>{item.title}</button></td><td>{requestNextActor(item) || '—'}</td><td>{requestNextActor(item) ? requestNextDue(item) : '—'}</td><td><span className={`ar-state ${item.status}`}>{requestStatusLabels[item.status]?.[en ? 1 : 0] || item.status}</span></td></tr>)}</tbody></table></div>
      {!visible.length && <p>{t('Bu görünümde talep yok.', 'No requests in this view.')}</p>}
      {visible.length > 10 && <div className="ar-actions"><button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('Önceki', 'Previous')}</button><span>{page + 1} / {Math.ceil(visible.length / 10)}</span><button type="button" disabled={(page + 1) * 10 >= visible.length} onClick={() => setPage(p => p + 1)}>{t('Sonraki', 'Next')}</button></div>}
      {selected && !row && ready && <p role="alert">{t('İstenen talep bulunamadı veya erişilemiyor.', 'The requested item is unavailable or inaccessible.')}</p>}
      {row && !editing && <article className="ar-detail"><CopyRecordLink key={row.id} lang={lang} target={{module:"Denetim Yönetimi",kind:"audit-request",ref:row.id,auditId}} /><header><div><small>{row.id}</small><h4>{row.title}</h4></div>{editable && ['draft', 'assigned', 'submitted', 'changes_requested'].includes(row.status) && <button type="button" onClick={() => beginEdit(row)}>{t('Düzenle', 'Edit')}</button>}</header><div className={data.evidenceAccess && reviewEvidence ? "ar-review-grid" : ""}>
        {data.evidenceAccess && reviewEvidence && <div className="ar-review-files"><label>{t('İncelenen sabit sürüm', 'Pinned version under review')}<select value={reviewEvidence.id} onChange={event => setPreviewVersion(event.target.value)}>{row.evidence.map(version => <option key={version.id} value={version.id}>{version.title} · v{version.versionNo} · {version.fileName}</option>)}</select></label><EvidenceDocumentPreview fileKey={reviewEvidence.fileKey} fileName={reviewEvidence.fileName} title={reviewEvidence.title} lang={lang}/><p>{t('Önizleme talebe sunulan sürüme aittir; kütüphanedeki yeni dosya bu sürümü değiştirmez.', 'The preview shows the submitted version; a newer library file does not replace it.')}</p></div>}
        <div className="ar-review-context"><p className="ar-prewrap">{row.instructions}</p><dl><div><dt>{t('Sorumlu', 'Owner')}</dt><dd>{row.owner}</dd></div><div><dt>{t('İnceleyen', 'Reviewer')}</dt><dd>{row.reviewer}</dd></div><div><dt>{t('Teslim / inceleme', 'Delivery / review')}</dt><dd>{row.dueDate} / {row.reviewDueDate}</dd></div><div><dt>{t('Kanıt dönemi', 'Evidence period')}</dt><dd>{row.periodStart ? `${row.periodStart} – ${row.periodEnd}` : t('Belirtilmedi', 'Not specified')}</dd></div></dl>
        {row.note && <p className="ar-launch">{row.note}</p>}
        {!data.evidenceAccess && <p>{t('Kanıt ayrıntıları için kanıt okuma yetkisi gerekir.', 'Evidence read access is required for evidence details.')}</p>}
        {row.evidence.length > 0 && <><h4>{t('Sunulan sabit sürümler', 'Submitted versions')}</h4><ul>{row.evidence.map(v => <li key={v.id}><a href={withBasePath(`/api/evidence?key=${encodeURIComponent(v.fileKey)}`)} target="_blank" rel="noopener noreferrer">{v.title} · v{v.versionNo} · {v.fileName}</a><small>{t('Kayıtlı dönem', 'Recorded period')}: {v.period || '—'}</small></li>)}</ul><p>{t('Karar bu sürümlere aittir. Dönem ve içerik uygunluğunu inceleyen değerlendirir.', 'The decision applies to these versions. The reviewer evaluates period and content suitability.')}</p></>}
        {canOperate && data.evidenceAccess && row.owner === data.actorEmail && ['assigned', 'changes_requested'].includes(row.status) && <div className="ar-submit"><h4>{t('Kanıtı sun', 'Submit evidence')}</h4><p>{t('Kanıt Kütüphanesi’ne yüklenmiş 1–10 sürümü seçin.', 'Select 1–10 versions uploaded to the Evidence Library.')}</p><div className="ar-evidence-choices">{evidenceOptions.map(v => <label key={v.id}><input type="checkbox" checked={versions.includes(v.id)} disabled={busy || (!versions.includes(v.id) && versions.length >= 10)} onChange={e => setVersions(e.target.checked ? [...versions, v.id] : versions.filter(id => id !== v.id))} /><span>{v.title} · v{v.versionNo}<small>{v.fileName} · {v.period || '—'}</small></span></label>)}</div>{!data.evidenceChoicesComplete && <p role="alert">{t('İlk 500 kanıt gösteriliyor.', 'The first 500 evidence items are shown.')}</p>}<div className="ar-actions"><button type="button" disabled={busy} onClick={() => navigateToFornost({ module: 'Kanıtlar' })}>{t('Kanıt Kütüphanesi', 'Evidence Library')}</button><button type="button" disabled={!versions.length || !editable} onClick={() => void mutate('submit', { versionIds: versions })}>{t('İncelemeye sun', 'Submit for review')}</button></div></div>}
        {canOperate && !['accepted', 'cancelled'].includes(row.status) && <><label>{t('Karar / iptal gerekçesi', 'Decision / cancellation reason')}<textarea aria-label={t('Karar / iptal gerekçesi', 'Decision / cancellation reason')} value={note} maxLength={2000} rows={2} onChange={e => setNote(e.target.value)} disabled={busy} /></label><div className="ar-actions">{data.evidenceAccess && row.status === 'submitted' && row.reviewer === data.actorEmail && row.submittedBy !== data.actorEmail && <><button type="button" disabled={busy || note.trim().length < 5} onClick={() => void mutate('accept', { note })}>{t('Kabul et', 'Accept')}</button><label>{t('Yeni teslim', 'New delivery due')}<input type="date" disabled={busy} value={returnDates.dueDate} onChange={e => {setReturnDue(e.target.value); setReturnAdjustment(null);}} /></label><label>{t('Yeni inceleme sonu', 'New review due')}<input type="date" disabled={busy} value={returnDates.reviewDueDate} onChange={e => {setReturnReviewDue(e.target.value); setReturnAdjustment(null);}} /></label><button type="button" disabled={busy || note.trim().length < 5} onClick={() => void mutate('return', { note, expectedWorkflowRevision: data.workflow.revision, fields: { dueDate: returnDates.dueDate, reviewDueDate: returnDates.reviewDueDate }, ...(returnAdjustment && sameDeadlineDates(returnDates, returnAdjustment.after) ? {deadlineAdjustment: returnAdjustment.input} : {}) })}>{t('Düzeltme iste', 'Request changes')}</button><div className="ar-return-deadlines"><RequestDeadlinePlanner tr={!en} saved={data.reminderProfile} dates={returnDates} disabled={!editable} proposal={returnAdjustment} onChange={(dates, proposal) => {setReturnDue(dates.dueDate); setReturnReviewDue(dates.reviewDueDate); setReturnAdjustment(proposal);}}/></div></>}{!['accepted', 'cancelled'].includes(row.status) && <button type="button" disabled={busy || note.trim().length < 5} onClick={() => void mutate('cancel', { note })}>{t('Talebi iptal et', 'Cancel request')}</button>}</div></>}
        <details><summary>{t('İşlem geçmişi', 'Activity history')}</summary>{!data.eventsComplete && <p>{t('Denetimin son 200 olayı gösteriliyor.', 'Showing the audit’s latest 200 events.')}</p>}<ol>{data.events.filter(e => e.request_id === row.id).map(e => <li key={e.id}><b>{actions[e.action]?.[en ? 1 : 0] || e.action}</b> · {e.actor} · {new Date(e.created_at).toLocaleString(en ? 'en-GB' : 'tr-TR')}{e.note && <p>{e.note}</p>}<DeadlineAdjustmentHistory value={e.deadlineAdjustment} tr={!en}/>{e.activationReason && <p>{t('Ek talep gerekçesi', 'Reason for additional requests')}: {e.activationReason}</p>}{e.planRevision && <small>{t('Denetim planı sürümü', 'Audit plan revision')}: {e.planRevision}</small>}{e.versionIds.length > 0 && <small>{t('Kanıt sürümleri', 'Evidence versions')}: {e.versionIds.join(', ')}</small>}</li>)}</ol></details>
        </div></div>
      </article>}
    </>}
  </section>;
}

function RequestDeadlinePlanner({tr, saved, dates, disabled, proposal, onChange}: {tr: boolean; saved: SavedAuditReminderProfile; dates: DeadlineDates; disabled: boolean; proposal: ProposedDates; onChange: (dates: DeadlineDates, proposal: ProposedDates) => void}) {
  return <>
    <AuditDeadlineAdjustmentPanel tr={tr} saved={saved} dates={dates} disabled={disabled} onApply={(after, input) => onChange(after, {after, input})}/>
    {proposal && sameDeadlineDates(dates, proposal.after) && <p>{tr ? 'İş günü tarihleri taslağa uygulandı. Talebi kaydedin veya düzeltme kararını gönderin; takvim yeniden doğrulanacak.' : 'Working-day dates applied to the draft. Save the request or send the return decision; the calendar will be rechecked.'} <button type="button" disabled={disabled} onClick={() => onChange(proposal.input, null)}>{tr ? 'Tarih önerisini geri al' : 'Undo proposed dates'}</button></p>}
  </>;
}
