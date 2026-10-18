'use client';
import { useEffect, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import type { RecordSearchPage, RecordSearchResult } from './record-search-store';
import NavIcon from './nav-icon';
import './record-search.css';

type Props = { lang: 'tr' | 'en'; modules: string[]; names: Record<string, string>; open: (result: RecordSearchResult) => void; close: () => void };
export function RecordSearch({ lang, modules, names, open, close }: Props) {
  const tr = lang === 'tr', [query, setQuery] = useState(''), [module, setModule] = useState('');
  const [cursor, setCursor] = useState<string | null>(null), [attempt, setAttempt] = useState(0), [index, setIndex] = useState(0);
  const [state, setState] = useState<{ signature: string; page: RecordSearchPage; pending: boolean; error: boolean } | null>(null);
  const signature = JSON.stringify([query.trim(), module]), valid = query.trim().length >= 2 && query.trim().length <= 120;
  const current = state?.signature === signature ? state : null;
  const results = current?.page.results || [], pending = valid && (!current || current.pending);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const debounce = setTimeout(async () => {
      setState(previous => ({ signature, page: cursor && previous?.signature === signature ? previous.page : { results: [], nextCursor: null }, pending: true, error: false }));
      timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (module) params.set('module', module);
        if (cursor) params.set('cursor', cursor);
        const response = await fetch(withBasePath(`/api/search?${params}`), { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Search failed');
        const page = await response.json() as RecordSearchPage;
        if (!Array.isArray(page.results) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new Error('Invalid search response');
        if (!cancelled) setState(previous => {
          const prior = cursor && previous?.signature === signature ? previous.page.results : [];
          const merged = [...new Map([...prior, ...page.results].map(result => [result.id, result])).values()];
          return { signature, page: { ...page, results: merged }, pending: false, error: false };
        });
      } catch {
        if (!cancelled) setState(previous => ({ signature, page: cursor && previous?.signature === signature ? previous.page : { results: [], nextCursor: null }, pending: false, error: true }));
      } finally { clearTimeout(timeout); }
    }, 250);
    return () => { cancelled = true; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [signature, query, module, valid, cursor, attempt]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  function changed() { setCursor(null); setIndex(0); }
  return <>
    <header>
      <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5" /><path d="m13 13 4 4" /></svg>
      <input ref={input} autoFocus value={query} maxLength={120} role="combobox" aria-expanded="true" aria-controls="record-search-results" aria-autocomplete="list"
        aria-activedescendant={results[index] ? `record-search-${index}` : undefined}
        aria-label={tr ? 'Kayıt ara' : 'Find a record'} placeholder={tr ? 'Kayıt kodu, başlık veya sorumlu…' : 'Record code, title or owner…'}
        onChange={event => { setQuery(event.target.value); changed(); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(0, Math.min(results.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))); }
          if (event.key === 'Enter' && results[index]) { event.preventDefault(); open(results[index]); }
        }} />
      <button type="button" data-escape-close onClick={close} aria-label={tr ? 'Kapat' : 'Close'}><kbd>ESC</kbd></button>
    </header>
    <div className="record-search-scope">
      <label>{tr ? 'Kapsam' : 'Scope'} <select value={module} onChange={event => { setModule(event.target.value); changed(); }}>
        <option value="">{tr ? 'Erişebildiğim GRC kayıtları' : 'My accessible GRC records'}</option>
        {modules.map(value => <option key={value} value={value}>{names[value]}</option>)}
      </select></label>
      <small>{tr ? 'Risk, BIA, varlık, uyum, tedarikçi, kontrol, kanıt ve denetim maddelerinde arar.' : 'Searches risks, BIA, assets, compliance, vendors, controls, evidence and audit requirements.'}</small>
    </div>
    <div className="command-results" ref={list} id="record-search-results" role="listbox" aria-label={tr ? 'Kayıt sonuçları' : 'Record results'} aria-busy={pending}>
      {results.map((result, i) => <button key={result.id} id={`record-search-${i}`} type="button" role="option" aria-selected={i === index} className={i === index ? 'selected' : ''}
        onMouseEnter={() => setIndex(i)} onFocus={() => setIndex(i)} onClick={() => open(result)}>
        <i><NavIcon module={result.module} /></i><span><b>{result.title}</b><small>{result.code} · {names[result.module]}{result.owner ? ` · ${result.owner}` : ''}</small></span>
      </button>)}
    </div>
    <div className="record-search-feedback" aria-live="polite">
      {!valid && <p>{tr ? 'Aramaya başlamak için en az 2 karakter yazın.' : 'Enter at least 2 characters to search.'}</p>}
      {pending && <p role="status">{tr ? 'Kayıtlar aranıyor…' : 'Searching records…'}</p>}
      {current?.error && <div role="alert"><p>{tr ? 'Arama tamamlanamadı. Sonuçlar eksik olabilir.' : 'Search could not complete. Results may be incomplete.'}</p><button type="button" onClick={() => setAttempt(n => n + 1)}>{tr ? 'Tekrar dene' : 'Retry'}</button></div>}
      {valid && current && !pending && !current.error && !results.length && <p>{tr ? 'Erişebildiğiniz kayıtlarda eşleşme bulunamadı.' : 'No matching accessible records.'}</p>}
      {current?.page.nextCursor && !current.error && <button type="button" disabled={pending} onClick={() => { setCursor(current.page.nextCursor); input.current?.focus(); }}>{tr ? 'Daha fazla sonuç' : 'Load more results'}</button>}
    </div>
  </>;
}
