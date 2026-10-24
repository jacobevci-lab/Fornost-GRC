"use client";
import { useEffect, useRef, useState } from 'react';
import { SampleImportError, sampleImportTemplate } from './workpaper-sample-import';
import { POPULATION_BYTES, POPULATION_ROWS, randomSelectionSeed, selectRandomSamples, type RandomSelection, type RandomSelectionInput, type SavedRandomSelection } from './workpaper-random-sampling';
import type { WorkpaperSample } from './audit-workpapers';

function download(value: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function RandomSelectionReceipt({ selection, tr }: { selection?: RandomSelection | SavedRandomSelection; tr: boolean }) {
  if (!selection) return null;
  const t = (a: string, b: string) => tr ? a : b;
  return <details className="aw-selection-receipt"><summary>{t('Rastgele seçim kaydı', 'Random selection record')} · {selection.sampleCount} / {selection.populationCount}</summary>
    <dl><dt>{t('Yöntem sürümü', 'Algorithm version')}</dt><dd>{selection.algorithm}</dd><dt>{t('Seçim anahtarı (seed)', 'Selection seed')}</dt><dd>{selection.seed}</dd><dt>{t('Evren SHA-256', 'Population SHA-256')}</dt><dd>{selection.populationSha256}</dd><dt>{t('Seçim gerekçesi', 'Selection reason')}</dt><dd>{selection.reason}</dd>
      {'selectedBy' in selection && <><dt>{t('Kaydeden / tarih', 'Recorded by / at')}</dt><dd>{selection.selectedBy} · {selection.selectedAt}</dd></>}</dl>
    <p>{t('Kaynak CSV saklanmaz. Tekrar üretmek için özgün CSV’yi ve bu kaydı koruyun. Örneklem büyüklüğü güven düzeyi veya hata payı hesaplamaz.', 'The source CSV is not retained. Keep the original CSV and this record to reproduce the selection. Sample size does not calculate a confidence level or margin of error.')}</p>
    <button type="button" onClick={() => download(JSON.stringify(selection, null, 2), 'workpaper-random-selection.json', 'application/json')}>{t('Seçim kaydını indir', 'Download selection record')}</button>
  </details>;
}

export function WorkpaperRandomSampling({ tr, existingCount, savedSelection, onApply }: { tr: boolean; existingCount: number; savedSelection?: SavedRandomSelection; onApply: (input: RandomSelectionInput, samples: WorkpaperSample[], selection: RandomSelection) => void }) {
  const t = (a: string, b: string) => tr ? a : b;
  const [source, setSource] = useState(''), [seed, setSeed] = useState(savedSelection?.seed || ''), [count, setCount] = useState(savedSelection?.sampleCount || 1), [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof selectRandomSamples>> | null>(null), [error, setError] = useState(''), [working, setWorking] = useState(false), [applied, setApplied] = useState(false);
  const generation = useRef(0), appliedLock = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  function invalidate() { generation.current++; setWorking(false); setPreview(null); setError(''); setApplied(false); appliedLock.current = false; }
  function message(error: unknown) {
    if (!(error instanceof SampleImportError)) return t('1–100 örnek, evreni aşmayan adet, 64 küçük onaltılık karakterli anahtar ve en az 3 karakterlik gerekçe girin.', 'Enter 1–100 samples within the population, a 64-character lowercase hexadecimal seed and a reason of at least 3 characters.');
    const messages: Record<SampleImportError['code'], string> = {
      size: t('Evren CSV’si en fazla 256 KiB olabilir.', 'The population CSV must not exceed 256 KiB.'),
      limit: t(`En fazla ${POPULATION_ROWS} evren satırı desteklenir.`, `Up to ${POPULATION_ROWS} population rows are supported.`),
      duplicate: t('Evren referansları benzersiz olmalı; büyük/küçük harf ve kenar boşlukları dikkate alınmaz.', 'Population references must be unique, ignoring case and outer whitespace.'),
      format: t('Geçersiz CSV; her satır reference ve note sütunlarını içermeli.', 'Invalid CSV; each row must contain reference and note columns.'),
      headers: t('CSV başlıkları reference,note olmalı.', 'CSV headers must be reference,note.'),
      empty: t('Evren en az bir satır içermeli.', 'The population must contain at least one row.'),
      reference: t('Referanslar 1–200 karakter olmalı ve satır sonu içermemeli.', 'References must contain 1–200 characters without line breaks.'),
      note: t('Açıklamalar en fazla 2000 karakter olabilir ve boş karakter içeremez.', 'Notes must not exceed 2000 characters or contain a null character.'),
      population: t('Örnek sayısı evreni aşamaz.', 'Sample count cannot exceed the population.'),
    };
    return `${error.row ? t('CSV satırı', 'CSV row') + ' ' + error.row + ': ' : ''}${messages[error.code]}`;
  }
  async function read(file?: File) {
    if (!file) return; invalidate(); setSource('');
    if (file.size > POPULATION_BYTES) { setError(message(new SampleImportError('size'))); return; }
    const ticket = generation.current; setWorking(true);
    try { const text = await file.text(); if (ticket === generation.current) setSource(text); }
    catch { if (ticket === generation.current) setError(t('Dosya okunamadı. Tekrar seçin.', 'The file could not be read. Select it again.')); }
    finally { if (ticket === generation.current) setWorking(false); }
  }
  async function draw() {
    invalidate(); const ticket = generation.current, chosenSeed = seed || randomSelectionSeed(); setSeed(chosenSeed); setWorking(true);
    try { const result = await selectRandomSamples({ source, seed: chosenSeed, count, reason }); if (ticket === generation.current) setPreview(result); }
    catch (e) { if (ticket === generation.current) setError(message(e)); }
    finally { if (ticket === generation.current) setWorking(false); }
  }
  const matches = preview && savedSelection && preview.selection.populationSha256 === savedSelection.populationSha256 && preview.selection.seed === savedSelection.seed && JSON.stringify(preview.selection.references) === JSON.stringify(savedSelection.references);
  return <section className="aw-random" aria-label={t('CSV evreninden rastgele seçim', 'Random selection from CSV population')}>
    <h4>{t('CSV evreninden rastgele seçim', 'Random selection from CSV population')}</h4>
    <p>{t('Tam evreni yükleyin: reference,note başlıkları, en fazla 5000 satır ve 256 KiB. Aynı evren ve anahtar aynı seçimi üretir; satır sırası sonucu değiştirmez. Adedi siz belirleyin. Önizleme sunucuya yazmaz.', 'Upload the complete population: reference,note headers, up to 5000 rows and 256 KiB. The same population and seed reproduce the selection; row order does not change it. You choose the sample size. Preview makes no server writes.')}</p>
    <button type="button" onClick={() => download('\uFEFF' + sampleImportTemplate, 'workpaper-population.csv', 'text/csv;charset=utf-8')}>{t('Evren şablonunu indir', 'Download population template')}</button>
    <label>{t('Evren CSV dosyası', 'Population CSV file')}<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file); }}/></label>
    <label>{t('Evren CSV içeriği', 'Population CSV content')}<textarea rows={5} maxLength={POPULATION_BYTES} value={source} spellCheck={false} onChange={e => { invalidate(); setSource(e.target.value); }}/></label>
    <div className="aw-grid"><label>{t('Seçilecek örnek sayısı', 'Samples to select')}<input type="number" min={1} max={100} value={count || ''} onChange={e => { invalidate(); setCount(Number(e.target.value)); }}/></label>
      <label>{t('Seçim anahtarı (seed)', 'Selection seed')}<input value={seed} maxLength={64} spellCheck={false} onChange={e => { invalidate(); setSeed(e.target.value); }}/></label></div>
    <p>{t('Anahtar boşsa güvenli rastgele anahtar üretilir. Yeni anahtar yeni bir seçimdir; değişikliği gerekçelendirin.', 'An empty seed generates a secure random seed. A new seed means a new selection; explain the change.')}</p>
    <label>{t('Seçim gerekçesi', 'Selection reason')}<textarea maxLength={2000} value={reason} onChange={e => { invalidate(); setReason(e.target.value); }}/></label>
    <div className="aw-actions"><button type="button" disabled={working} onClick={() => void draw()}>{t('Rastgele seçimi önizle', 'Preview random selection')}</button><button type="button" onClick={() => { invalidate(); setSeed(randomSelectionSeed()); }}>{t('Yeni seçim anahtarı üret', 'Generate new seed')}</button><button type="button" onClick={() => { invalidate(); setSource(''); }}>{t('Evren girişini temizle', 'Clear population input')}</button></div>
    {working && <p role="status">{t('Evren işleniyor…', 'Processing population…')}</p>}{error && <p role="alert">{error}</p>}
    {preview && <section aria-label={t('Rastgele seçim önizlemesi', 'Random selection preview')}>
      <p>{preview.selection.sampleCount} / {preview.selection.populationCount} · {t('Tekrarsız seçim', 'Selection without replacement')}</p>
      {savedSelection && <p role="status">{matches ? t('Kayıtlı seçimle aynı sonuç.', 'Matches the saved selection.') : t('Kayıtlı seçimden farklı sonuç; gerekçeyi kontrol edin.', 'Differs from the saved selection; review the reason.')}</p>}
      <RandomSelectionReceipt selection={preview.selection} tr={tr}/>
      <ol className="aw-import-preview">{preview.samples.map(s => <li key={s.reference}><b>{s.reference}</b><p>{s.note || '—'}</p><span>{t('Bekliyor · Kanıt seçilmedi', 'Pending · No evidence selected')}</span></li>)}</ol>
      <p>{t(`Uygulama, taslaktaki ${existingCount} örneği ve test sonuçlarını değiştirir; evren büyüklüğünü ${preview.selection.populationCount} yapar. Kalıcı olması için taslağı kaydedin.`, `Applying replaces the ${existingCount} draft samples and their test results; population size becomes ${preview.selection.populationCount}. Save the draft to persist it.`)}</p>
      <button type="button" disabled={applied} onClick={() => { if (appliedLock.current) return; appliedLock.current = true; onApply({ source, seed, count, reason }, preview.samples, preview.selection); setApplied(true); }}>{t('Taslak örneklerini bu seçimle değiştir', 'Replace draft samples with this selection')}</button>
    </section>}
    {applied && <p role="status">{t('Seçim taslağa uygulandı. Kaydederken sunucu seçimi yeniden hesaplar.', 'Selection applied to the draft. The server recalculates it on save.')}</p>}
  </section>;
}
