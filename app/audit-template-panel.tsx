'use client';
import { useId, useState } from 'react';
import { applyDraftTemplate, builtInDraftTemplates, exportDraftTemplate, parseDraftTemplate, type DraftTemplate, type TemplateKind } from './audit-draft-templates';
import { downloadBlob } from './report-export';
import './audit-template-panel.css';
import {AuditTemplateLibrary} from './audit-template-library';

export function AuditTemplatePanel({kind, tr, draft, labels, disabled, apply}: {kind: TemplateKind; tr: boolean; draft: Record<string, string>; labels: Record<string, string>; disabled: boolean; apply: (fields: Record<string, string>) => void}) {
  const id = useId(), t = (a: string, b: string) => tr ? a : b;
  const [preview, setPreview] = useState<DraftTemplate | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [json, setJson] = useState(''), [name, setName] = useState(''), [error, setError] = useState(false), [notice, setNotice] = useState('');
  const templates = builtInDraftTemplates(kind, tr);
  function show(next: DraftTemplate) { setPreview(next); setSelected(Object.keys(next.fields).filter(key => !draft[key]?.trim())); setError(false); setNotice(''); }
  function useTemplate() {
    if (disabled || !preview || !selected.length) return;
    try { apply(applyDraftTemplate(draft, preview, selected)); setPreview(null); setNotice(t('Seçili alanlar taslağa uygulandı. Kaydetmeden kayıt değişmez.', 'Selected fields applied to the draft. The record changes only when you save.')); }
    catch { setError(true); }
  }
  return <details className="audit-template-panel"><summary>{t('Şablonlar', 'Templates')}</summary>
    <p>{t('Hazır metinleri inceleyip uygulanacak alanları seçin. Dolu alanlar başlangıçta seçilmez. Kişiler, tarihler, durum ve onaylar şablona dahil değildir.', 'Review suggested text and select fields to apply. Populated fields are initially unselected. People, dates, status and approvals are excluded.')}</p>
    <AuditTemplateLibrary kind={kind} tr={tr} source={{version:1,kind,name:'Draft',fields:Object.fromEntries((kind==='plan'?['objective','scope','exclusions','methodology','deliverables','milestones']:['title','description']).map(key=>[key,draft[key]||'']))}} disabled={disabled} onChoose={template=>{if(template.kind===kind)show(template);}}/>
    <fieldset disabled={disabled}><legend>{t('Şablon seçimi', 'Template selection')}</legend>
      <div className="at-actions">{templates.map(template => <button key={template.name} type="button" onClick={() => show(template)}>{template.name}</button>)}</div>
      <label htmlFor={`${id}-json`}>{t('Şablon JSON içeriği', 'Template JSON content')}</label><textarea id={`${id}-json`} maxLength={50000} rows={3} value={json} onChange={e => { setJson(e.target.value); setPreview(null); setError(false); setNotice(''); }}/>
      <button type="button" disabled={!json.trim()} onClick={() => { try { show(parseDraftTemplate(json, kind)); } catch { setPreview(null); setError(true); } }}>{t('JSON önizle', 'Preview JSON')}</button>
      <label htmlFor={`${id}-name`}>{t('Dışa aktarılacak şablon adı', 'Export template name')}</label><input id={`${id}-name`} maxLength={80} value={name} onChange={e => setName(e.target.value)}/>
      <button type="button" disabled={!name.trim()} onClick={() => { try { const text = exportDraftTemplate(kind, name, draft); downloadBlob(`fornost-${kind}-template.json`, new Blob([text], {type:'application/json'})); setError(false); setNotice(t('Taslak metinleri şablon olarak indirildi. Paylaşmadan önce içeriği kontrol edin.', 'Draft text downloaded as a template. Review its content before sharing.')); } catch { setError(true); } }}>{t('Taslağı şablon olarak indir', 'Download draft as template')}</button>
    </fieldset>
    {error && <p role="alert">{t('Şablon okunamadı. Tür, sürüm, alanlar veya metin sınırları geçersiz; taslak değiştirilmedi.', 'Template could not be read. Invalid type, version, fields or text limits; the draft was not changed.')}</p>}
    {notice && <p role="status">{notice}</p>}
    {preview && <fieldset disabled={disabled}><legend>{t('Önizleme', 'Preview')}: {preview.name}</legend>
      {Object.entries(preview.fields).map(([key, value]) => <div key={key} className="at-field"><label><input type="checkbox" aria-label={`${t("Uygula", "Apply field")}: ${labels[key] || key}`} checked={selected.includes(key)} onChange={e => setSelected(previous => e.target.checked ? [...previous, key] : previous.filter(item => item !== key))}/>{labels[key] || key}</label><small>{t('Mevcut taslak', 'Current draft')}</small><p>{draft[key] || '—'}</p><small>{t('Şablondan gelecek metin', 'Template text')}</small><p>{value || '—'}</p></div>)}
      <button type="button" disabled={!selected.length} onClick={useTemplate}>{t('Seçili alanları taslağa uygula', 'Apply selected fields to draft')}</button>
      <button type="button" onClick={() => setPreview(null)}>{t('Önizlemeyi kapat', 'Close preview')}</button>
    </fieldset>}
  </details>;
}
