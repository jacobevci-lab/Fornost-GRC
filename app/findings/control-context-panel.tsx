"use client";

import { useEffect, useState } from 'react';
import { withBasePath } from '../base-path';
import { navigateToFornost } from '../navigation-focus';
import { ControlAssessmentDetails } from '../connectors/control-run-detail';
import type { ContextRun, FindingControlContext } from './control-context';
import './control-context.css';

type Props = { findingId: string; lang: 'tr' | 'en'; close: () => void };
export default function FindingControlContextPanel(props: Props) {
  return <ControlContextContent key={props.findingId} {...props}/>;
}
function ControlContextContent({ findingId, lang, close }: Props) {
  const tr = lang === 'tr';
  const [context, setContext] = useState<FindingControlContext | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [active, setActive] = useState<'baseline' | 'latest'>('latest'), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let live = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10_000);
    fetch(withBasePath(`/api/findings/control-context?findingId=${encodeURIComponent(findingId)}`), { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('unavailable'); const body = await response.json(); if (!body.context) throw new Error('invalid'); if (live) setContext(body.context); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; controller.abort(); clearTimeout(timeout); };
  }, [findingId, retry]);
  const title = tr ? 'Kontrol testi ve kanıt' : 'Control test & evidence';
  const refresh = <button type="button" onClick={() => { setContext(null); setError(false); setExpanded(false); setActive('latest'); setRetry(value => value + 1); }}>{tr ? 'Yenile' : 'Refresh'}</button>;
  if (error) return <section className="finding-control-context" aria-label={title}><p role="alert">{tr ? 'Test bağlamı yüklenemedi. Bulgu kaydı değişmedi.' : 'Test context could not be loaded. The finding is unchanged.'}</p>{refresh}</section>;
  if (!context) return <section className="finding-control-context" aria-label={title}><p role="status">{tr ? 'Test bağlamı yükleniyor…' : 'Loading test context…'}</p></section>;
  if (context.state === 'not-applicable') return null;
  if (context.state !== 'available') return <section className="finding-control-context" aria-label={title}><h4>{title}</h4><p>{context.state === 'source-unavailable'
    ? (tr ? 'Kaynak kontrol veya otomasyon bulgusu artık bulunamıyor.' : 'The source control or automation finding is no longer available.')
    : (tr ? 'Bu CAPA için doğrulanabilir aktarım bağlantısı bulunamadı. Başka bir bulgunun testi gösterilmiyor.' : 'Verified promotion lineage is unavailable for this CAPA. No other finding’s test is substituted.')}</p>{refresh}</section>;
  const selected = context[active];
  const status = (run: ContextRun) => run.status === 'pass' ? (tr ? 'Başarılı' : 'Passed') : run.status === 'fail' ? (tr ? 'Başarısız' : 'Failed') : (tr ? 'Doğrulanamadı' : 'Unverified');
  const stamp = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(tr ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const freshness = { fresh: tr ? 'Güncel kanıt' : 'Fresh evidence', expiring: tr ? 'Kanıtın süresi yaklaşıyor' : 'Evidence nearing expiry', stale: tr ? 'Kanıt güncel değil' : 'Evidence is stale', missing: tr ? 'Son testte kanıt üretilmedi' : 'No evidence from latest test', unknown: tr ? 'Kanıt tarihi doğrulanamadı' : 'Evidence date unverified' }[context.freshness];
  return <section className="finding-control-context" aria-label={title}>
    <div className="fcc-heading"><div><h4>{title}</h4><p>{context.rule.name} · {tr ? 'Tekrar' : 'Occurrences'}: {context.automationFinding.occurrenceCount}</p></div>{refresh}</div>
    <p className="fcc-note">{tr ? 'Başarılı bir test CAPA’yı kapatmaz. Kapatma için bağımsız kanıt doğrulaması gerekir.' : 'A passing test does not close CAPA. Closure requires independent evidence verification.'}</p>
    <div className="fcc-runs" role="group" aria-label={tr ? 'Karşılaştırılacak test' : 'Test to inspect'}>
      {(['baseline', 'latest'] as const).map(key => {
        const item = context[key];
        return <button type="button" className="fcc-run" key={key} aria-pressed={active === key} onClick={() => { setActive(key); setExpanded(false); }}>
          <strong>{key === 'baseline' ? (tr ? 'CAPA aktarımındaki test' : 'Test used for CAPA promotion') : (tr ? 'Son kontrol testi' : 'Latest control test')}</strong>
          {item ? <><span className={`fcc-status ${item.status}`}>{status(item)}</span><time dateTime={item.createdAt}>{stamp(item.createdAt)}</time>
            {item.assessment && <span>{item.assessment.failed} {tr ? 'başarısız' : 'failed'} · {item.assessment.unknown} {tr ? 'doğrulanamayan' : 'unverified'} / {item.assessment.total}</span>}</>
            : <span>{tr ? 'Test kaydı bulunamadı' : 'Test record unavailable'}</span>}
        </button>;
      })}
    </div>
    <div className="fcc-health"><span>{freshness}</span>{!context.rule.enabled && <strong>{tr ? 'Kontrol duraklatılmış' : 'Control paused'}</strong>}</div>
    {selected ? <div className="fcc-selected">
      <p>{selected.detail}</p>
      {selected.status === 'error' && <p className="fcc-note">{tr ? 'Bu sonuç kontrolün uygun olduğunu kanıtlamaz. Veri toplama veya değerlendirme tamamlanamadı.' : 'This result does not prove compliance. Collection or assessment could not be completed.'}{selected.errorCode && <> <code>{selected.errorCode}</code></>}</p>}
      <div className="fcc-actions">
        {selected.assessment && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? (tr ? 'Ayrıntıları gizle' : 'Hide affected records') : (tr ? 'Etkilenen kayıtları göster' : 'Show affected records')}</button>}
        {selected.evidenceId && <button type="button" onClick={() => { close(); navigateToFornost({ module: 'Kanıtlar', ref: selected.evidenceId!, kind: 'evidence', source: 'capa-control-context' }); }}>{tr ? 'Kanıtı aç' : 'Open evidence'}</button>}
      </div>
      {selected.diagnostics !== 'available' && <p className="fcc-muted">{selected.diagnostics === 'legacy' ? (tr ? 'Bu testte kayıt bazında tanılama yok.' : 'Per-record diagnostics are not available for this test.') : (tr ? 'Kaydedilmiş tanılama verisi okunamadı.' : 'Stored diagnostics could not be read.')}</p>}
      {expanded && selected.assessment && <ControlAssessmentDetails result={selected.assessment} ruleName={selected.ruleName} lang={lang}/>}
    </div> : <p>{tr ? 'Seçilen testin kayıt veya kanıt özeti bulunamadı.' : 'The selected test record or evidence summary is unavailable.'}</p>}
  </section>;
}
