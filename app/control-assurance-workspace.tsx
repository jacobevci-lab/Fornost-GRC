"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildControlAssurance, buildControlAssuranceDetail, type AssuranceRow } from './control-assurance';
import { controlAssuranceIssueLabel, controlAssuranceReasonLabels, controlAssuranceRecordTarget, type ControlAssuranceSnapshot } from './control-assurance-state';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import { evaluateEvidenceEligibility } from './evidence/eligibility';
import ControlImpactLens from './control-impact-lens';
import './control-assurance.css';

const text = (value: unknown) => String(value ?? '').normalize('NFKC').trim();
const title = (row: AssuranceRow) => text(row.data.controlTitle || row.data.requirementTitle || row.data.evidenceTitle || row.data.riskTitle || row.data.riskName || row.data.title || row.data.name || row.data.framework || row.code || row.id);
const reference = (row: AssuranceRow) => text(row.code || row.data.controlRef || row.data.requirementRef || row.id);

export default function ControlAssuranceWorkspace({ rows, lang, go }: { rows: AssuranceRow[]; lang: 'tr' | 'en'; go: (module: string) => void }) {
  const tr = lang === 'tr';
  const [snapshot, setSnapshot] = useState<ControlAssuranceSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState(''), [search, setSearch] = useState('');
  const [filter, setFilter] = useState('attention'), [page, setPage] = useState(0);
  const controller = useRef<AbortController | null>(null), request = useRef(0);
  const detailRef = useRef<HTMLElement | null>(null);
  // Content changes trigger evaluation; parent re-renders do not create reload loops.
  const recordsKey = JSON.stringify(rows);
  const load = useCallback(async () => {
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    const id = ++request.current;
    setLoading(true); setError(false);
    const timeout = window.setTimeout(() => pending.abort(), 20000);
    try {
      const response = await fetch(withBasePath('/api/controls/assurance'), { cache: 'no-store', signal: pending.signal });
      if (!response.ok) throw new Error('Unavailable');
      const body = await response.json() as ControlAssuranceSnapshot;
      if (!Array.isArray(body.rows) || !Array.isArray(body.issues) || typeof body.verified !== 'boolean' || !Number.isFinite(Date.parse(body.generatedAt))) throw new Error('Invalid evaluation');
      if (request.current === id) setSnapshot(body);
    } catch { if (request.current === id) setError(true); }
    finally { window.clearTimeout(timeout); if (request.current === id) setLoading(false); }
  }, []);
  const cancel = useCallback(() => { request.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 300000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); cancel(); };
  }, [load, cancel, recordsKey]);
  const summary = useMemo(() => snapshot ? buildControlAssurance(snapshot.rows, snapshot.generatedAt) : null, [snapshot]);
  const reliable = !!snapshot?.verified && !loading && !error;
  const matches = (summary?.items || []).filter(item => (filter === 'all' || (filter === 'attention' ? item.state !== 'healthy' : item.state === filter))
    && `${item.reference} ${item.title} ${item.owner}`.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en').includes(search.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en')));
  const pages = Math.max(1, Math.ceil(matches.length / 8)), currentPage = Math.min(page, pages - 1), queue = matches.slice(currentPage * 8, currentPage * 8 + 8);
  const detail = useMemo(() => snapshot && selectedId ? buildControlAssuranceDetail(snapshot.rows, selectedId, snapshot.generatedAt) : null, [snapshot, selectedId]);
  const stateLabel = (state: string) => state === 'healthy' ? (tr ? 'Güçlü' : 'Healthy') : state === 'critical' ? (tr ? 'Kritik' : 'Critical') : state === 'unverified' ? (tr ? 'Doğrulanamadı' : 'Unverified') : (tr ? 'Aksiyon gerekli' : 'Action required');
  const reasonLabel = (reason: string) => controlAssuranceReasonLabels[reason]?.[lang] || reason;
  const stages = detail ? [
    { key: 'evidence', label: tr ? 'Kanıtlar' : 'Evidence', rows: detail.evidence },
    { key: 'automation', label: tr ? 'Otomasyon' : 'Automation', rows: detail.automations.filter(row => row.data.kind !== 'automation-assurance' && row.data.kind !== 'automation-remediation') },
    { key: 'framework', label: 'Framework', rows: detail.frameworks },
    { key: 'audit', label: tr ? 'Denetim gereksinimleri' : 'Audit requirements', rows: detail.audits },
    { key: 'finding', label: tr ? 'Açık bulgular ve CAPA' : 'Open findings and CAPA', rows: detail.findings },
    { key: 'risk', label: tr ? 'Riskler' : 'Risks', rows: detail.risks },
  ] : [];
  const openRow = (row: AssuranceRow) => { const target = controlAssuranceRecordTarget(row); if (target) navigateToFornost(target); };
  const select = (id: string) => { setSelectedId(id); window.requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: false })); };
  const showScore = reliable && summary && !summary.unverified;
  return <section className="control-assurance-workspace" aria-label={tr ? 'Kontrol güvencesi' : 'Control assurance'} aria-busy={loading}>
    <header>
      <div><small>{tr ? 'KONTROL GÜVENCESİ' : 'CONTROL ASSURANCE'}</small><h3>{tr ? 'Hangi kontrol aksiyon bekliyor?' : 'Which control needs attention?'}</h3><p>{tr ? 'Kanıt, test ve bulgu durumunu inceleyin; ilgili kayda geçin.' : 'Review evidence, test and finding status, then open the relevant record.'}</p></div>
      <div className="control-assurance-header-actions"><button type="button" disabled={loading} onClick={() => void load()}>{loading ? (tr ? 'Kontrol ediliyor…' : 'Checking…') : (tr ? 'Güvenceyi yenile' : 'Refresh assurance')}</button><button type="button" onClick={() => go('Bağlantılı GRC')}>{tr ? 'GRC haritası' : 'GRC map'}</button></div>
    </header>
    <div className="control-assurance-evaluation" role="status">{loading ? (tr ? 'Güncel kaynaklar değerlendiriliyor.' : 'Evaluating current sources.') : snapshot ? `${tr ? 'Değerlendirme' : 'Evaluated'}: ${new Date(snapshot.generatedAt).toLocaleString(tr ? 'tr-TR' : 'en-GB')}${!reliable ? (tr ? ' · Sonuç doğrulanamadı' : ' · Result unverified') : ''}` : (tr ? 'Henüz değerlendirilmedi.' : 'Not evaluated yet.')}</div>
    {error && <div className="control-assurance-notice" role="alert">{tr ? 'Kontrol güvencesi yüklenemedi. Yeniden deneyin; önceki veriler güncel sonuç olarak gösterilmiyor.' : 'Control assurance could not be loaded. Retry; previous data is not shown as a current result.'}</div>}
    {!loading && !error && snapshot && !snapshot.verified && <div className="control-assurance-notice" role="alert"><b>{tr ? 'Değerlendirme tamamlanamadı.' : 'Evaluation could not be completed.'}</b><ul>{snapshot.issues.map(issue => <li key={issue}>{controlAssuranceIssueLabel(issue, lang)}</li>)}</ul></div>}
    <div className="control-assurance-kpis">
      <article><small>{tr ? 'Güvence skoru' : 'Assurance score'}</small><strong>{showScore ? summary.score : '—'}</strong><span>{tr ? 'Portföy ortalaması /100' : 'Portfolio average /100'}</span></article>
      <article><small>{tr ? 'Güçlü kontroller' : 'Healthy controls'}</small><strong>{reliable ? `${summary!.healthy}/${summary!.total}` : '—'}</strong><span>{tr ? 'Skor ≥80, engelleyici sinyal yok' : 'Score ≥80, no blocking signal'}</span></article>
      <article><small>{tr ? 'Güncel güvence' : 'Current assurance'}</small><strong>{reliable ? `${summary!.currentEvidence}/${summary!.total}` : '—'}</strong><span>{tr ? 'Geçerli kanıt veya otomasyon' : 'Eligible evidence or automation'}</span></article>
      <article><small>{tr ? 'Başarısız / gecikmiş test' : 'Failed / overdue tests'}</small><strong>{reliable ? `${summary!.failedTests} / ${summary!.overdueTests}` : '—'}</strong><span>{tr ? 'Planlı kontrol testleri' : 'Scheduled control tests'}</span></article>
      <article><small>{tr ? 'Kanıt bütünlüğü' : 'Evidence integrity'}</small><strong>{reliable ? `${summary!.integrityFailures} / ${summary!.unverified}` : '—'}</strong><span>{tr ? 'Bozuk / doğrulanamayan kontrol' : 'Broken / unverified controls'}</span></article>
    </div>
    {snapshot && <div className="control-assurance-queue">
      <div className="control-assurance-toolbar">
        <label><span>{tr ? 'Kontrol ara' : 'Search controls'}</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder={tr ? 'Kod, başlık veya sahip' : 'Code, title or owner'} /></label>
        <label><span>{tr ? 'Görünüm' : 'View'}</span><select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="attention">{tr ? 'Aksiyon bekleyenler' : 'Needs attention'}</option><option value="all">{tr ? 'Tüm kontroller' : 'All controls'}</option><option value="healthy">{tr ? 'Güçlü kontroller' : 'Healthy controls'}</option><option value="unverified">{tr ? 'Doğrulanamayanlar' : 'Unverified'}</option></select></label>
      </div>
      {!reliable && <p className="control-assurance-muted">{tr ? 'Aşağıdaki kayıtlar son yüklenen değerlendirmeye aittir.' : 'The records below belong to the last loaded evaluation.'}</p>}
      <div className="control-assurance-list">{queue.map(item => <article key={item.control.id} className={selectedId === item.control.id ? 'selected' : ''}>
        <div className="control-assurance-copy"><b>{item.reference}</b><h4>{item.title}</h4><p>{item.owner || (tr ? 'Sahip atanmamış' : 'Owner unassigned')}</p></div>
        <div className="control-assurance-list-state"><span className={`assurance-state ${reliable ? item.state : 'unverified'}`}>{stateLabel(reliable ? item.state : 'unverified')}</span><small>{reliable && item.state !== 'unverified' ? `${item.score}/100` : '—'}</small></div>
        <p className="control-assurance-primary-reason">{reliable ? reasonLabel(item.reasons[0] || '') : (tr ? 'Güncel sonuç bekleniyor' : 'Awaiting current result')}</p>
        <button type="button" aria-label={`${tr ? 'İncele' : 'Review'} ${item.reference}`} onClick={() => select(item.control.id)}>{tr ? 'İncele' : 'Review'} →</button>
      </article>)}</div>
      {!queue.length && <div className="control-assurance-empty">{!summary?.total ? (tr ? 'Henüz kontrol kaydı yok.' : 'No control records yet.') : search || filter !== 'attention' ? (tr ? 'Filtreye uygun kontrol yok.' : 'No controls match this filter.') : reliable ? (tr ? 'Aksiyon bekleyen kontrol yok. Tüm kontroller görünümünden kayıtları inceleyebilirsiniz.' : 'No controls need attention. Use All controls to review records.') : (tr ? 'Güncel güvence sonucu doğrulanamadı.' : 'Current assurance could not be verified.')}</div>}
      <div className="control-assurance-pagination"><span>{matches.length} {tr ? 'kontrol' : 'controls'} · {currentPage + 1}/{pages}</span><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{tr ? 'Önceki' : 'Previous'}</button><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{tr ? 'Sonraki' : 'Next'}</button></div>
    </div>}
    {detail && <section key={detail.item.control.id} ref={detailRef} tabIndex={-1} className="control-assurance-drilldown" aria-label={tr ? 'Kontrol güvence ayrıntısı' : 'Control assurance detail'}>
      <div className="control-assurance-detail-head"><div><b>{detail.item.reference}</b><h4>{detail.item.title}</h4></div><button type="button" onClick={() => openRow(detail.item.control)}>{tr ? 'Kontrol kaydını aç' : 'Open control record'}</button><button type="button" onClick={() => setSelectedId('')}>{tr ? 'Kapat' : 'Close'}</button></div>
      <ControlImpactLens detail={detail} lang={lang} />
      <div className="control-assurance-test"><span>{tr ? 'Test sahibi' : 'Test owner'}: <b>{detail.test.owner || '—'}</b></span><span>{tr ? 'Sonraki test' : 'Next test'}: <b>{detail.test.nextTestDate || '—'}</b></span><span>{tr ? 'Son test sonucu' : 'Last test result'}: <b>{detail.test.result || '—'}</b></span></div>
      {!!detail.item.reasons.length && <ul className="control-assurance-reasons">{detail.item.reasons.map(reason => <li key={reason}>{reasonLabel(reason)}</li>)}</ul>}
      <div className="control-assurance-stages">{stages.map(stage => <details key={stage.key} className="control-assurance-stage"><summary>{stage.label}<span>{stage.rows.length}</span></summary><div className="control-assurance-stage-records">{stage.rows.map(row => {
        const target = controlAssuranceRecordTarget(row), eligible = row.module === 'Kanıtlar' ? evaluateEvidenceEligibility(row.data, new Date(snapshot!.generatedAt)).current : null;
        return <article key={row.id}><div><b>{reference(row)}</b><span>{title(row)}</span><small>{eligible === null ? text(row.data.status || row.data.automationHealth || row.data.owner) : `${eligible ? (tr ? 'Güncel kanıt' : 'Current evidence') : (tr ? 'Kullanılabilirliği doğrulanmadı' : 'Eligibility not established')} · ${text(row.data.evidenceIntegrity)}`}</small></div>{target && <button type="button" onClick={() => openRow(row)} aria-label={`${tr ? 'Kaydı aç' : 'Open record'} ${reference(row)}`}>{tr ? 'Kaydı aç' : 'Open record'} →</button>}</article>;
      })}{!stage.rows.length && <p className="control-assurance-muted">{tr ? 'Bağlı kayıt yok.' : 'No linked records.'}</p>}</div></details>)}</div>
      {!!detail.unresolved.length && <details className="control-assurance-unresolved"><summary>{tr ? 'Çözümlenemeyen bağlantılar' : 'Unresolved references'} ({detail.unresolved.length})</summary><ul>{detail.unresolved.map((gap, i) => <li key={i}>{gap.field}: {gap.value}</li>)}</ul></details>}
    </section>}
  </section>;
}
