export function isAutomatedEvidence(row:{id:string;data:Record<string,unknown>}) {
  const d=row.data;
  return row.id.startsWith('EVD-AUTO-') || !!(d.assessmentFingerprint || d.automationRunId || d.automationRuleId || d.automationAssessment)
    || (d.collectionMethod==='API' && !!d.responseHash && !!d.collectedAt);
}

