'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { withBasePath } from './base-path';
import type { AssuranceRow } from './control-assurance';
import { applyEvidenceAssuranceSnapshot, parseEvidenceAssuranceSnapshot, type EvidenceAssuranceSnapshot } from './evidence/assurance-snapshot';
import { evaluateEvidenceEligibility } from './evidence/eligibility';

/** One assessment and timestamp for the evidence list and its quality summary. */
export function useEvidenceAssurance(rows: AssuranceRow[], enabled: boolean) {
  const scope = useMemo(() => ({ rows, enabled }), [rows, enabled]);
  const [result, setResult] = useState<{ scope: typeof scope; snapshot: EvidenceAssuranceSnapshot | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setResult(null); setRevision(n => n + 1); }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    void fetch(withBasePath('/api/evidence/assurance'), { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('unavailable'); return parseEvidenceAssuranceSnapshot(await response.json()); })
      .catch(() => null).then(snapshot => { if (active) setResult({ scope, snapshot }); })
      .finally(() => window.clearTimeout(timeout));
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 60000);
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [rows, enabled, scope, revision, refresh]);
  const snapshot = enabled && result?.scope === scope ? result.snapshot : null;
  const applied = useMemo(() => applyEvidenceAssuranceSnapshot(rows, snapshot), [rows, snapshot]);
  return { ...applied, generatedAt: snapshot?.generatedAt, loading: enabled && (!result || result.scope !== scope), refresh };
}
export type EvidenceRegisterAssessment = ReturnType<typeof useEvidenceAssurance>;
export const EvidenceAssessmentContext = createContext<EvidenceRegisterAssessment | null>(null);

export function evidenceEligibilityLabel(data: Record<string, unknown>, now: Date, lang: 'tr' | 'en') {
  const result = evaluateEvidenceEligibility(data, now), tr = lang === 'tr';
  if (result.current) return tr ? 'Güncel' : 'Current';
  if (result.reasons.includes('expired')) return tr ? 'Süresi Doldu' : 'Expired';
  if (result.reasons.includes('rejected')) return tr ? 'Reddedildi' : 'Rejected';
  if (result.reasons.includes('integrity-unavailable')) return tr ? 'Doğrulanamadı' : 'Unverified';
  if (result.invalid) return tr ? 'İnceleme Gerekli' : 'Review Required';
  return tr ? 'İnceleme Bekliyor' : 'Awaiting Review';
}
/** Derived display data never replaces the editable canonical record. */
export function useEvidenceFreshness(row: AssuranceRow, lang: 'tr' | 'en') {
  const state = useContext(EvidenceAssessmentContext);
  if (state?.loading) return lang === 'tr' ? 'Değerlendiriliyor' : 'Assessing';
  if (state && !state.ready) return lang === 'tr' ? 'Doğrulanamadı' : 'Unverified';
  const assessed = state?.rows.find(item => item.id === row.id) || row;
  return evidenceEligibilityLabel(assessed.data, state?.generatedAt ? new Date(state.generatedAt) : new Date(), lang);
}
