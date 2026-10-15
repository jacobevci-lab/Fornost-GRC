import type { useEvidenceAssurance } from './use-evidence-assurance';

export default function EvidenceAssuranceStatus({ state, lang }: { state: ReturnType<typeof useEvidenceAssurance>; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr';
  return <div className="evidence-assurance-status" role="status" data-state={state.loading ? 'loading' : state.ready ? 'ready' : 'unavailable'}>
    <span>{state.loading ? (tr ? 'Kanıt güvencesi değerlendiriliyor…' : 'Assessing evidence confidence…') : state.ready
      ? <>{tr ? 'Kanıt değerlendirmesi: ' : 'Evidence evaluated: '}<time dateTime={state.generatedAt}>{new Date(state.generatedAt!).toLocaleString(tr ? 'tr-TR' : 'en-GB')}</time></>
      : (tr ? 'Kanıt değerlendirmesi tamamlanamadı. Güvence skorları ve paket indirme kullanılamıyor.' : 'Evidence evaluation is incomplete. Assurance scores and pack download are unavailable.')}</span>
    <button type="button" onClick={state.refresh} disabled={state.loading}>{tr ? 'Kanıtları yeniden değerlendir' : 'Reassess evidence'}</button>
  </div>;
}
