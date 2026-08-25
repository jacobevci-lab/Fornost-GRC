export const impactDimensionKeys = [
  "inherentImpact",
  "impact",
  "confidentialityImpact",
  "integrityImpact",
  "availabilityImpact",
] as const;

export function effectiveImpact(data: Record<string, unknown>) {
  return Math.max(0, ...impactDimensionKeys.map((key) => Number(data[key] || 0)));
}

export function calculatedRiskScore(data: Record<string, unknown>) {
  const likelihood = Number(data.inherentLikelihood || data.likelihood || 0);
  return likelihood * effectiveImpact(data);
}
