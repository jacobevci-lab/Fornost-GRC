"use client";
import { useEffect, useRef, useState } from 'react';
import { CALENDAR_TEMPLATE_BYTES, exportAuditCalendar, importAuditCalendar, type AuditCalendar } from './audit-calendar-template';
export function AuditCalendarTemplatePanel({ calendar, lang, onApply }: { calendar: AuditCalendar; lang: string; onApply: (calendar: AuditCalendar) => void }) {
  const t = (tr: string, en: string) => lang === 'en' ? en : tr;
  const [source, setSource] = useState(''), [preview, setPreview] = useState<AuditCalendar | null>(null), [error, setError] = useState(false), [reading, setReading] = useState(false), [applied, setApplied] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const days = lang === 'en' ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] : ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  function change(text: string) { generation.current++; setSource(text); setPreview(null); setError(false); setReading(false); setApplied(false); }
  async function read(file?: File) {
    if (!file) return;
    change(''); const ticket = generation.current;
    if (file.size > CALENDAR_TEMPLATE_BYTES) { setError(true); return; }
    setReading(true);
    try { const text = await file.text(); if (ticket === generation.current) { setSource(text); setPreview(importAuditCalendar(text)); } }
    catch { if (ticket === generation.current) setError(true); }
    finally { if (ticket === generation.current) setReading(false); }
  }
  function download() {
    try {
      const text = exportAuditCalendar(calendar), url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'fornost-audit-calendar.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError(false);
    } catch { setError(true); }
  }
  return <details className="ar-calendar-template" style={{gridColumn:'1 / -1'}}><summary>{t('Takvimi başka denetimde kullan', 'Reuse calendar in another audit')}</summary>
    <p>{t('Gün hesabı, çalışma günleri ve tatilleri JSON olarak taşıyın. İçe aktarma bu üç alanı değiştirir; hatırlatma eşikleri, eskalasyon sorumlusu ve terminler korunur. Önizlemeyi uyguladıktan sonra profili ayrıca kaydedin.', 'Transfer day counting, working days and holidays as JSON. Import replaces these three fields; reminder thresholds, escalation recipient and deadlines are preserved. Apply the preview, then save the profile separately.')}</p>
    <button type="button" onClick={download}>{t('Taslak takvimi indir', 'Download draft calendar')}</button>
    <label>{t('Takvim JSON dosyası', 'Calendar JSON file')}<input aria-label={t('Takvim JSON dosyası', 'Calendar JSON file')} type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file); }}/></label>
    <label>{t('Takvim JSON içeriği', 'Calendar JSON content')}<textarea aria-label={t('Takvim JSON içeriği', 'Calendar JSON content')} rows={5} maxLength={CALENDAR_TEMPLATE_BYTES} spellCheck={false} value={source} onChange={e => change(e.target.value)}/></label>
    <button type="button" disabled={reading} onClick={() => { setApplied(false); try { setPreview(importAuditCalendar(source)); setError(false); } catch { setPreview(null); setError(true); } }}>{t('Takvimi önizle', 'Preview calendar')}</button>{' '}
    <button type="button" onClick={() => change('')}>{t('Takvim aktarımını temizle', 'Clear calendar import')}</button>
    {reading && <p role="status">{t('Dosya okunuyor…', 'Reading file…')}</p>}
    {error && <p role="alert">{t('Geçerli Fornost takvim JSON dosyası kullanın (en fazla 16 KB). En az bir benzersiz çalışma günü ve en fazla 366 geçerli, benzersiz tatil tarihi gerekir. İndirmek için taslak takvimi düzeltin.', 'Use a valid Fornost calendar JSON file (up to 16 KB), with at least one unique working day and up to 366 valid, unique holiday dates. To download, correct the draft calendar.')}</p>}
    {preview && !reading && !error && <section aria-label={t('Takvim aktarım önizlemesi', 'Calendar import preview')}>
      <p>{preview.mode === 'business' ? t('İş günü', 'Business days') : t('Takvim günü', 'Calendar days')} · {preview.weekdays.map(d => days[d]).join(', ')}</p>
      <p>{t('Mevcut / gelen tatil sayısı', 'Current / incoming holiday count')}: {calendar.holidays.length} / {preview.holidays.length}</p>
      <p>{t('Mevcut tatil listesi gelen listeyle değiştirilir; birleştirilmez.', 'The incoming list replaces the current holiday list; it does not merge it.')}</p>
      <div style={{maxHeight:200,overflow:'auto'}}><ul>{preview.holidays.map(d => <li key={d}>{d}</li>)}</ul></div>
      <button type="button" onClick={() => { onApply(preview); setPreview(null); setSource(''); setApplied(true); }}>{t('Takvimi taslağa uygula', 'Apply calendar to draft')}</button>
    </section>}
    {applied && <p role="status">{t('Takvim taslağa uygulandı. Kalıcı olması için hatırlatma profilini kaydedin.', 'Calendar applied to draft. Save the reminder profile to persist it.')}</p>}
  </details>;
}
