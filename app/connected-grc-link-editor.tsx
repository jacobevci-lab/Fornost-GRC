"use client";
import { useEffect, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { connectedTitle, type ConnectedGrcRow as Row, type ConnectedGrcLink as Link } from './connected-grc-model';
import { canWriteModule, type AccessSubject } from './module-access';
import { editableConnections, recordMatches } from './connected-grc-workbench-model';

type Props = { row: Row; rows: Row[]; links: Link[]; lang: 'tr' | 'en'; actor: AccessSubject & { email: string }; plan?: boolean; initialField?: string; refresh: () => Promise<boolean>; close: () => void; openRecord: (row: Row) => void };
const nativeId = (row: Row) => row.data.kind === 'continuity-plan' && Array.isArray(row.data.canonicalRefs) ? String(row.data.canonicalRefs[0] || '') : row.id;
const errors: Record<string, [string, string]> = {
  changed: ['Kayıt değişti. Listeyi yenileyin ve güncel kaydı yeniden seçin.', 'Record changed. Refresh and select the current record again.'],
  unavailable: ['Kayıt artık erişilebilir değil. Seçiminizi yenileyin.', 'Record is no longer available. Refresh your selection.'],
  forbidden: ['Bu bağlantıyı değiştirme yetkiniz yok.', 'You cannot change this relationship.'],
  required: ['Bu ilişki zorunlu. Kaldırmak yerine başka bir kayıt seçin.', 'This relationship is required. Select a replacement instead.'],
  validation: ['Kaynak kayıtta tamamlanması gereken alanlar var. Kaydı açıp düzeltin.', 'The source record has incomplete fields. Open and correct it.'],
  'audit-closed': ['Kapalı denetimde değişiklik yapılamaz.', 'A closed audit cannot be changed.'],
  'not-linked': ['Eski metin referansını kaldırmak için kaynak kaydı düzenleyin.', 'Edit the source record to remove a legacy text reference.'],
  unchanged: ['Bu bağlantı zaten mevcut.', 'This relationship already exists.'],
};

export default function ConnectedLinkEditor({ row, rows, links, lang, actor, plan = false, initialField, refresh, close, openRecord }: Props) {
  const tr = lang === 'tr', index = tr ? 0 : 1;
  const sources = rows.filter(item => !item.id.startsWith('enterprise:') && editableConnections[item.module]?.length && canWriteModule(actor, item.module));
  const [sourceId, setSourceId] = useState(row.id), [field, setField] = useState(editableConnections[row.module]?.find(rule => rule.field === (row.module === 'Kanıtlar' && initialField === 'controlRef' ? 'controlRefs' : initialField))?.field || editableConnections[row.module]?.[0]?.field || ''), [targetId, setTargetId] = useState('');
  const [query, setQuery] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [locked, setLocked] = useState(false), [history, setHistory] = useState<Record<string, string>[] | null>(null), [historyError, setHistoryError] = useState(false);
  const pending = useRef(false), returnFocus = useRef<HTMLElement | null>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; heading.current?.focus({ preventScroll: true }); return () => { if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); }; }, []);
  const source = rows.find(item => item.id === sourceId), rule = source && editableConnections[source.module]?.find(item => item.field === field);
  const options = plan ? rows.filter(item => item.data.kind === 'continuity-plan' && item.data.status === 'draft' && (actor.role === 'Admin' || item.data.owner === actor.email)) : rule ? rows.filter(item => item.id !== source?.id && !item.id.startsWith('enterprise:') && rule.target.includes(item.module)) : [];
  const matching = options.filter(item => recordMatches(item, query, lang));
  const target = options.find(item => item.id === targetId);
  const related = source && rule ? links.filter(link => link.source.id === source.id && (link.field === field || (field === 'controlRefs' && link.field === 'controlRef'))) : [];
  const changeSource = (id: string) => { setSourceId(id); setField(editableConnections[rows.find(item => item.id === id)?.module || '']?.[0]?.field || ''); setTargetId(''); setHistory(null); setMessage(''); };
  async function save(action: 'link' | 'unlink', removal?: Row) {
    const selected = removal || target, actualSource = plan ? selected : source, actualTarget = plan ? row : selected;
    if (pending.current || locked || !actualSource || !actualTarget || !actualSource.updatedAt || note.trim().length < 3) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(withBasePath('/api/connected-grc/links'), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ sourceId: nativeId(actualSource), targetId: nativeId(actualTarget), kind: plan ? 'continuity-plan' : 'core', field: plan ? 'continuityBiaRef' : field, expectedUpdatedAt: actualSource.updatedAt, action, note: note.trim() }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(errors[result.code]?.[index] || (tr ? 'İşlem tamamlanamadı. Kaynağı kontrol edip yeniden deneyin.' : 'Action could not be completed. Check the source before retrying.'));
        if (response.status === 409 || response.status >= 500) setLocked(true);
        return;
      }
      // A successful mutation is never replayed after a refresh failure.
      setLocked(true); setHistory(null);
      const loaded = await refresh();
      setMessage(loaded ? (tr ? 'Bağlantı kaydedildi. Görünüm yenilendi; işlem geçmişine eklendi.' : 'Relationship saved. View refreshed and history recorded.') : (tr ? 'Bağlantı kaydedildi; görünüm yenilenemedi. Tekrar kaydetmeyin, listeyi yenileyin.' : 'Relationship saved, but refresh failed. Refresh the list; do not save again.'));
    } catch { setLocked(true); setMessage(tr ? 'İşlemin sonucu doğrulanamadı. Tekrar kaydetmeden önce listeyi yenileyip bağlantıyı kontrol edin.' : 'Outcome could not be confirmed. Refresh and inspect the relationship before saving again.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function loadHistory() {
    if (!source) return; setHistoryError(false);
    try { const response = await fetch(withBasePath(`/api/connected-grc/links?sourceId=${encodeURIComponent(nativeId(source))}`), { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(); const result = await response.json(); setHistory(result.events); }
    catch { setHistoryError(true); }
  }
  return <aside className="cgw-inspector cgw-editor" aria-label={tr ? 'Bağlantı düzenleme' : 'Edit relationship'} onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); close(); } }}>
    <header><h3 ref={heading} tabIndex={-1}>{plan ? (tr ? 'Süreklilik planı bağla' : 'Link continuity plan') : (tr ? 'Bağlantı düzenle' : 'Edit relationship')}</h3><button type="button" disabled={busy} onClick={close}>{tr ? 'Kapat' : 'Close'}</button></header>
    <p>{row.code || row.id} · {connectedTitle(row)}</p>
    <fieldset disabled={busy || locked}>
      {!plan && <><label>{tr ? 'Kaynak kayıt' : 'Source record'}<select aria-label={tr ? 'Kaynak kayıt' : 'Source record'} value={sourceId} onChange={e => changeSource(e.target.value)}><option value="">{tr ? 'Kayıt seçin' : 'Select record'}</option>{sources.map(item => <option key={item.id} value={item.id}>{item.code || item.id} · {connectedTitle(item)}</option>)}</select></label>
        <label>{tr ? 'İlişki türü' : 'Relationship type'}<select aria-label={tr ? 'İlişki türü' : 'Relationship type'} value={field} onChange={e => { setField(e.target.value); setTargetId(''); setMessage(''); }}>{(source && editableConnections[source.module] || []).map(item => <option key={item.field} value={item.field}>{item.label[index]}</option>)}</select></label></>}
      <label>{plan ? (tr ? 'Mevcut taslak planı ara' : 'Find an existing draft plan') : (tr ? 'Hedef kayıt ara' : 'Find target record')}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={tr ? 'Ad veya kod' : 'Name or code'}/></label>
      <label>{plan ? (tr ? 'Taslak plan' : 'Draft plan') : (tr ? 'Hedef kayıt' : 'Target record')}<select aria-label={plan ? (tr ? 'Taslak plan' : 'Draft plan') : (tr ? 'Hedef kayıt' : 'Target record')} value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">{tr ? 'Kayıt seçin' : 'Select record'}</option>{target && !matching.slice(0, 100).some(item => item.id === target.id) && <option value={target.id}>{target.code} · {connectedTitle(target)}</option>}{matching.slice(0, 100).map(item => <option key={item.id} value={item.id}>{item.code || item.id} · {connectedTitle(item)}</option>)}</select></label>
      {!matching.length && <p className="cgw-muted">{tr ? 'Uygun kayıt bulunamadı. Aramayı değiştirin veya kaynak modülde kayıt oluşturun.' : 'No eligible record found. Change the search or create one in its source module.'}</p>}
      {matching.length > 100 && <p>{tr ? 'İlk 100 kayıt gösteriliyor. Aramayı daraltın.' : 'Showing the first 100 records. Refine the search.'}</p>}
      <label>{tr ? 'İşlem notu' : 'Change note'}<textarea value={note} onChange={e => setNote(e.target.value)} minLength={3} maxLength={1000} rows={3} placeholder={tr ? 'Bağlantı değişikliğinin gerekçesi' : 'Reason for this relationship change'}/></label>
      <p className="cgw-muted">{plan ? (tr ? 'Seçili taslak planın BIA bağlantısı değiştirilir. Bağlamak planı onaylamaz.' : 'The selected draft plan’s BIA reference will be replaced. Linking does not approve the plan.') : (tr ? 'Tekil ilişkide seçim mevcut hedefi değiştirir. Bağlantıyı kaldırmak kaydı silmez.' : 'For a single relationship, selection replaces the existing target. Unlinking does not delete a record.')}</p>
      <button type="button" className="primary" disabled={!target || note.trim().length < 3 || (!plan && !source?.updatedAt)} onClick={() => void save('link')}>{busy ? (tr ? 'Kaydediliyor…' : 'Saving…') : (tr ? 'Bağlantıyı kaydet' : 'Save relationship')}</button>
      {!!related.length && <section className="cgw-existing"><h4>{tr ? 'Mevcut bağlantılar' : 'Existing relationships'}</h4>{related.map(link => <div key={link.target.id}><span>{link.target.code} · {connectedTitle(link.target)}</span><button type="button" disabled={note.trim().length < 3 || (!!rule?.required && related.length <= 1)} onClick={() => void save('unlink', link.target)}>{tr ? 'Bağlantıyı kaldır' : 'Unlink'}</button></div>)}{rule?.required && <small>{tr ? 'Son zorunlu bağlantı kaldırılamaz; yeni bir hedef seçebilirsiniz.' : 'The last required relationship cannot be removed; select a replacement.'}</small>}</section>}
    </fieldset>
    {message && <p className="cgw-message" role="status">{message}</p>}
    {locked && <button type="button" disabled={busy} onClick={async () => { await refresh(); close(); }}>{tr ? 'Listeyi yenile ve kapat' : 'Refresh list and close'}</button>}
    <button type="button" disabled={busy} onClick={() => openRecord(source || row)}>{tr ? 'Kaynak kaydı aç' : 'Open source record'}</button>
    {!plan && source && <details onToggle={e => { if (e.currentTarget.open && history === null) void loadHistory(); }}><summary>{tr ? 'Bağlantı işlem geçmişi' : 'Relationship change history'}</summary>{historyError ? <button type="button" onClick={() => void loadHistory()}>{tr ? 'Geçmiş yüklenemedi; tekrar dene' : 'History unavailable; retry'}</button> : history === null ? <p>{tr ? 'Yükleniyor…' : 'Loading…'}</p> : history.length ? history.map(event => <article key={event.id}><b>{event.actor}</b><p>{editableConnections[source.module]?.find(rule => rule.field === event.field)?.label[index] || event.field} · {event.action === 'unlink' ? (tr ? 'Kaldırıldı' : 'Unlinked') : (tr ? 'Bağlandı' : 'Linked')}</p><p>{event.note}</p><small>{new Date(event.created_at).toLocaleString(tr ? 'tr-TR' : 'en-US')}</small></article>) : <p>{tr ? 'Bu ekrandan kaydedilmiş bağlantı işlemi yok.' : 'No relationship changes recorded from this screen.'}</p>}</details>}
  </aside>;
}
