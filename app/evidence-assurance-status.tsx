import type { useExecutiveAssurance } from './use-executive-assurance';
import { navigateToFornost } from './navigation-focus';

export default function EvidenceAssuranceStatus({ state, lang }: { state: ReturnType<typeof useExecutiveAssurance>; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr';
  return <div className="evidence-assurance-status" role="status" data-state={state.loading ? 'loading' : state.ready ? 'ready' : 'unavailable'}>
    <div className="evidence-assurance-copy">
    <strong>{state.loading ? (tr ? 'Değerlendirme sürüyor' : 'Assessment in progress') : state.ready ? (tr ? 'Güvence değerlendirmesi güncel' : 'Assurance assessment is current') : (tr ? 'Güvence değerlendirmesi için işlem gerekiyor' : 'Assurance assessment needs attention')}</strong>
    <span>{state.loading ? (tr ? 'Kanıt ve denetim hazırlığı değerlendiriliyor…' : 'Assessing evidence and audit readiness…') : state.ready
      ? <>{tr ? 'Güvence değerlendirmesi: ' : 'Assurance evaluated: '}<time dateTime={state.generatedAt}>{new Date(state.generatedAt!).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</time></>
      : state.evidenceReady
        ? (tr ? 'Kanıt ve kontrol değerlendirmesi kullanılabilir. Denetim kapsamı doğrulanana kadar bütünleşik skor ve genel güvence paketi kapalıdır.' : 'Evidence and control assessment is available. The composite score and general assurance pack remain unavailable until audit scope is verified.')
        : (tr ? 'Kanıt değerlendirmesi tamamlanamadı. Kanıt ve kontrol skorları ile genel güvence paketi kullanılamıyor; yeniden değerlendirin.' : 'Evidence assessment could not be completed. Evidence/control scores and the general assurance pack are unavailable; reassess to retry.')}</span>
    {!state.loading && !state.ready && <span>{tr ? 'Kaynak durumu: ' : 'Source status: '}{tr ? 'Kanıt' : 'Evidence'}: {state.evidenceReady ? (tr ? 'değerlendirildi' : 'assessed') : (tr ? 'doğrulanamadı' : 'unverified')} · {tr ? 'Denetim portföyü' : 'Audit portfolio'}: {state.auditReady ? (tr ? 'değerlendirildi' : 'assessed') : (tr ? 'kapsam veya kaynak kontrolü gerekiyor' : 'scope or source review required')}</span>}
    {!state.loading && !!state.auditPortfolio?.orphanRequirements && <span>{tr ? `${state.auditPortfolio.orphanRequirements} madde portföydeki bir denetime bağlı değil.` : `${state.auditPortfolio.orphanRequirements} requirements are not linked to a portfolio audit.`}</span>}
    </div>
    <div className="evidence-assurance-actions">
    {!state.loading && !!state.auditPortfolio?.orphanRequirements && <button type="button" onClick={() => navigateToFornost({ module: 'Denetim Yönetimi', kind: 'audit-unassigned', source: 'assurance-status' })}>{tr ? 'Bağlantısız maddeleri incele' : 'Review unassigned requirements'}</button>}
    <button type="button" onClick={state.refresh} disabled={state.loading}>{tr ? 'Güvenceyi yeniden değerlendir' : 'Reassess assurance'}</button>
    </div>
  </div>;
}
