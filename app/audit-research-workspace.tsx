"use client";

import { useState, type ReactNode } from 'react';
import { WorkspaceTabs, type WorkspaceTab } from './workspace-tabs';
import { hasReportValue } from './report-export';

type Requirement = { id: string; data: Record<string, unknown> };
export function AuditResearchWorkspace({ lang, auditId, items, focusRequest, focusClosure = "", focusedRequirement, plan, requests, readiness, reports, closure, requirements, catalog, go }: {
  lang: 'tr' | 'en'; auditId: string; items: Requirement[]; focusRequest: string; focusClosure?: string; focusedRequirement: string;
  plan?: ReactNode; requests?: ReactNode; readiness?: ReactNode; reports?: ReactNode; closure?: ReactNode;
  requirements: ReactNode; catalog: ReactNode; go: (module: string) => void;
}) {
  const tr = lang === 'tr';
  const focus = focusClosure ? `closure:${focusClosure}` : focusedRequirement ? `requirement:${focusedRequirement}` : focusRequest ? `request:${focusRequest}` : '';
  const preferred = focusClosure ? 'closure' : focusedRequirement ? 'requirements' : focusRequest ? 'requests' : 'overview';
  const [view, setView] = useState({ tab: preferred, focus });
  // A deep link reveals the request while ordinary tab changes retain every draft.
  const active = focus && view.focus !== focus ? preferred : view.tab;
  const change = (tab: string) => setView({ tab, focus });
  const closed = items.filter(item => ['Kapatıldı', 'Kapalı', 'Tamamlandı'].includes(String(item.data.status))).length;
  const waiting = items.filter(item => item.data.evidenceStatus === 'Kanıt Bekleniyor').length;
  const unassigned = items.filter(item => !hasReportValue(item.data.owner)).length;
  const completed = items.length ? Math.round(closed * 100 / items.length) : null;
  const tabs: WorkspaceTab[] = [
    { key: 'overview', label: tr ? 'Genel bakış' : 'Overview', content: <div className="fw-audit-overview">
      <section className="fw-audit-progress">
        <div className="fw-section-heading"><div><small>{tr ? 'DENETİMİN BUGÜNÜ' : 'AUDIT AT A GLANCE'}</small><h3>{tr ? 'Kapsamdan kapanışa' : 'From scope to completion'}</h3></div>{auditId && <span className="fw-record-tag">{auditId}</span>}</div>
        <div className="fw-progress-value"><strong>{completed === null ? '—' : `${completed}%`}</strong><div><b>{tr ? 'Maddelerin kapanma oranı' : 'Requirement completion'}</b><p>{closed} / {items.length} {tr ? 'madde kapalı' : 'requirements closed'}</p></div></div>
        <div className="fw-progress-track" role="img" aria-label={tr ? `${closed} kapalı, ${items.length - closed} açık madde` : `${closed} closed, ${items.length - closed} open requirements`}><span style={{ width: `${completed || 0}%` }}/></div>
        <div className="fw-progress-legend"><span><i/>{tr ? 'Kapalı' : 'Closed'} · {closed}</span><span><i/>{tr ? 'Açık' : 'Open'} · {items.length - closed}</span></div>
        <p className="fw-muted">{tr ? 'Madde durumu, kanıt kabulü ve denetim görüşü ayrı değerlendirilir.' : 'Requirement status, evidence acceptance and the audit opinion are assessed separately.'}</p>
        <button className="fw-text-action" type="button" onClick={() => change('requirements')}>{tr ? 'Maddeleri ve testleri incele' : 'Review requirements and tests'} →</button>
      </section>
      <section className="fw-audit-next"><div className="fw-section-heading"><div><small>{tr ? 'SONRAKİ ADIM' : 'NEXT ACTION'}</small><h3>{tr ? 'İşi doğru yerden ilerletin' : 'Move the work forward'}</h3></div></div>
        {requests && <button type="button" onClick={() => change('requests')}><span className="fw-step">01</span><span><b>{tr ? 'Kanıt talepleri ve inceleme' : 'Evidence requests and review'}</b><small>{tr ? 'Teslim, iade ve kabul kararlarını yönetin.' : 'Manage submissions, returns and acceptance.'}</small></span><span aria-hidden="true">↗</span></button>}
        {plan && <button type="button" onClick={() => change('plan')}><span className="fw-step">02</span><span><b>{tr ? 'Plan, dönem ve ekip' : 'Plan, period and team'}</b><small>{tr ? 'Kapsamı ve beklenen çıktıları netleştirin.' : 'Define scope and expected deliverables.'}</small></span><span aria-hidden="true">↗</span></button>}
        {readiness && <button type="button" onClick={() => change('readiness')}><span className="fw-step">03</span><span><b>{tr ? 'Güvence ve hazırlık' : 'Assurance and readiness'}</b><small>{tr ? 'Eksik kaynakları ve hazırlık engellerini inceleyin.' : 'Review source gaps and readiness blockers.'}</small></span><span aria-hidden="true">↗</span></button>}
        {!requests && !plan && !readiness && <><p className="fw-muted">{tr ? "Aktif denetim bağlantısı eksik. Madde kayıtlarını inceleyebilir ve geçerli bir denetimle ilişkilendirebilirsiniz." : "The active audit link is missing. Review the requirement records and link them to an existing audit."}</p><button type="button" className="fw-text-action" onClick={() => change('requirements')}>{tr ? "Madde kayıtlarını incele" : "Review requirement records"} →</button></>}
      </section>
      <section className="fw-audit-signals"><div><strong>{waiting}</strong><b>{tr ? 'Kanıt bekleyen madde' : 'Requirements awaiting evidence'}</b><small>{tr ? 'Madde kayıtlarındaki kanıt durumuna göre' : 'Based on requirement evidence status'}</small></div><div><strong>{unassigned}</strong><b>{tr ? 'Sorumlusu atanmamış madde' : 'Unassigned requirements'}</b><small>{tr ? 'Görev dağılımında kontrol edin' : 'Review the assignment of work'}</small></div><button type="button" onClick={() => go('Bulgular ve CAPA')}><b>{tr ? 'Bulgular ve aksiyonlar' : 'Findings and actions'}</b><span>{tr ? 'Bulgu merkezini aç' : 'Open findings center'} ↗</span></button></section>
      {catalog}
    </div> },
    ...(requests ? [{ key: 'requests', label: tr ? 'Talepler ve inceleme' : 'Requests and review', content: requests }] : []),
    { key: 'requirements', label: tr ? 'Maddeler ve testler' : 'Requirements and tests', count: items.length, content: requirements },
    ...(plan ? [{ key: 'plan', label: tr ? 'Plan ve kapsam' : 'Plan and scope', content: plan }] : []),
    ...(readiness ? [{ key: 'readiness', label: tr ? 'Güvence' : 'Assurance', content: readiness }] : []),
    ...(closure ? [{ key: 'closure', label: tr ? 'Kapanış ve onay' : 'Closure and approval', content: closure }] : []),
    ...(reports ? [{ key: 'reports', label: tr ? 'Raporlar' : 'Reports', content: reports }] : []),
  ];
  return <section className="fw-audit-workspace" aria-label={tr ? 'Denetim çalışma alanı görünümleri' : 'Audit workspace views'}><WorkspaceTabs label={tr ? 'Denetim görünümleri' : 'Audit views'} items={tabs} active={active} onChange={change}/></section>;
}
