'use client';
import { useState } from 'react';
import { planDeadlineAdjustment, sameDeadlineDates, type DeadlineDates, type DeadlineAdjustment, type DeadlineAdjustmentInput } from './audit-deadline-adjustment';
import type { SavedAuditReminderProfile } from './audit-reminder-profile';
import './audit-deadline-adjustment.css';

type Props = { tr: boolean; saved?: SavedAuditReminderProfile; dates: DeadlineDates; disabled: boolean; canChangeReview?: boolean; onApply: (dates: DeadlineDates, input: DeadlineAdjustmentInput) => void };
export function AuditDeadlineAdjustmentPanel(props: Props) {
  // Date, calendar or permission changes invalidate the preview before another apply can occur.
  return <Planner key={JSON.stringify([props.dates, props.saved, props.canChangeReview, props.disabled])} {...props}/>;
}
function Planner({ tr, saved, dates, disabled, canChangeReview = true, onApply }: Props) {
  const t = (a: string, b: string) => tr ? a : b;
  const [preview, setPreview] = useState<DeadlineDates | null>(null), [reason, setReason] = useState(''), [error, setError] = useState(false);
  const available = !!saved?.revision && saved.profile.mode === 'business';
  const changed = preview && !sameDeadlineDates(dates, preview);
  const reviewLocked = preview && !canChangeReview && preview.reviewDueDate !== dates.reviewDueDate;
  return <section className="audit-deadline-adjustment" aria-label={t('İş günü tarih planlayıcısı', 'Working-day deadline planner')}>
    <h5>{t('Terminleri iş gününe taşı', 'Move deadlines to working days')}</h5>
    <p>{t('Her tarih, denetimde kayıtlı takvime göre aynı veya sonraki çalışma gününe taşınır. İki tarih aynı güne gelebilir; aralarındaki gün farkı korunmaz. Önce öneriyi inceleyin, sonra taslağa uygulayıp kaydedin.', 'Each date moves to the same or next working day in the saved audit calendar. Dates may converge; their original gap is not preserved. Review the proposal, apply it to the draft, then save.')}</p>
    {!available && <p>{t('Önce Talepler ve inceleme bölümünde iş günü takvimini kaydedin ve bu ekranı yeniden yükleyin.', 'First save a business-day calendar in Requests and review, then reload this screen.')}</p>}
    <button type="button" disabled={disabled || !available} onClick={() => { try { setPreview(planDeadlineAdjustment(saved!, dates)); setError(false); } catch { setPreview(null); setError(true); } }}>{t('İş günü tarihlerini önizle', 'Preview working-day dates')}</button>
    {error && <p role="alert">{t('Geçerli hedef tarih ve saat dilimi girin. İnceleme tarihi hedef tarihten önce olamaz.', 'Enter a valid due date and time zone. Review cannot be due before preparation.')}</p>}
    {preview && <div role="region" aria-label={t('Tarih değişikliği önizlemesi', 'Deadline adjustment preview')}>
      <p>{saved?.profile.calendarSource ? `${saved.profile.calendarSource.name} · v${saved.profile.calendarSource.version}` : t('Denetime özel takvim', 'Audit-specific calendar')} · {dates.timeZone}</p>
      <dl>{([['dueDate', t('Hazırlama / hedef tarih', 'Preparation / due date')], ['reviewDueDate', t('İnceleme tarihi', 'Review date')]] as const).filter(([key]) => dates[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{dates[key]} → <strong>{preview[key]}</strong>{dates[key] === preview[key] ? ` · ${t('Değişmiyor', 'Unchanged')}` : ''}</dd></div>)}</dl>
      {!changed && <p>{t('Tarihler zaten çalışma gününe denk geliyor.', 'The dates already fall on working days.')}</p>}
      {reviewLocked && <p role="alert">{t('Öneri inceleme tarihini değiştiriyor; bu görev için yönetici uygulamalı.', 'This proposal changes the review date; an administrator must apply it for this milestone.')}</p>}
      {changed && !reviewLocked && <><label>{t('Tarih değişikliği gerekçesi', 'Deadline adjustment reason')}<textarea aria-label={t('Tarih değişikliği gerekçesi', 'Deadline adjustment reason')} value={reason} maxLength={1000} disabled={disabled} onChange={e => setReason(e.target.value)}/></label>
        <button type="button" disabled={disabled || reason.trim().length < 3} onClick={() => onApply(preview, { ...dates, profileRevision: saved!.revision, reason: reason.trim() })}>{t('Tarihleri taslağa uygula', 'Apply dates to draft')}</button></>}
      <button type="button" disabled={disabled} onClick={() => setPreview(null)}>{t('Tarih önizlemesini kapat', 'Close date preview')}</button>
    </div>}
  </section>;
}

export function DeadlineAdjustmentHistory({ value, tr }: { value?: DeadlineAdjustment; tr: boolean }) {
  if (!value) return null;
  return <div className="audit-deadline-adjustment"><b>{tr ? 'İş günü tarih değişikliği' : 'Working-day deadline adjustment'}</b>
    <p>{value.before.dueDate} → {value.after.dueDate}{value.before.reviewDueDate ? ` · ${value.before.reviewDueDate} → ${value.after.reviewDueDate}` : ''} · {value.after.timeZone}</p>
    <p>{value.reason}</p><p>{tr ? 'Takvim sürümü' : 'Calendar revision'}: {value.profileRevision}{value.calendar.calendarSource ? ` · ${value.calendar.calendarSource.name} v${value.calendar.calendarSource.version}` : ''}</p>
  </div>;
}
