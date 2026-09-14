import { cleanAiText, redactSensitiveText } from "./security";
export const AI_RESILIENCE_SCENARIOS = [
  "provider-outage",
  "model-degradation",
  "data-disclosure",
  "prompt-injection",
  "credential-compromise",
  "regional-outage",
] as const;
const realDate = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  },
  minutes = (v: unknown, max: number) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > max)
      throw new Error(`Süre 0–${max} dakika arasında olmalıdır.`);
    return n;
  };
export function validateResiliencePlan(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    scenario: cleanAiText(input.scenario, 40),
    owner: redactSensitiveText(input.owner, 320),
    technicalOwner: redactSensitiveText(input.technicalOwner, 320),
    rtoMinutes: minutes(input.rtoMinutes, 10080),
    rpoMinutes: minutes(input.rpoMinutes, 1440),
    maxDegradedMinutes: minutes(input.maxDegradedMinutes, 10080),
    fallbackPlan: redactSensitiveText(input.fallbackPlan, 1600),
    manualPlan: redactSensitiveText(input.manualPlan, 1600),
    shutdownProcedure: redactSensitiveText(input.shutdownProcedure, 1600),
    communicationPlan: redactSensitiveText(input.communicationPlan, 1600),
    dependencies: redactSensitiveText(input.dependencies, 1200),
    nextExercise: cleanAiText(input.nextExercise, 10),
  };
  if (
    !value.modelId ||
    !AI_RESILIENCE_SCENARIOS.includes(
      value.scenario as (typeof AI_RESILIENCE_SCENARIOS)[number],
    ) ||
    value.owner.length < 3 ||
    value.technicalOwner.length < 3 ||
    value.fallbackPlan.length < 10 ||
    value.manualPlan.length < 10 ||
    value.shutdownProcedure.length < 10 ||
    value.communicationPlan.length < 10 ||
    !realDate(value.nextExercise)
  )
    throw new Error(
      "Senaryo, sahiplik, kurtarma, manuel çalışma, durdurma, iletişim ve tatbikat tarihi zorunludur.",
    );
  return value;
}
export function evaluateExercise(input: {
  rtoMinutes: number;
  rpoMinutes: number;
  actualRecoveryMinutes: number;
  actualDataLossMinutes: number;
  killSwitchPassed: boolean;
  fallbackPassed: boolean;
  manualModePassed: boolean;
  communicationPassed: boolean;
}) {
  const checks = [
      { key: "rto", passed: input.actualRecoveryMinutes <= input.rtoMinutes },
      { key: "rpo", passed: input.actualDataLossMinutes <= input.rpoMinutes },
      { key: "kill-switch", passed: input.killSwitchPassed },
      { key: "fallback", passed: input.fallbackPassed },
      { key: "manual-mode", passed: input.manualModePassed },
      { key: "communication", passed: input.communicationPassed },
    ],
    score = Math.round(
      (checks.filter((c) => c.passed).length / checks.length) * 100,
    ),
    criticalFailures = checks
      .filter((c) => ["kill-switch", "fallback"].includes(c.key) && !c.passed)
      .map((c) => c.key);
  return {
    checks,
    score,
    criticalFailures,
    status: score >= 80 && !criticalFailures.length ? "passed" : "failed",
  };
}
export function validateExercise(
  input: Record<string, unknown>,
  plan: { rtoMinutes: number; rpoMinutes: number },
) {
  const value = {
    actualRecoveryMinutes: minutes(input.actualRecoveryMinutes, 20160),
    actualDataLossMinutes: minutes(input.actualDataLossMinutes, 2880),
    killSwitchPassed: input.killSwitchPassed === true,
    fallbackPassed: input.fallbackPassed === true,
    manualModePassed: input.manualModePassed === true,
    communicationPassed: input.communicationPassed === true,
    findings: redactSensitiveText(input.findings, 2000),
    correctiveActions: redactSensitiveText(input.correctiveActions, 2000),
    exercisedAt: cleanAiText(input.exercisedAt, 10),
    nextRetest: cleanAiText(input.nextRetest, 10),
  };
  if (
    !realDate(value.exercisedAt) ||
    !realDate(value.nextRetest) ||
    value.nextRetest <= value.exercisedAt ||
    value.findings.length < 5 ||
    value.correctiveActions.length < 5
  )
    throw new Error(
      "Tatbikat tarihleri, bulgular ve düzeltici aksiyonlar zorunludur.",
    );
  return { ...value, ...evaluateExercise({ ...plan, ...value }) };
}
export function resilienceAttention(
  status: string,
  nextExercise: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "retired") return "retired";
  if (nextExercise < today) return "overdue";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return nextExercise <= d.toISOString().slice(0, 10) ? "due-soon" : "current";
}
