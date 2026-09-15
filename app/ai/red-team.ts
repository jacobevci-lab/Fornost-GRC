import { cleanAiText, redactSensitiveText } from "./security";
export const AI_ATTACK_CATEGORIES = [
  "prompt-injection",
  "insecure-output",
  "data-poisoning",
  "model-dos",
  "supply-chain",
  "sensitive-disclosure",
  "insecure-plugin",
  "excessive-agency",
  "overreliance",
  "model-theft",
  "jailbreak",
  "multimodal-injection",
] as const;
const date = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export function validateCampaign(input: Record<string, unknown>) {
  const v = {
    modelId: cleanAiText(input.modelId, 100),
    name: redactSensitiveText(input.name, 180),
    scope: redactSensitiveText(input.scope, 1800),
    methodology: redactSensitiveText(input.methodology, 1200),
    lead: redactSensitiveText(input.lead, 320),
    independentTester: redactSensitiveText(input.independentTester, 320),
    environment: cleanAiText(input.environment, 30),
    categories: Array.isArray(input.categories)
      ? [
          ...new Set(
            input.categories
              .map((x) => cleanAiText(x, 40))
              .filter((x) =>
                AI_ATTACK_CATEGORIES.includes(
                  x as (typeof AI_ATTACK_CATEGORIES)[number],
                ),
              ),
          ),
        ].slice(0, 12)
      : [],
    plannedAt: cleanAiText(input.plannedAt, 10),
    completedAt: cleanAiText(input.completedAt, 10),
    totalTests: Number(input.totalTests),
    passedTests: Number(input.passedTests),
    criticalFindings: Number(input.criticalFindings),
    highFindings: Number(input.highFindings),
    mediumFindings: Number(input.mediumFindings),
    reportReference: redactSensitiveText(input.reportReference, 1000),
    remediationPlan: redactSensitiveText(input.remediationPlan, 1800),
    retestAt: cleanAiText(input.retestAt, 10),
  };
  if (
    !v.modelId ||
    v.name.length < 4 ||
    v.scope.length < 10 ||
    v.methodology.length < 10 ||
    v.lead.length < 3 ||
    v.independentTester.length < 3 ||
    !["isolated-test", "staging", "production-safe"].includes(v.environment) ||
    !v.categories.length ||
    !date(v.plannedAt) ||
    !date(v.completedAt) ||
    v.completedAt < v.plannedAt ||
    !date(v.retestAt) ||
    v.retestAt <= v.completedAt ||
    v.reportReference.length < 5 ||
    v.remediationPlan.length < 10
  )
    throw new Error(
      "Kampanya kapsamı, metodoloji, bağımsız test, tarihler, rapor ve remediation zorunludur.",
    );
  for (const n of [
    v.totalTests,
    v.passedTests,
    v.criticalFindings,
    v.highFindings,
    v.mediumFindings,
  ])
    if (!Number.isInteger(n) || n < 0 || n > 100000)
      throw new Error("Test ve bulgu sayıları geçersizdir.");
  if (v.totalTests < 1 || v.passedTests > v.totalTests)
    throw new Error("Başarılı test sayısı toplam test sayısını aşamaz.");
  const passRate = Math.round((v.passedTests / v.totalTests) * 100),
    blockers = [] as string[];
  if (v.criticalFindings) blockers.push(`${v.criticalFindings} kritik bulgu`);
  if (v.highFindings) blockers.push(`${v.highFindings} yüksek bulgu`);
  if (passRate < 90) blockers.push("Başarı oranı %90 altında");
  if (v.categories.length < 5)
    blockers.push("Tehdit kapsamı 5 kategorinin altında");
  return { ...v, passRate, blockers };
}
export function redTeamAttention(
  status: string,
  retestAt: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "retired") return "retired";
  if (retestAt < today) return "retest-overdue";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return retestAt <= d.toISOString().slice(0, 10) ? "retest-due" : "current";
}
