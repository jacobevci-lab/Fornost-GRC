'use client';
import { useEffect, useRef, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { withBasePath } from './base-path';
import { parseImportSheet, mappedImport, validateImportRows, importIssueText, RegisterImportError, type ImportSheet, type ImportIssue } from './register-import';
import './register-import.css';

type Approved = { rows: Record<string, unknown>[]; importId: string };
export function RegisterImportModal({ module, lang, title, fields, labels, aliases, onClose, onDone }: {
  module: string; lang: string; title: string; fields: string[]; labels: Record<string, string>; aliases: Record<string, string>; onClose: () => void; onDone: (count: number, replayed: boolean) => void;
}) {
  const tr = lang === 'tr', t = (a: string, b: string) => tr ? a : b;
  const input = useRef<HTMLInputElement>(null), active = useRef(true), generation = useRef(0), pending = useRef(false), controller = useRef<AbortController | null>(null);
  const [sheet, setSheet] = useState<ImportSheet | null>(null), [mapping, setMapping] = useState<Record<string, string>>({}), [filename, setFilename] = useState('');
  const [error, setError] = useState(''), [issues, setIssues] = useState<ImportIssue[]>([]), [busy, setBusy] = useState(''), [approved, setApproved] = useState<Approved | null>(null), [uncertain, setUncertain] = useState(false), [page, setPage] = useState(0);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  const invalidate = () => { setApproved(null); setIssues([]); setError(''); setPage(0); };
  async function read(file: File) {
    if (pending.current || uncertain) return;
    const ticket = ++generation.current;
    invalidate(); setSheet(null); setMapping({}); setFilename(file.name); setBusy('read');
    try {
      if (file.size > 5 * 1024 * 1024) throw new RegisterImportError('file-size');
      if (!/\.xlsx$/i.test(file.name)) throw new RegisterImportError('file-type');
      const parsed = parseImportSheet(await readSheet(file));
      if (!active.current || ticket !== generation.current) return;
      const initial: Record<string, string> = {};
      for (const column of parsed.columns) {
        const norm = column.label.toLocaleLowerCase(tr ? 'tr-TR' : 'en-US');
        const alias = aliases[norm], canonical = alias === 'likelihood' ? 'inherentLikelihood' : alias === 'impact' ? 'inherentImpact' : alias;
        initial[column.index] = (fields.includes(canonical) ? canonical : fields.find(key => key.toLowerCase() === column.label.toLowerCase() || (labels[key] || key).toLocaleLowerCase(tr ? 'tr-TR' : 'en-US') === norm)) || '';
      }
      setSheet(parsed); setMapping(initial);
    } catch (e) {
      if (!active.current || ticket !== generation.current) return;
      setError(importIssueText(e instanceof RegisterImportError ? e.issues[0] || { code: e.code } : { code: 'file-read' }, lang, labels));
    } finally { if (active.current && ticket === generation.current) setBusy(''); }
  }
  let converted: ReturnType<typeof mappedImport> | null = null, mappingError = '', localIssues: ImportIssue[] = [];
  if (sheet) try { converted = mappedImport(sheet, mapping, fields); localIssues = validateImportRows(module, converted.rows).issues; } catch (e) { mappingError = importIssueText({ code: e instanceof RegisterImportError ? e.code : 'mapping' }, lang, labels); }
  const problems = issues.length ? issues : localIssues, previewRows = approved?.rows || converted?.rows || [];
  const previewFields = [...new Set(previewRows.flatMap(row => Object.keys(row)))], pages = Math.max(1, Math.ceil(previewRows.length / 20));
  const locked = !!busy || uncertain;
  async function send(commit: boolean) {
    if (pending.current || !converted || mappingError || localIssues.length || (commit && !approved)) return;
    pending.current = true; setBusy(commit ? 'commit' : 'preview'); setError(''); setIssues([]);
    const request = new AbortController(); controller.current = request;
    const timer = window.setTimeout(() => request.abort(), 30000);
    let definitive = false;
    try {
      const payload = commit ? { module, rows: approved!.rows, importId: approved!.importId } : { module, rows: converted.rows, action: 'preview-import' };
      const bodyText = JSON.stringify(payload);
      if (new TextEncoder().encode(bodyText).length > 2_000_000) { definitive = true; throw new RegisterImportError('payload-limit'); }
      const response = await fetch(withBasePath('/api/grc'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: bodyText, signal: request.signal });
      const body = await response.json();
      if (!response.ok) {
        definitive = response.status >= 400 && response.status < 500;
        const code = response.status === 401 || response.status === 403 ? 'forbidden' : body.code === 'AUDIT_CLOSED' ? 'audit-closed' : body.code === 'REFERENCE_UNAVAILABLE' ? 'reference-unavailable' : body.error;
        throw new RegisterImportError(typeof code === 'string' ? code : 'unavailable', Array.isArray(body.issues) ? body.issues : []);
      }
      if (commit) {
        if (body.ok !== true || body.imported !== approved!.rows.length || typeof body.replayed !== 'boolean') throw new Error('receipt');
        if (active.current) { setUncertain(false); onDone(body.imported, body.replayed); }
      } else {
        const expected = validateImportRows(module, converted.rows);
        if (body.preview !== true || body.count !== converted.rows.length || JSON.stringify(body.rows) !== JSON.stringify(expected.rows)) throw new Error('preview');
        if (active.current) { setApproved({ rows: body.rows, importId: crypto.randomUUID() }); setUncertain(false); setPage(0); }
      }
    } catch (e) {
      if (!active.current) return;
      if (commit && !definitive) {
        setUncertain(true);
        setError(t('Sunucunun sonucu alınamadı. Aynı işlemi yeniden deneyin; işlem kimliği mükerrer kaydı önler. Pencereyi kapatırsanız yeniden içe aktarmadan önce kayıtları kontrol edin.', 'The server result could not be received. Retry the same operation; its ID prevents duplicate records. If you close this dialog, check the register before starting another import.'));
      } else {
        setApproved(null); setUncertain(false);
        if (e instanceof RegisterImportError && e.issues.length) setIssues(e.issues);
        setError(importIssueText({ code: e instanceof RegisterImportError ? e.code : 'unavailable' }, lang, labels));
      }
    } finally { window.clearTimeout(timer); pending.current = false; if (active.current) setBusy(''); }
  }
  return <div className="overlay"><div data-escape-layer className="modal import-modal register-import-modal" role="dialog" aria-modal="true" aria-label={t('Excel içe aktar', 'Import Excel')} aria-busy={!!busy}>
    <div className="modal-head"><div><small>{t('EXCEL İÇE AKTAR', 'IMPORT EXCEL')}</small><h2>{title}</h2></div><button data-escape-close type="button" disabled={busy === 'commit'} aria-label={t('Pencereyi kapat', 'Close dialog')} onClick={onClose}>×</button></div>
    <div className="import-body">
      <p>{t('İlk çalışma sayfası okunur. Yeni kayıtlar oluşturulur; mevcut kayıtlar güncellenmez veya birleştirilmez.', 'The first worksheet is read. This creates new records; existing records are not updated or merged.')}</p>
      <button className="drop register-import-file" type="button" disabled={locked} onClick={() => input.current?.click()}><b>{filename || t('Excel dosyanı seç', 'Select an Excel file')}</b><span>{t('.xlsx · En fazla 5 MB, 100 sütun ve 1.000 dolu satır', '.xlsx · Up to 5 MB, 100 columns and 1,000 populated rows')}</span></button>
      <input ref={input} type="file" accept=".xlsx" hidden aria-label={t('Excel dosyası', 'Excel workbook')} disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file); }} />
      {busy && <p role="status">{busy === 'read' ? t('Dosya okunuyor…', 'Reading workbook…') : busy === 'preview' ? t('Sunucuda doğrulanıyor…', 'Validating on the server…') : t('Kayıtlar oluşturuluyor…', 'Creating records…')}</p>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {sheet && <>
        <div className="import-summary"><b>{sheet.rows.length} {t('dolu satır', 'populated rows')}</b><span>{sheet.blankRows} {t('boş satır atlandı', 'blank rows skipped')}</span></div>
        <h3>{t('1. Sütunları eşleştir', '1. Map columns')}</h3>
        <div className="mapping">{sheet.columns.map(column => <label key={column.index}><span>{column.label} · {t('Sütun', 'Column')} {column.index + 1}</span><select disabled={locked} value={mapping[column.index] || ''} onChange={e => { invalidate(); setMapping({ ...mapping, [column.index]: e.target.value }); }}><option value="">{t('İçe aktarma', 'Do not import')}</option>{fields.map(key => <option key={key} value={key}>{labels[key] || key}</option>)}</select></label>)}</div>
        {mappingError && <p role="alert" className="auth-error">{mappingError}</p>}
        {converted && <p>{converted.rows.length} {t('satır seçildi', 'rows selected')} · {converted.ignoredColumns} {t('sütun dışarıda', 'columns excluded')} · {converted.excludedRows} {t('eşlenen alanları boş satır dışarıda', 'rows with empty mapped fields excluded')}</p>}
        {!!problems.length && <div className="register-import-issues" role="alert"><b>{problems.length} {t('satır hatası; hiçbir kayıt oluşturulmadı.', 'row errors; no records created.')}</b><ul>{problems.slice(0, 50).map((issue, i) => <li key={i}>{issue.row ? `${t('Excel satırı', 'Excel row')} ${converted?.sourceRows[issue.row - 1] || issue.row}: ` : ''}{importIssueText(issue, lang, labels)}</li>)}</ul>{problems.length > 50 && <p>{t('İlk 50 hata gösteriliyor. Dosyayı düzeltip tekrar seçin.', 'Showing the first 50 errors. Correct the workbook and select it again.')}</p>}</div>}
        {!!previewRows.length && <><h3>{t('2. Kayıtları incele', '2. Review records')}</h3><p role="status">{approved ? t('Sunucu doğruladı. Aşağıdaki normalleştirilmiş kayıtlar oluşturulacak. Kaydederken yetki ve bağlantılar tekrar kontrol edilir.', 'Server validation passed. The normalized records below will be created. Permissions and references are checked again on save.') : t('Taslak önizleme; henüz sunucuda doğrulanmadı. Eşlemeyi kontrol edip doğrulayın.', 'Draft preview; not yet validated on the server. Check mappings, then validate.')}</p>
          <div className="register-import-table" tabIndex={0} role="region" aria-label={t('Kayıt önizlemesi', 'Record preview')}><table><caption>{Math.min(page * 20 + 1, previewRows.length)}–{Math.min((page + 1) * 20, previewRows.length)} / {previewRows.length} {t('satır', 'rows')}</caption><thead><tr><th scope="col">{t('Excel satırı', 'Excel row')}</th>{previewFields.map(key => <th scope="col" key={key}>{labels[key] || key}</th>)}</tr></thead><tbody>{previewRows.slice(page * 20, page * 20 + 20).map((row, i) => <tr key={i}><th scope="row">{converted?.sourceRows[page * 20 + i]}</th>{previewFields.map(key => <td key={key}>{String(row[key] ?? '') || '—'}</td>)}</tr>)}</tbody></table></div>
          {pages > 1 && <div className="register-import-pages"><button type="button" disabled={page === 0 || !!busy} onClick={() => setPage(page - 1)}>{t('Önceki', 'Previous')}</button><span>{page + 1} / {pages}</span><button type="button" disabled={page + 1 >= pages || !!busy} onClick={() => setPage(page + 1)}>{t('Sonraki', 'Next')}</button></div>}
        </>}
      </>}
    </div>
    <div className="modal-foot"><button type="button" disabled={busy === 'commit'} onClick={onClose}>{t('Kapat', 'Close')}</button>{!approved ? <button type="button" className="primary" disabled={!!busy || !converted || !!mappingError || !!localIssues.length} onClick={() => void send(false)}>{t('Önizlemeyi doğrula', 'Validate preview')}</button> : <button type="button" className="primary" disabled={!!busy} onClick={() => void send(true)}>{uncertain ? t('Aynı işlemi yeniden dene', 'Retry the same import') : t(`${approved.rows.length} kaydı içe aktar`, `Import ${approved.rows.length} ${approved.rows.length === 1 ? "record" : "records"}`)}</button>}</div>
  </div></div>;
}
