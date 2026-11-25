'use client';
import { useCallback, useId, useState, useSyncExternalStore } from 'react';
import { parseSavedViews, persistSavedViews, savedViewsKey, validateViewState, type SavedRegisterView, type SavedViewState, type ViewChange, type ViewSchema } from './saved-register-views';
import './saved-register-views.css';
import { viewSortLabel } from './register-sort';
import { AccountViewsPanel } from './account-views-panel';
const eventName = 'fornost-saved-views-changed', unavailable = '!storage-unavailable';
export function SavedRegisterViewsPanel(props: { userId: string; module: string; lang: string; current: SavedViewState; schema: ViewSchema; labels?: Record<string,string>; focused?: boolean; variant?: 'work'; apply: (state: SavedViewState) => void }) {
  return <div key={savedViewsKey(props.userId, props.module)}><Views {...props}/><AccountViewsPanel {...props}/></div>;
}
function Views({ userId, module, lang, current, schema, focused, variant, apply }: Parameters<typeof SavedRegisterViewsPanel>[0]) {
  const key = savedViewsKey(userId, module), id = useId(), tr = lang === 'tr', t = (a: string, b: string) => tr ? a : b;
  const subscribe = useCallback((notify: () => void) => {
    const external = (e: StorageEvent) => { if (e.key === key || e.key === null) notify(); };
    const local = () => notify();
    window.addEventListener('storage', external); window.addEventListener(eventName, local);
    return () => { window.removeEventListener('storage', external); window.removeEventListener(eventName, local); };
  }, [key]);
  const read = useCallback(() => { try { return localStorage.getItem(key); } catch { return unavailable; } }, [key]);
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const [selected, setSelected] = useState(''), [expected, setExpected] = useState(''), [name, setName] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState<'' | 'saved' | 'deleted' | 'applied'>('');
  let views: SavedRegisterView[] = [], loadError = false;
  try { views = parseSavedViews(raw); } catch { loadError = true; }
  const row = views.find(v => v.id === selected), stale = !!selected && JSON.stringify(row) !== expected;
  const messages: Record<string, string> = {
    invalid: t('Kayıtlı görünümler okunamadı. Mevcut veri değiştirilmedi; yeniden deneyin.', 'Saved views could not be read. Existing data was not overwritten; retry.'),
    storage: t('Tarayıcı kaydı başarısız. Görünüm kaydedilmedi; yeniden deneyin.', 'Browser storage failed. The view was not saved; retry.'),
    conflict: t('Görünüm başka bir sekmede değişti. Yeniden seçip inceleyin; taslak adınız korundu.', 'The view changed in another tab. Select it again and review; your draft name is retained.'),
    name: t('1–60 karakterlik bir ad girin.', 'Enter a name of 1–60 characters.'),
    duplicate: t('Bu adla bir görünüm var. Farklı bir ad seçin.', 'A view with this name exists. Choose another name.'),
    limit: t('Modül başına en fazla 10 görünüm saklanabilir.', 'You can save up to 10 views per module.'),
    schema: t('Bu görünüm artık desteklenmeyen alanlar içeriyor. Güncel filtre ve sütunlarla değiştirin.', 'This view contains fields that are no longer supported. Replace it with current filters and columns.'),
  };
  function choose(value: string) { const found = views.find(v => v.id === value); setSelected(value); setExpected(found ? JSON.stringify(found) : ''); setName(found?.name || ''); setError(''); setNotice(''); }
  function change(action: ViewChange['action']) {
    setError(''); setNotice('');
    if (action === 'delete' && !window.confirm(t(`“${row?.name}” görünümü silinsin mi? Kayıtlar silinmez.`, `Delete the “${row?.name}” view? Records are not deleted.`))) return;
    try {
      const itemId = action === 'create' ? crypto.randomUUID() : selected;
      const next = persistSavedViews(localStorage, key, raw, { action, id: itemId, name, state: current, expectedItem: expected }, schema);
      const saved = next.find(v => v.id === itemId);
      setSelected(saved?.id || ''); setExpected(saved ? JSON.stringify(saved) : ''); setName(saved?.name || '');
      window.dispatchEvent(new Event(eventName)); setNotice(action === 'delete' ? 'deleted' : 'saved');
    } catch (e) { setError(e instanceof Error && messages[e.message] ? e.message : 'storage'); window.dispatchEvent(new Event(eventName)); }
  }
  function applyView() {
    setError(''); setNotice('');
    try {
      if (read() !== raw || !row || JSON.stringify(row) !== expected) throw new Error('conflict');
      apply(validateViewState(row, schema)); setNotice('applied');
    } catch (e) { setError(e instanceof Error && messages[e.message] ? e.message : 'storage'); }
  }
  return <details className="saved-register-views"><summary>{t('Kayıtlı görünümler', 'Saved views')}</summary><div>
    <p>{variant === 'work' ? t('Arama, modül, iş durumu ve sıralama bu kullanıcı için bu tarayıcıda saklanır. Uygulama mevcut Benim/Organizasyon kapsamını korur ve güncel işleri gösterir; kayıt verisi saklanmaz.', 'Search, module, work status and sort order are saved in this browser for this user. Applying keeps the current Mine/Organization scope and shows current work; record data is not stored.') : t('Bu kullanıcı ve modül için bu tarayıcıda saklanır. Arama, filtreler, sütunlar ve sıralama kaydedilir; kayıt verisi saklanmaz veya paylaşılmaz.', 'Saved in this browser for this user and module. Stores search, filters, columns and sort order; record data is not stored or shared.')}</p>
    {(loadError || error || stale) && <p role="alert">{messages[loadError ? 'invalid' : error || 'conflict']}</p>}{notice && <p role="status">{{saved:t('Görünüm bu tarayıcıya kaydedildi.', 'View saved in this browser.'),deleted:t('Görünüm silindi.', 'View deleted.'),applied:t('Görünüm güncel kayıtlara uygulandı.', 'View applied to current records.')}[notice]}</p>}
    <div className="saved-view-fields"><label htmlFor={`${id}-select`}>{t('Görünüm seç', 'Select view')}</label><select id={`${id}-select`} disabled={loadError} value={selected} onChange={e => choose(e.target.value)}><option value="">{t('Yeni görünüm', 'New view')}</option>{selected && !row && <option value={selected}>{t('Görünüm kaldırılmış', 'View removed')}</option>}{views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <label htmlFor={`${id}-name`}>{t('Görünüm adı', 'View name')}</label><input id={`${id}-name`} maxLength={60} value={name} onChange={e => setName(e.target.value)}/></div>
    {row && <p>{row.query ? `${t('Arama', 'Search')}: ${row.query} · ` : ''}{Object.keys(row.filters).length} {t('filtre', 'filters')}{variant !== 'work' && <> · {row.columns.length} {t('sütun', 'columns')}</>} · {viewSortLabel(module,row.sort,lang)}</p>}
    {focused && <p>{t('Tek kayıt odağı kaydedilmez. Görünüm kaydetmek için önce tüm kayıtları gösterin.', 'Exact record focus cannot be saved. Show all records before saving a view.')}</p>}
    <div className="saved-view-actions"><button type="button" disabled={loadError || !row || stale} onClick={applyView}>{t('Uygula', 'Apply view')}</button><button type="button" disabled={loadError || focused || views.length >= 10} onClick={() => change('create')}>{t('Yeni görünüm kaydet', 'Save new view')}</button><button type="button" disabled={loadError || focused || !row || stale} onClick={() => change('replace')}>{t('Seçili görünümü güncelle', 'Replace selected view')}</button><button type="button" disabled={loadError || !row || stale} onClick={() => change('rename')}>{t('Adını değiştir', 'Rename view')}</button><button type="button" disabled={loadError || !row || stale} onClick={() => change('delete')}>{t('Görünümü sil', 'Delete view')}</button><button type="button" onClick={() => { window.dispatchEvent(new Event(eventName)); choose(''); }}>{t('Listeyi yeniden yükle', 'Reload views')}</button></div>
    <small>{views.length}/10</small>
  </div></details>;
}
