"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import { parseRecordLink, recordLinkFragment, recordLinkNavigation, recordLinkTarget, type RecordLinkTarget } from './record-links';
export function CopyRecordLink({ target, lang }: { target: RecordLinkTarget; lang: string }) {
  const [state, setState] = useState(''), [fallback, setFallback] = useState('');
  const tr = lang === 'tr';
  async function copy() {
    const url = new URL(withBasePath('/'), window.location.origin); url.hash = recordLinkFragment(target);
    try { await navigator.clipboard.writeText(url.href); setFallback(''); setState(tr ? 'Bağlantı kopyalandı.' : 'Link copied.'); }
    catch { setFallback(url.href); setState(tr ? 'Bağlantıyı aşağıdan kopyalayın.' : 'Copy the link below.'); }
  }
  if (!recordLinkTarget(target)) return null;
  return <span className="record-link-copy"><button type="button" onClick={() => void copy()}>{tr ? 'Kayıt bağlantısını kopyala' : 'Copy record link'}</button>{state && <small role="status">{state}</small>}{fallback && <input aria-label={tr ? 'Kayıt bağlantısı' : 'Record link'} readOnly value={fallback} onFocus={e => e.target.select()} />}</span>;
}
export function RecordLinkEntry({ ready, lang, scoped }: { ready: boolean; lang: string; scoped: boolean }) {
  const [state, setState] = useState(''), controller = useRef<AbortController | null>(null), ticket = useRef(0);
  const resolve = useCallback(async () => {
    const generation = ++ticket.current; controller.current?.abort();
    const hash = window.location.hash; if (!hash.startsWith('#fornost-record')) { setState(''); return; }
    const target = parseRecordLink(hash);
    if (!target) { setState('invalid'); return; }
    const pending = new AbortController(); controller.current = pending;
    const timeout = window.setTimeout(() => pending.abort(), 20000); setState('loading');
    try {
      const response = await fetch(withBasePath('/api/record-links?') + new URLSearchParams(target), { cache: 'no-store', signal: pending.signal });
      const data = await response.json(); if (generation !== ticket.current) return;
      if (!response.ok) { setState(response.status === 404 || response.status === 403 ? 'unavailable' : 'retry'); return; }
      if (JSON.stringify(recordLinkTarget(data.target)) !== JSON.stringify(target)) { setState('retry'); return; }
      if (!navigateToFornost(recordLinkNavigation(target, scoped))) { setState('unavailable'); return; }
      // Navigation focus now owns the target; successful links do not replay on reload or sign-out.
      history.replaceState(history.state, '', location.pathname + location.search); setState('');
    } catch { if (generation === ticket.current) setState('retry'); }
    finally { window.clearTimeout(timeout); }
  }, [scoped]);
  const invalidate = useCallback(() => { ticket.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void resolve(), 0), onHash = () => { void resolve(); };
    window.addEventListener('hashchange', onHash);
    return () => { window.clearTimeout(timer); window.removeEventListener('hashchange', onHash); invalidate(); };
  }, [ready, resolve, invalidate]);
  if (!state) return null;
  const tr = lang === 'tr';
  const text = state === 'loading' ? (tr ? 'Bağlantıdaki kayıt doğrulanıyor…' : 'Verifying linked record…') : state === 'invalid' ? (tr ? 'Kayıt bağlantısı geçersiz.' : 'Invalid record link.') : state === 'unavailable' ? (tr ? 'Kayıt bulunamadı veya bu kayda erişiminiz yok.' : 'Record not found or access is unavailable.') : (tr ? 'Kayıt doğrulanamadı. Tekrar deneyin.' : 'The record could not be verified. Try again.');
  return <section className="core-record-focus record-link-entry" role={state === 'loading' ? 'status' : 'alert'}><p>{text}</p>{state === 'retry' && <button onClick={() => void resolve()}>{tr ? 'Yeniden dene' : 'Retry'}</button>}<button onClick={() => { ticket.current++; controller.current?.abort(); history.replaceState(history.state, '', location.pathname + location.search); setState(''); }}>{tr ? 'Kapat' : 'Dismiss'}</button></section>;
}
