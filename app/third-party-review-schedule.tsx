"use client";
import { useId } from 'react';
import { nextReviewMinimum, validNextReview, type ReviewSchedule, type ReviewScheduleRecord } from './third-party-risk/review-schedule';

export function ThirdPartyReviewSchedule({ value, tr, busy, change }: { value: ReviewSchedule; tr: boolean; busy: boolean; change: (nextDate: string) => void }) {
  const id = useId(), minimum = nextReviewMinimum(), contractExpired = value.contractEnd < minimum;
  return <fieldset className="workflow-evidence wide" disabled={busy}>
    <legend>{tr ? 'Sonraki tedarikçi incelemesi' : 'Next supplier review'}</legend>
    <p>{tr ? 'Mevcut inceleme' : 'Current review'}: {value.previousDate || '—'} · {tr ? 'Sözleşme bitişi' : 'Contract end'}: {value.contractEnd || '—'}</p>
    <label htmlFor={id}>{tr ? 'Sonraki inceleme tarihi' : 'Next review date'}</label>
    <input id={id} type="date" required min={minimum} max={value.contractEnd} value={value.nextDate} aria-describedby={`${id}-help`} onChange={event => change(event.target.value)} />
    <p id={`${id}-help`}>{tr ? 'Bugünden sonra, sözleşme bitişini geçmeyen bir tarih seçin. Gelecekteki mevcut tarihi koruyabilir veya daha erken bir inceleme planlayabilirsiniz.' : 'Choose a date after today and no later than contract end. You can retain a future date or bring the next review forward.'}</p>
    {contractExpired ? <p role="alert">{tr ? 'Sözleşme dönemi gelecekte bir inceleme planlamaya izin vermiyor; onay kaydedilemez.' : 'The contract term allows no future review; approval cannot be saved.'}</p> : value.nextDate && !validNextReview(value.nextDate, value.contractEnd) ? <p role="alert">{tr ? 'İnceleme tarihi izin verilen aralıkta değil.' : 'The review date is outside the permitted range.'}</p> : null}
    <p>{tr ? 'Kararla birlikte kaydedilecek' : 'Saved with this decision'}: <strong>{value.previousDate || '—'} → {value.nextDate || '—'}</strong></p>
  </fieldset>;
}

export function ThirdPartyReviewHistory({ value, tr }: { value: ReviewScheduleRecord | null | undefined; tr: boolean }) {
  if (!value) return null;
  return <details className="workflow-evidence-history tprm-review-history">
    <summary>{tr ? 'İnceleme planı' : 'Review schedule'} · #{value.cycleNumber}</summary>
    <div><strong>{value.previousDate} → {value.nextDate}</strong><span>{tr ? 'Karar anındaki sözleşme bitişi' : 'Contract end at decision'}: {value.contractEnd}</span><span>{value.actor}</span><time dateTime={value.createdAt}>{new Date(value.createdAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</time><span>{value.note}</span></div>
  </details>;
}
