export const impactDimensionKeys = [
  "inherentImpact",
  "impact",
  "confidentialityImpact",
  "integrityImpact",
  "availabilityImpact",
] as const;

const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";

export function effectiveImpact(data: Record<string, unknown>) {
  return Math.max(0, ...impactDimensionKeys.map((key) => Number(data[key] || 0)));
}

export function isRiskAssessed(data: Record<string, unknown>) {
  const hasLikelihood = present(data.inherentLikelihood) || present(data.likelihood);
  const hasImpact = impactDimensionKeys.some((key) => present(data[key]));
  return hasLikelihood && hasImpact;
}

export function calculatedRiskScore(data: Record<string, unknown>) {
  const likelihood = Number(data.inherentLikelihood || data.likelihood || 0);
  return likelihood * effectiveImpact(data);
}

export function assessedRiskScore(data: Record<string, unknown>) {
  return isRiskAssessed(data) ? calculatedRiskScore(data) : null;
}

export function splitRiskAssessmentState<T extends { data: Record<string, unknown> }>(rows: T[]) {
  const assessed: Array<T & { riskScore: number }> = [];
  const unassessed: T[] = [];
  for (const row of rows) {
    const riskScore = assessedRiskScore(row.data);
    if (riskScore === null) unassessed.push(row);
    else assessed.push({ ...row, riskScore });
  }
  return { assessed, unassessed };
}
