export type AssuranceRow = {
  id: string;
  code?: string;
  module: string;
  data: Record<string, unknown>;
};

export type ControlAssuranceItem = {
  control: AssuranceRow;
  reference: string;
  title: string;
  owner: string;
  evidenceCount: number;
  currentEvidenceCount: number;
  auditCount: number;
  automationRuleCount: number;
  automationHealthyCount: number;
  automationOpenFindingCount: number;
  openFindingCount: number;
  riskLinkedFindingCount: number;
  nextTestDate: string;
  testOverdue: boolean;
  score: number;
  state: "healthy" | "attention" | "critical";
  reasons: string[];
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const key = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const values = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap(values)
  : clean(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);
const dateValue = (value: unknown) => {
  const text = clean(value);
  if (!text) return Number.NaN;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};
const includes = (value: unknown, accepted: string[]) => accepted.includes(key(value));
const aliases = (row: AssuranceRow) => new Set([
  row.id,
  row.code,
  row.data.controlRef,
  row.data.controlTitle,
  row.data.title,
  row.data.name,
  row.data.identityRefs,
  row.data.aliasRefs,
].flatMap(values).map(key).filter(Boolean));
const matchesAliases = (value: unknown, accepted: Set<string>) => values(value).some((item) => accepted.has(key(item)));
const isOpenFinding = (status: unknown) => !["closed", "resolved", "cancelled", "accepted"].includes(key(status));

export function buildControlAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const controls = rows.filter((row) => row.module === "Kontroller");
  const evidence = rows.filter((row) => row.module === "Kanıtlar");
  const audits = rows.filter((row) => row.module === "Denetim Yönetimi");
  const automationRules = rows.filter((row) => row.module === "Kanıt Otomasyonu" && clean(row.data.kind) === "automation-rule");
  const automationFindings = rows.filter((row) => row.module === "Kanıt Otomasyonu" && clean(row.data.kind) === "automation-finding");
  const enterpriseFindings = rows.filter((row) => row.module === "Bulgular ve CAPA" && clean(row.data.kind || "finding") === "finding");
  const todayTime = dateValue(today);

  const items: ControlAssuranceItem[] = controls.map((control) => {
    const reference = clean(control.data.controlRef || control.code || control.id);
    const controlAliases = aliases(control);
    const linkedEvidence = evidence.filter((row) => matchesAliases(row.data.controlRef, controlAliases));
    const linkedAudits = audits.filter((row) =>
      [row.data.controlRef, row.data.requirementRef].some((value) => matchesAliases(value, controlAliases)),
    );
    const linkedAutomationRules = automationRules.filter((row) => matchesAliases(row.data.automationControlRefs || row.data.controlRefs, controlAliases));
    const linkedRuleAliases = new Set(linkedAutomationRules.flatMap((row) => Array.from(aliases(row))));
    const linkedAutomationFindings = automationFindings.filter((row) => matchesAliases(row.data.automationRuleRef || row.data.ruleId, linkedRuleAliases));
    const openAutomationFindings = linkedAutomationFindings.filter((row) => isOpenFinding(row.data.status));
    const linkedEnterpriseFindings = enterpriseFindings.filter((row) => matchesAliases(row.data.findingControlRef || row.data.controlRef, controlAliases));
    const openEnterpriseFindings = linkedEnterpriseFindings.filter((row) => isOpenFinding(row.data.status));
    const riskLinkedFindings = linkedEnterpriseFindings.filter((row) => values(row.data.findingRiskRef || row.data.riskRef).length > 0);
    const currentEvidence = linkedEvidence.filter((row) => {
      const expired = includes(row.data.status, ["süresi doldu", "expired", "reddedildi", "rejected"]);
      const expiresAt = dateValue(row.data.expiresAt);
      return !expired && (!Number.isFinite(expiresAt) || expiresAt >= todayTime);
    });
    const healthyAutomation = linkedAutomationRules.filter((row) => key(row.data.automationHealth || row.data.health) === "healthy");
    const failingAutomation = linkedAutomationRules.filter((row) => key(row.data.automationHealth || row.data.health) === "failing");
    const staleAutomation = linkedAutomationRules.filter((row) => ["stale", "missing"].includes(key(row.data.automationHealth || row.data.health)));
    const attentionAutomation = linkedAutomationRules.filter((row) => ["", "expiring", "unknown", "paused"].includes(key(row.data.automationHealth || row.data.health)));
    const nextTestDate = clean(control.data.nextTestDate);
    const nextTestTime = dateValue(nextTestDate);
    const testOverdue = Number.isFinite(nextTestTime) && nextTestTime < todayTime;
    const reasons: string[] = [];
    let score = 100;
    if (!clean(control.data.owner)) { score -= 15; reasons.push("owner-missing"); }
    if (!clean(control.data.testOwner)) { score -= 10; reasons.push("test-owner-missing"); }
    if (!nextTestDate) { score -= 15; reasons.push("test-date-missing"); }
    else if (testOverdue) { score -= 30; reasons.push("test-overdue"); }
    if (!linkedEvidence.length && !linkedAutomationRules.length) { score -= 35; reasons.push("evidence-missing"); }
    else if (linkedEvidence.length && !currentEvidence.length && !healthyAutomation.length) { score -= 25; reasons.push("evidence-stale"); }
    if (!linkedAudits.length) { score -= 10; reasons.push("audit-missing"); }
    if (failingAutomation.length) { score -= 25; reasons.push("automation-failing"); }
    else if (staleAutomation.length) { score -= 20; reasons.push("automation-stale"); }
    else if (attentionAutomation.length) { score -= 10; reasons.push("automation-attention"); }
    if (openAutomationFindings.length) { score -= 10; reasons.push("automation-finding-open"); }
    if (openEnterpriseFindings.length) { score -= 15; reasons.push("remediation-open"); }
    if (linkedEnterpriseFindings.length && !riskLinkedFindings.length) { score -= 10; reasons.push("risk-link-missing"); }
    if (includes(control.data.status, ["iyileştirme gerekli", "needs improvement", "devre dışı", "inactive"])) {
      score -= 20;
      reasons.push("control-needs-improvement");
    }
    score = Math.max(0, score);
    return {
      control,
      reference,
      title: clean(control.data.controlTitle || control.data.title || reference),
      owner: clean(control.data.owner),
      evidenceCount: linkedEvidence.length,
      currentEvidenceCount: currentEvidence.length,
      auditCount: linkedAudits.length,
      automationRuleCount: linkedAutomationRules.length,
      automationHealthyCount: healthyAutomation.length,
      automationOpenFindingCount: openAutomationFindings.length,
      openFindingCount: openEnterpriseFindings.length,
      riskLinkedFindingCount: riskLinkedFindings.length,
      nextTestDate,
      testOverdue,
      score,
      state: score >= 80 ? "healthy" : score >= 50 ? "attention" : "critical",
      reasons,
    };
  });

  items.sort((a, b) => a.score - b.score || a.reference.localeCompare(b.reference, "tr"));
  const healthy = items.filter((item) => item.state === "healthy").length;
  const currentEvidence = items.filter((item) => item.currentEvidenceCount > 0 || item.automationHealthyCount > 0).length;
  const overdueTests = items.filter((item) => item.testOverdue).length;
  const automationCovered = items.filter((item) => item.automationRuleCount > 0).length;
  const automationHealthy = items.filter((item) => item.automationRuleCount > 0 && item.automationHealthyCount === item.automationRuleCount).length;
  const openFindings = items.reduce((sum, item) => sum + item.openFindingCount + item.automationOpenFindingCount, 0);
  const score = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 100;
  return { items, total: items.length, healthy, currentEvidence, overdueTests, automationCovered, automationHealthy, openFindings, score };
}
