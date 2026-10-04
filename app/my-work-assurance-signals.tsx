"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import { controlAssuranceIssueLabel, controlAssuranceReasonLabels, controlAssuranceRecordTarget, type ControlAssuranceSnapshot } from './control-assurance-state';
import { buildWorkAssuranceActions, validWorkAssuranceSnapshot, type AssuranceAction, type WorkIdentity } from './my-work-assurance';
import { paginateWork } from './work-queue';
import './my-work-assurance-signals.css';

const labels = { control: ['Kritik kontroller', 'Critical controls'], audit: ['Denetim kanıt boşlukları', 'Audit evidence gaps'], evidence: ['Kanıt incelemesi', 'Evidence review'], finding: ['Bulgu / CAPA', 'Findings / CAPA'] } as const;
const reasons: Record<string, [string, string]> = {
  'audit-unmapped': ['Kontrol veya gereksinim bağlantısı eksik', 'Control or requirement mapping missing'],
  'evidence-review': ['Kanıt onayı veya doğrulaması gerekiyor', 'Evidence approval or verification needed'],
  'acceptance-review': ['Risk kabul süresi doğrulanmalı', 'Risk acceptance expiry needs review'],
  'acceptance-expired': ['Risk kabul süresi dolmuş', 'Risk acceptance expired'],
};
const title = (action: AssuranceAction) => String(action.row.data.controlTitle || action.row.data.requirementTitle || action.row.data.evidenceTitle || action.row.data.title || action.row.code || action.row.id);

