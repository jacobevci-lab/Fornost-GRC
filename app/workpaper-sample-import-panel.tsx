"use client";
import { useEffect, useRef, useState } from 'react';
import type { WorkpaperSample } from './audit-workpapers';
import { parseSampleImport, SAMPLE_IMPORT_BYTES, SampleImportError, sampleImportTemplate } from './workpaper-sample-import';
export function WorkpaperSampleImport({ samples, populationCount, tr, onAppend }: { samples: WorkpaperSample[]; populationCount: number; tr: boolean; onAppend: (rows: WorkpaperSample[]) => void }) {
  const [source, setSource] = useState(''), [preview, setPreview] = useState(false), [reading, setReading] = useState(false), [fileError, setFileError] = useState(''), [added, setAdded] = useState(0);
  const generation = useRef(0), applied = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const t = (a: string, b: string) => tr ? a : b;
  const messages = {
    size: t('Dosya en fazla 1 MB olabilir.', 'The file must not exceed 1 MB.'),
    format: t('Geçersiz CSV. Her satır reference ve note sütunlarını içermeli.', 'Invalid CSV. Each row must contain the reference and note columns.'),
    headers: t('Başlıklar reference,note olmalı. Şablonu kullanın.', 'Headers must be reference,note. Use the template.'),
    empty: t('En az bir örnek satırı girin.', 'Enter at least one sample row.'),
    reference: t('Örnek referansı 1–200 karakter olmalı ve satır sonu içermemeli.', 'Sample references must contain 1–200 characters without line breaks.'),
    note: t('Açıklama en fazla 2000 karakter olabilir.', 'Notes must not exceed 2000 characters.'),
    duplicate: t('Tekrarlanan örnek referansı. Dosyayı ve mevcut taslağı kontrol edin.', 'Duplicate sample reference. Check the file and existing draft.'),
    limit: t('Mevcut örneklerle birlikte en fazla 100 örnek eklenebilir.', 'The combined draft must not exceed 100 samples.'),
    population: t('Önce geçerli evren büyüklüğü girin; toplam örnek sayısı evreni aşamaz.', 'Enter a valid population size first; total samples cannot exceed the population.'),
  };
  let rows: WorkpaperSample[] = [], error = '';
  if (preview && !reading) try { rows = parseSampleImport(source, samples, populationCount); } catch (e) { error = e instanceof SampleImportError ? `${e.row ? t('CSV satırı', 'CSV row') + ' ' + e.row + ': ' : ''}${messages[e.code]}` : messages.format; }
  function change(value: string) { generation.current++; setReading(false); setSource(value); setPreview(false); setFileError(''); setAdded(0); applied.current = false; }
  async function read(file?: File) {
    if (!file) return;
    const ticket = ++generation.current; setSource(''); setPreview(false); setAdded(0); setFileError(''); applied.current = false;
    if (file.size > SAMPLE_IMPORT_BYTES) { setReading(false); setFileError(messages.size); return; }
    setReading(true);
    try { const value = await file.text(); if (ticket === generation.current) { setSource(value); setPreview(true); } }
    catch { if (ticket === generation.current) setFileError(t('Dosya okunamadı. Tekrar seçin.', 'The file could not be read. Select it again.')); }
    finally { if (ticket === generation.current) setReading(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + sampleImportTemplate], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'workpaper-samples.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="aw-import"><summary>{t('CSV’den toplu örnek ekle', 'Import samples from CSV')}</summary>
    <p>{t('reference,note başlıklarını kullanın. Virgül, noktalı virgül veya sekme ayracı desteklenir. Örnekler Bekliyor durumunda eklenir; sonuç ve kanıt sürümünü daha sonra seçin. Taslağı kaydedene kadar sunucuya yazılmaz.', 'Use reference,note headers. Comma, semicolon and tab separators are supported. Samples are added as Pending; select results and evidence versions afterwards. Nothing is saved to the server until you save the draft.')}</p>
    <button type="button" onClick={download}>{t('CSV şablonunu indir', 'Download CSV template')}</button>
    <label>{t('Örnek CSV dosyası', 'Sample CSV file')}<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file); }}/></label>
    <label>{t('CSV içeriği', 'CSV content')}<textarea rows={5} maxLength={SAMPLE_IMPORT_BYTES} value={source} onChange={e => change(e.target.value)} spellCheck={false}/></label>
    <div className="aw-actions"><button type="button" disabled={reading} onClick={() => { setPreview(true); setAdded(0); }}>{t('Örnekleri önizle', 'Preview samples')}</button><button type="button" onClick={() => change('')}>{t('İçe aktarımı temizle', 'Clear import')}</button></div>
    {reading && <p role="status">{t('Dosya okunuyor…', 'Reading file…')}</p>}
    {(fileError || error) && <p role="alert">{fileError || error}</p>}
    {preview && !reading && !error && !fileError && rows.length > 0 && <section aria-label={t('Örnek içe aktarma önizlemesi', 'Sample import preview')}>
      <p>{rows.length} {t('yeni örnek; toplam', 'new samples; total')} {samples.length + rows.length} / {populationCount}</p>
      <ol className="aw-import-preview">{rows.map(row => <li key={row.reference}><b>{row.reference}</b><p>{row.note || '—'}</p><span>{t('Bekliyor · Kanıt seçilmedi', 'Pending · No evidence selected')}</span></li>)}</ol>
      <button type="button" onClick={() => { if (applied.current) return; applied.current = true; onAppend(rows); setSource(''); setPreview(false); setAdded(rows.length); }}>{t('Örnekleri taslağa ekle', 'Add samples to draft')}</button>
    </section>}
    {added > 0 && <p role="status">{added} {t('örnek taslağa eklendi. Kalıcı olması için taslağı kaydedin.', 'samples added to the draft. Save the draft to persist them.')}</p>}
  </details>;
}
