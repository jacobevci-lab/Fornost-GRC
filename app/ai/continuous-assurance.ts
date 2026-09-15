import { cleanAiText, redactSensitiveText } from "./security";

const realDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export type AssuranceSnapshot = {
  accuracy: number;
  errorRate: number;
  driftScore: number;
  biasScore: number;
  p95LatencyMs: number;
  sampleSize: number;
  recordedAt: string;
};

export function validateAssurancePolicy(input: Record<string, unknown>) {
  const percent = (key: string) => {
      const value = Number(input[key]);
      if (!Number.isFinite(value) || value < 0 || value > 100)
        throw new Error(`${key} 0-100 arasında olmalıdır.`);
      return Math.round(value * 100) / 100;
    },
    value = {
      modelId: cleanAiText(input.modelId, 100),
      owner: redactSensitiveText(input.owner, 320),
      minAccuracy: percent("minAccuracy"),
      maxErrorRate: percent("maxErrorRate"),
      maxDriftScore: percent("maxDriftScore"),
      maxBiasScore: percent("maxBiasScore"),
      maxP95LatencyMs: Math.round(Number(input.maxP95LatencyMs)),
      minSampleSize: Math.round(Number(input.minSampleSize)),
      frequencyDays: Math.round(Number(input.frequencyDays)),
      evidencePlan: redactSensitiveText(input.evidencePlan, 1600),
      breachAction: redactSensitiveText(input.breachAction, 1600),
      reviewDate: cleanAiText(input.reviewDate, 10),
    };
  if (
    !value.modelId ||
    value.owner.length < 3 ||
    value.minAccuracy < 50 ||
    value.maxP95LatencyMs < 100 ||
    value.maxP95LatencyMs > 600000 ||
    value.minSampleSize < 10 ||
    value.minSampleSize > 10000000 ||
    value.frequencyDays < 1 ||
    value.frequencyDays > 90 ||
    value.evidencePlan.length < 10 ||
    value.breachAction.length < 10 ||
    !realDate(value.reviewDate)
  )
    throw new Error(
      "Model, sahip, güvenli eşikler, örneklem, sıklık, kanıt, ihlal aksiyonu ve review tarihi zorunludur.",
    );
  return value;
}

export function assessAssurance(
  policy: ReturnType<typeof validateAssurancePolicy>,
  snapshot: AssuranceSnapshot | null,
  today = new Date().toISOString(),
) {
  if (!snapshot)
    return { state: "missing", breaches: ["İzleme ölçümü yok"], stale: true };
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - policy.frequencyDays);
  const stale = new Date(snapshot.recordedAt) < cutoff,
    breaches: string[] = [];
  if (snapshot.accuracy < policy.minAccuracy)
    breaches.push("Doğruluk baseline altında");
  if (snapshot.errorRate > policy.maxErrorRate)
    breaches.push("Hata oranı baseline üstünde");
  if (snapshot.driftScore > policy.maxDriftScore)
    breaches.push("Drift baseline üstünde");
  if (snapshot.biasScore > policy.maxBiasScore)
    breaches.push("Bias baseline üstünde");
  if (snapshot.p95LatencyMs > policy.maxP95LatencyMs)
    breaches.push("P95 gecikme baseline üstünde");
  if (snapshot.sampleSize < policy.minSampleSize)
    breaches.push("Örneklem baseline altında");
  if (stale) breaches.push("İzleme ölçümü gecikmiş");
  return { state: breaches.length ? "breached" : "healthy", breaches, stale };
}
