import { evidenceFreshness } from './evidence/continuous-controls';

export type RetestRun = { id: string; status: string; evidence_id: string | null; created_at: string; response_hash: string; detail: string; error_code: string | null };
export type RetestReason = 'passed' | 'test-failed' | 'collection-error' | 'evidence-missing' | 'evidence-mismatch' | 'evidence-stale' | 'source-unavailable' | 'remediation-unverified' | 'risk-missing' | 'risk-data-invalid';
export type RetestOutcome = {
  runId: string; testStatus: string; status: 'pass' | 'fail' | 'error'; reason: RetestReason;
  evidenceId: string | null; evaluatedAt: string;
  riskId: string | null; riskUpdate: 'applied' | 'missing' | 'invalid' | 'not-applied' | 'newer-review-preserved';
  findingAction: 'none' | 'reopened' | 'linked-open-finding' | 'newer-closure-preserved';
  followUpFindingId: string | null;
};
export function parseAssuranceObject(raw: string | null | undefined): Record<string, unknown> | null {
  try { const value = JSON.parse(raw || 'null'); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
}

// A stored pass without its own matching, fresh evidence is not a recovered control.
// These checks validate persisted metadata linkage, not a vendor's certification status.
export function assessRetestRun(run: RetestRun, evidenceRaw: string | null, freshnessHours: number, now = new Date()): { status: 'pass' | 'fail' | 'error'; reason: RetestReason } {
  if (run.status === 'fail') return { status: 'fail', reason: 'test-failed' };
  if (run.status !== 'pass') return { status: 'error', reason: 'collection-error' };
  if (!run.evidence_id || !evidenceRaw) return { status: 'error', reason: 'evidence-missing' };
  const evidence = parseAssuranceObject(evidenceRaw);
  if (!evidence || evidence.validationStatus !== 'pass' || !/^[a-f0-9]{64}$/i.test(run.response_hash)
    || String(evidence.responseHash).toLowerCase() !== run.response_hash.toLowerCase()
    || evidence.collectedAt !== run.created_at) return { status: 'error', reason: 'evidence-mismatch' };
  const expires = Date.parse(String(evidence.freshUntil || ''));
  if (!Number.isFinite(freshnessHours) || freshnessHours <= 0 || !Number.isFinite(expires) || expires <= now.getTime()
    || evidenceFreshness(run.created_at, freshnessHours, now) !== 'fresh') return { status: 'error', reason: 'evidence-stale' };
  return { status: 'pass', reason: 'passed' };
}

export const retestReasonText: Record<RetestReason, { tr: string; en: string }> = {
  passed: { tr: 'Yeniden test güncel kanıtla başarılı. Risk onayı ayrı yürütülür.', en: 'Re-test passed with fresh evidence. Risk approval remains separate.' },
  'test-failed': { tr: 'Yeniden test başarısız. Açık bulguyu ve risk değerlendirmesini takip edin.', en: 'Re-test failed. Follow up on the open finding and risk review.' },
  'collection-error': { tr: 'Veri toplama veya değerlendirme tamamlanamadı. Hata giderilince yeni test isteyin.', en: 'Collection or assessment did not complete. Request another test after resolving the error.' },
  'evidence-missing': { tr: 'Başarılı testin bağlı kanıtı bulunamadı; iyileşme doğrulanamadı.', en: 'The passing test has no available linked evidence; recovery is unverified.' },
  'evidence-mismatch': { tr: 'Test ve kanıt bilgileri eşleşmiyor; yeniden kanıt toplayın.', en: 'Test and evidence metadata do not match; collect new evidence.' },
  'evidence-stale': { tr: 'Test kanıtı güncel değil veya tarihi doğrulanamıyor; yeni test isteyin.', en: 'Test evidence is stale or its date is unverifiable; request another test.' },
  'remediation-unverified': { tr: 'Düzeltme yeniden açılmış veya kapanış kanıtı eksik; iyileşme doğrulanamadı.', en: 'Remediation was reopened or closure proof is missing; recovery is unverified.' },
  'source-unavailable': { tr: 'Bağlı kontrol veya bulgu bulunamadı; kaynak bağlantısını düzeltin.', en: 'The linked rule or finding is unavailable; repair the source linkage.' },
  'risk-missing': { tr: 'Bağlı risk bulunamadığı için sonuç risk kaydına işlenemedi.', en: 'The linked risk is missing, so the result could not be applied to it.' },
  'risk-data-invalid': { tr: 'Bağlı risk verisi okunamadı; risk kaydını düzeltin.', en: 'The linked risk data is invalid; repair the risk record.' },
};
