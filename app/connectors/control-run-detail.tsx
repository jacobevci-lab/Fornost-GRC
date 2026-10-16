"use client";

import { useEffect, useState } from 'react';
import { withBasePath } from '../base-path';
import { requestJsonWithDeadline } from '../bounded-json-request';
import { navigateToFornost } from '../navigation-focus';
import { assessmentReasons, controlTemplate, type ControlAssessment } from './control-templates';
import { validControlRun, validControlAssessment, type ControlRunRecord } from './control-run-contract';
import './control-run-detail.css';

type Props = { runId: string; expectedRuleId?: string; lang: 'tr' | 'en'; onNavigate?: () => void };
type State = { kind: 'loading' | 'unavailable' | 'missing' } | { kind: 'ready'; run: ControlRunRecord };
export default function ControlRunDetail(props: Props) {
  return <ControlRunDetailContent key={JSON.stringify([props.runId, props.expectedRuleId])} {...props}/>;
}
function ControlRunDetailContent({ runId, expectedRuleId, lang, onNavigate }: Props) {
  const tr = lang === 'tr', [state, setState] = useState<State>({kind:'loading'}), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    requestJsonWithDeadline(withBasePath(`/api/evidence-automation?runId=${encodeURIComponent(runId)}`), {cache:'no-store', signal:controller.signal}, fetch, 10_000)
      .then(({response, body}) => {
        if (controller.signal.aborted) return;
        if (response.status === 404) { setState({kind:'missing'}); return; }
        if (!response.ok || !validControlRun(body.run, runId, expectedRuleId)) throw new Error('unverified-run');
        setState({kind:'ready', run:body.run});
      })
      .catch(() => { if (!controller.signal.aborted) setState({kind:'unavailable'}); });
    return () => controller.abort();
  }, [runId, expectedRuleId, retry]);
  const reload = () => { setState({kind:'loading'}); setRetry(value => value + 1); };
  if (state.kind === 'loading') return <p className="ea-run-detail" role="status">{tr ? 'Sonuçlar yükleniyor…' : 'Loading results…'}</p>;
  if (state.kind !== 'ready') return <div className="ea-run-detail control-run-record" role="alert"><p>{state.kind === 'missing' ? (tr ? 'Seçili test çalışması bulunamadı veya artık erişilemiyor.' : 'The selected test run was not found or is no longer available.') : (tr ? 'Çalışma ayrıntıları doğrulanamadı. Yenileyerek tekrar deneyin.' : 'Run details could not be verified. Refresh to retry.')}</p><button type="button" onClick={reload}>{tr ? 'Yeniden dene' : 'Retry'}</button></div>;
  const run = state.run;
  const status = tr ? {pass:'Başarılı',fail:'Başarısız',error:'Doğrulanamadı'} : {pass:'Passed',fail:'Failed',error:'Unverified'};
  const trigger = ({manual:tr?'Manuel':'Manual',scheduled:tr?'Zamanlanmış':'Scheduled',scheduler:tr?'Zamanlanmış':'Scheduled'} as Record<string,string>)[run.triggerType] || run.triggerType || (tr?'Kaydedilmemiş':'Not recorded');
  return <section className="ea-run-detail control-run-record" data-run-id={run.id} data-rule-id={run.ruleId} aria-label={tr?'Kaydedilmiş test sonucu':'Recorded test result'}>
    <header><div><b>{run.ruleName || run.ruleId}</b><span className={`control-run-status ${run.status}`}>{status[run.status]}</span></div><button type="button" onClick={reload}>{tr?'Yenile':'Refresh'}</button></header>
    <p className="control-run-history-note">{tr?'Bu, seçili çalışmanın kaydedilmiş sonucudur; kontrolün güncel güvence değerlendirmesi değildir.':'This is the recorded result of the selected run; it is not a current assurance assessment of the control.'}</p>
    <dl><div><dt>{tr?'Çalışma kimliği':'Run ID'}</dt><dd>{run.id}</dd></div><div><dt>{tr?'Çalışma zamanı':'Run time'}</dt><dd><time dateTime={run.createdAt}>{new Intl.DateTimeFormat(tr?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(run.createdAt))}</time></dd></div><div><dt>{tr?'Kaynak':'Source'}</dt><dd>{run.sourceName || '—'}</dd></div><div><dt>{tr?'Tetikleyici':'Trigger'}</dt><dd>{trigger}</dd></div><div><dt>{tr?'Süre':'Duration'}</dt><dd>{run.durationMs} ms</dd></div>{run.errorCode&&<div><dt>{tr?'Hata kodu':'Error code'}</dt><dd>{run.errorCode}</dd></div>}</dl>
    {run.detail&&<p>{run.detail}</p>}
    {run.assessment ? <ControlAssessmentDetails result={run.assessment} ruleName={run.ruleName} lang={lang}/> : <p className="control-run-history-note">{tr?'Bu çalışma için kayıt bazında test ayrıntısı saklanmamış.':'Record-level test diagnostics were not stored for this run.'}</p>}
    <div className="control-run-evidence"><b>{tr?'Çalışmanın kanıtı':'Run evidence'}</b>{run.evidenceId&&<code>{run.evidenceId}</code>}
      {run.evidenceState==='available'?<><p>{tr?'Bağlı kanıt kaydı mevcut. Güncel onay, bütünlük ve geçerlilik durumunu kanıt kaydında inceleyin.':'The linked evidence record is available. Review its current approval, integrity and validity in the evidence record.'}</p><button type="button" onClick={()=>{onNavigate?.();navigateToFornost({module:'Kanıtlar',kind:'record',ref:run.evidenceId!,source:'control-run-result',filter:{evidenceRef:run.evidenceId!}});}}>{tr?'Kanıtı Aç':'Open Evidence'}</button></>:<p role="status">{run.evidenceState==='missing'?(tr?'Bağlı kanıt kaydı bulunamadı. Test geçmişi korunuyor; kanıtın mevcut olduğu doğrulanamadı.':'The linked evidence record was not found. Run history is preserved; evidence availability could not be confirmed.'):(tr?'Bu çalışma için kanıt kaydı oluşturulmamış.':'No evidence record was captured for this run.')}</p>}
    </div>
  </section>;
}

export function ControlAssessmentDetails({ result, ruleName, evidenceId, lang }: { result: ControlAssessment; ruleName: string; evidenceId?: string | null; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr';
  if (!validControlAssessment(result)) return <div className="ea-run-detail" role="alert">{tr?'Kaydedilmiş test ayrıntıları doğrulanamadı.':'Stored test diagnostics could not be verified.'}</div>;
  const template = controlTemplate(result.templateId);
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