export default function MyWorkAssuranceSignals({ lang, scope, user, refreshKey, identityAvailable }: {
  lang: 'tr' | 'en'; scope: 'mine' | 'organization'; user: WorkIdentity; refreshKey: number; identityAvailable: boolean;
}) {
  const tr = lang === 'tr', locale = tr ? 0 : 1;
  const [snapshot, setSnapshot] = useState<ControlAssuranceSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [group, setGroup] = useState<AssuranceAction['group']>('control'), [pagination, setPagination] = useState({ scope, index: 0 });
  const controller = useRef<AbortController | null>(null), request = useRef(0);
  const load = useCallback(async () => {
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    const id = ++request.current;
    setLoading(true); setError(false);
    const timeout = window.setTimeout(() => pending.abort(), 20000);
    try {
      const response = await fetch(withBasePath('/api/controls/assurance'), { cache: 'no-store', signal: pending.signal });
      if (!response.ok) throw new Error('Unavailable');
      const body: unknown = await response.json();
      if (!validWorkAssuranceSnapshot(body)) throw new Error('Invalid snapshot');
      if (request.current === id) { setSnapshot(body); setPagination(previous => ({ ...previous, index: 0 })); }
    } catch { if (request.current === id) setError(true); }
    finally { window.clearTimeout(timeout); if (request.current === id) setLoading(false); }
  }, []);
  const cancel = useCallback(() => { request.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (identityAvailable) void load(); }, 0);
    return () => { window.clearTimeout(timer); cancel(); };
  }, [load, cancel, refreshKey, identityAvailable, user.email, user.name]);
  const actions = useMemo(() => snapshot && identityAvailable ? buildWorkAssuranceActions(snapshot, user, scope) : [], [snapshot, user, scope, identityAvailable]);
  const groups = (Object.keys(labels) as AssuranceAction['group'][]).filter(key => actions.some(action => action.group === key));
  const selected = groups.includes(group) ? group : groups[0];
  const page = paginateWork(actions.filter(action => action.group === selected), pagination.scope === scope ? pagination.index : 0, 8);
  const reliable = identityAvailable && !!snapshot?.verified && !loading && !error;
  const reasonText = (reason: string) => reasons[reason]?.[locale] || controlAssuranceReasonLabels[reason]?.[lang] || reason;

  return <section className="mw-assurance-signals" aria-label={tr ? 'Güvence aksiyonları' : 'Assurance actions'} aria-busy={loading && identityAvailable}>
    <header><div><small>{tr ? 'GÜVENCE AKSİYONLARI' : 'ASSURANCE ACTIONS'}</small><b>{tr ? 'Neden dikkat gerekiyor?' : 'What needs attention and why?'}</b></div>
      <button type="button" disabled={loading || !identityAvailable} onClick={() => void load()}>{tr ? 'Güvenceyi yenile' : 'Refresh assurance'}</button></header>
    {!identityAvailable ? <p role="status">{tr ? 'Aksiyonlar için iş listesi ve kullanıcı bilgisi doğrulanmalıdır.' : 'Work list and user information must be verified before showing actions.'}</p>
      : loading ? <p role="status">{tr ? 'Güvence aksiyonları kontrol ediliyor…' : 'Checking assurance actions…'}</p>
      : error || !snapshot ? <p role="alert">{tr ? 'Güvence verisi yüklenemedi. Yenileyerek tekrar deneyin.' : 'Assurance data could not be loaded. Refresh to retry.'}</p>
      : !snapshot.verified ? <div className="mw-assurance-incomplete" role="alert"><p>{tr ? 'Değerlendirme eksik; aksiyon sayıları doğrulanamadı.' : 'Evaluation incomplete; action counts could not be verified.'}</p><ul>{snapshot.issues.map(issue => <li key={issue}>{controlAssuranceIssueLabel(issue, lang)}</li>)}</ul></div> : null}
    {reliable && (actions.length ? <>
      <div className="mw-assurance-groups">{groups.map(key => {
        const items = actions.filter(action => action.group === key);
        return <button type="button" key={key} aria-pressed={selected === key} className={items.some(item => item.critical) ? 'critical' : ''} onClick={() => { setGroup(key); setPagination({ scope, index: 0 }); }}>
          <strong>{items.length}</strong><span>{labels[key][locale]}</span></button>;
      })}</div>
      <div className="mw-assurance-records" aria-label={selected ? labels[selected][locale] : undefined}>
        {page.items.map(action => {
          const target = controlAssuranceRecordTarget(action.row);
          return <article key={`${action.group}:${action.row.id}`}><div><b>{title(action)}</b><small>{action.row.code || action.row.id} · {String(action.row.data.owner || '—')}</small><p>{action.reasons.map(reasonText).join(' · ')}</p></div>
            {target ? <button type="button" aria-label={`${tr ? 'Kaydı aç' : 'Open record'}: ${title(action)}`} onClick={() => navigateToFornost({ ...target, source: 'my-work-assurance' })}>{tr ? 'Kaydı aç' : 'Open record'} →</button> : <small>{tr ? 'Kayıt bağlantısı bulunamadı' : 'Record link unavailable'}</small>}</article>;
        })}
      </div>
      {page.pages > 1 && <nav className="mw-assurance-pagination" aria-label={tr ? 'Güvence aksiyon sayfaları' : 'Assurance action pages'}><button type="button" disabled={page.page === 0} onClick={() => setPagination({ scope, index: page.page - 1 })}>{tr ? 'Önceki' : 'Previous'}</button><span>{page.start}–{page.end} / {page.total}</span><button type="button" disabled={page.page + 1 >= page.pages} onClick={() => setPagination({ scope, index: page.page + 1 })}>{tr ? 'Sonraki' : 'Next'}</button></nav>}
    </> : <p role="status">{tr ? 'Bu kapsamda güvence aksiyonu bulunmadı.' : 'No assurance actions found in this scope.'}</p>)}
    {snapshot && identityAvailable && <footer>{tr ? 'Son değerlendirme' : 'Last evaluation'}: {new Date(snapshot.generatedAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}{!reliable ? (tr ? ' · Güncelliği doğrulanmadı' : ' · Freshness not verified') : ''}</footer>}
  </section>;
}
