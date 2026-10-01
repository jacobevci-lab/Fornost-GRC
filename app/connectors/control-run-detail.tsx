"use client";

import { useEffect, useState } from 'react';
import { withBasePath } from '../base-path';
import { assessmentReasons, controlTemplate, type ControlAssessment } from './control-templates';

type Run = { id: string; ruleName: string; status: string; detail: string; evidenceId?: string; assessment: ControlAssessment | null };
export default function ControlRunDetail(props: { runId: string; lang: 'tr' | 'en' }) {
  return <ControlRunDetailContent key={props.runId} {...props}/>;
}
function ControlRunDetailContent({ runId, lang }: { runId: string; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr', [run, setRun] = useState<Run | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(withBasePath(`/api/evidence-automation?runId=${encodeURIComponent(runId)}`), { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      .then(async response => { if (!response.ok) throw new Error('unavailable'); const data = await response.json(); if (!data.run) throw new Error('invalid'); if (live) setRun(data.run); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [runId, retry]);
  if (error) return <div className="ea-run-detail" role="alert"><p>{tr ? 'Çalışma ayrıntıları alınamadı.' : 'Run details could not be loaded.'}</p><button className="ghost" onClick={() => { setError(false); setRetry(retry + 1); }}>{tr ? 'Yeniden dene' : 'Retry'}</button></div>;
  if (!run) return <p className="ea-run-detail" role="status">{tr ? 'Sonuçlar yükleniyor…' : 'Loading results…'}</p>;
  if (!run.assessment) return <div className="ea-run-detail"><p>{run.detail}</p></div>;
  return <ControlAssessmentDetails result={run.assessment} ruleName={run.ruleName} evidenceId={run.evidenceId} lang={lang}/>;
}

export function ControlAssessmentDetails({ result, ruleName, evidenceId, lang }: { result: ControlAssessment; ruleName: string; evidenceId?: string | null; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr', template = controlTemplate(result.templateId);
  return <div className="ea-run-detail">
    <p><b>{ruleName}</b> · {tr ? 'Test sürümü' : 'Test version'} {result.templateVersion}</p>
    <p>{tr ? 'Bağlantı hesabının görebildiği kayıtlar değerlendirilmiştir; tüm kurum kapsamını veya sertifikasyon uygunluğunu kanıtlamaz.' : 'Only records visible to the connection account were evaluated; this does not prove organisation-wide coverage or certification compliance.'}</p>
    <div className="ea-assessment-counts">{[result.total, result.passed, result.failed, result.unknown].map((value, i) => <div key={i}><b>{value}</b><span>{(tr ? ['Toplam', 'Uygun', 'Başarısız', 'Doğrulanamayan'] : ['Total', 'Passed', 'Failed', 'Unverified'])[i]}</span></div>)}</div>
    <p>{template?.remediation[lang]}</p>
    {result.issuesTruncated && <p role="status">{tr ? 'Tüm kayıtlar sayıldı; ilk 100 sorunlu kayıt gösteriliyor.' : 'All records were counted; showing the first 100 affected records.'}</p>}
    {result.issues.length ? <div className="ea-table"><div className="table-wrap"><table><thead><tr><th>{tr ? 'Kayıt' : 'Record'}</th><th>{tr ? 'Sonuç' : 'Result'}</th><th>{tr ? 'Neden' : 'Reason'}</th></tr></thead><tbody>{result.issues.map((item, i) => <tr key={i}><td><b>{item.name || '—'}</b>{item.id && item.id !== item.name && <small>{item.id}</small>}</td><td>{item.status === 'fail' ? (tr ? 'Başarısız' : 'Failed') : (tr ? 'Doğrulanamadı' : 'Unverified')}</td><td>{assessmentReasons[item.reason]?.[lang] || item.reason}</td></tr>)}</tbody></table></div></div> : <p>{tr ? 'Değerlendirilen kayıtlarda bu test için sorun bulunmadı.' : 'No issues were found for this test in the evaluated records.'}</p>}
    {evidenceId && <p>{tr ? 'Kanıt referansı' : 'Evidence reference'}: <code>{evidenceId}</code></p>}
  </div>;
}
