'use client';
import { useState } from 'react';
import { planBatchDeadlineDates, type BatchDeadlineDate, type BatchDeadlineAdjustmentInput } from './audit-milestone-batch-deadlines';
import type { SavedAuditReminderProfile } from './audit-reminder-profile';
import './audit-deadline-adjustment.css';

type Props = { tr: boolean; saved?: SavedAuditReminderProfile; tasks: (BatchDeadlineDate & {title: string})[]; timeZone: string; disabled: boolean; onApply: (dates: BatchDeadlineDate[], input: BatchDeadlineAdjustmentInput) => void };
export function BatchDeadlinePlanner(props: Props) {
  return <Planner key={JSON.stringify([props.saved, props.tasks, props.timeZone, props.disabled])} {...props}/>;
}
function Planner({tr, saved, tasks, timeZone, disabled, onApply}: Props) {
  const t = (a: string, b: string) => tr ? a : b;
  const [preview, setPreview] = useState<BatchDeadlineDate[] | null>(null), [reason, setReason] = useState(''), [error, setError] = useState(false);
  const available = !!saved?.revision && saved.profile.mode === 'business';
  const changed = preview?.filter((row, i) => row.dueDate !== tasks[i].dueDate).length || 0;
  return <section className="audit-deadline-adjustment" aria-label={t('Paket iş günü planlayıcısı', 'Task pack working-day planner')}>
    <h5>{t('Paket tarihlerini iş gününe taşı', 'Move task pack dates to working days')}</h5>
    <p>{t('Seçili görevlerin her tarihi, kayıtlı takvimde aynı veya sonraki iş gününe taşınır. Tarihler aynı güne gelebilir; görev aralıkları hesaplanmaz. Sıra ve ön koşullar korunur.', 'Each selected deadline moves to the same or next working day in the saved calendar. Dates may converge; task durations are not calculated. Order and prerequisites are preserved.')}</p>
    {!available && <p>{t('Önce Talepler ve inceleme bölümünde iş günü takvimini kaydedin, ardından paket takvimini yenileyin.', 'First save a business-day calendar in Requests and review, then refresh the pack calendar.')}</p>}
    <button type="button" disabled={disabled || !available || !tasks.length} onClick={() => { try { setPreview(planBatchDeadlineDates(saved!, tasks.map(({id,dueDate}) => ({id,dueDate})), timeZone)); setError(false); } catch { setPreview(null); setError(true); } }}>{t('Paket iş günü tarihlerini önizle', 'Preview pack working-day dates')}</button>
    {error && <p role="alert">{t('Seçili her görev için geçerli tarih ve paket saat dilimi girin.', 'Enter a valid due date for every selected task and a valid pack time zone.')}</p>}
    {preview && <div role="region" aria-label={t('Paket tarih değişikliği önizlemesi', 'Task pack date adjustment preview')}>
      <p>{saved?.profile.calendarSource ? `${saved.profile.calendarSource.name} · v${saved.profile.calendarSource.version}` : t('Denetime özel takvim', 'Audit-specific calendar')} · {timeZone}</p>
      <dl>{preview.map((row,i) => <div key={row.id}><dt>{tasks[i].title || `${t('Görev','Task')} ${i+1}`}</dt><dd>{tasks[i].dueDate} → <strong>{row.dueDate}</strong>{tasks[i].dueDate === row.dueDate ? ` · ${t('Değişmiyor','Unchanged')}` : ''}</dd></div>)}</dl>
      <p>{changed ? `${changed}/${preview.length} ${t('görevin tarihi değişecek.', 'task dates will change.')}` : t('Seçili tarihler zaten iş günü.', 'Selected dates already fall on working days.')}</p>
      {!!changed && <><label>{t('Paket tarih değişikliği gerekçesi', 'Task pack date adjustment reason')}<textarea aria-label={t('Paket tarih değişikliği gerekçesi', 'Task pack date adjustment reason')} value={reason} maxLength={1000} disabled={disabled} onChange={e => setReason(e.target.value)}/></label>
        <button type="button" disabled={disabled || reason.trim().length < 3} onClick={() => onApply(preview, {profileRevision:saved!.revision,reason:reason.trim(),timeZone,dates:tasks.map(({id,dueDate})=>({id,dueDate}))})}>{t('Paket tarihlerini taslağa uygula', 'Apply pack dates to draft')}</button></>}
      <button type="button" disabled={disabled} onClick={() => setPreview(null)}>{t('Paket tarih önizlemesini kapat', 'Close pack date preview')}</button>
    </div>}
  </section>;
}
