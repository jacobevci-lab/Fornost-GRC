import type { useExecutiveAssurance } from './use-executive-assurance';

export default function EvidenceAssuranceStatus({ state, lang }: { state: ReturnType<typeof useExecutiveAssurance>; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr';
  return <div className="evidence-assurance-status" role="status" data-state={state.loading ? 'loading' : state.ready ? 'ready' : 'unavailable'}>
    <span>{state.loading ? (tr ? 'Kanıt ve denetim hazırlığı değerlendiriliyor…' : 'Assessing evidence and audit readiness…') : state.ready
      ? <>{tr ? 'Güvence değerlendirmesi: ' : 'Assurance evaluated: '}<time dateTime={state.generatedAt}>{new Date(state.generatedAt!).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</time></>
      : (tr ? 'Kanıt veya denetim hazırlığı değerlendirmesi tamamlanamadı. Güvence skorları ve paket indirme kullanılamıyor.' : 'Evidence or audit readiness evaluation is incomplete. Assurance scores and pack download are unavailable.')}</span>
    <button type="button" onClick={state.refresh} disabled={state.loading}>{tr ? 'Güvenceyi yeniden değerlendir' : 'Reassess assurance'}</button>
  </div>;
}
