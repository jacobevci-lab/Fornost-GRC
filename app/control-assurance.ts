import { buildConnectedGrcGraph, type ConnectedGrcLink } from "./connected-grc-model";

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
  verifiedEvidenceCount: number;
  brokenEvidenceCount: number;
  legacyEvidenceCount: number;
  unavailableEvidenceCount: number;
  auditCount: number;
  frameworkCount: number;
  openFindingCount: number;
  automationCount: number;
  automationRuleCount: number;
  automationHealthyCount: number;
  automationOpenFindingCount: number;
  openRemediationCount: number;
  riskLinkedFindingCount: number;
  relationCount: number;
  nextTestDate: string;
  testOverdue: boolean;
  testFailed: boolean;
  score: number;
  state: "healthy" | "attention" | "critical";
  reasons: string[];
};

export type ControlAssuranceTest = {
  owner: string;
  frequency: string;
  lastTestDate: string;
  nextTestDate: string;
  result: string;
  overdue: boolean;
  failed: boolean;
  status: "not-planned" | "planned" | "overdue" | "failed";
};

export type ControlAssuranceDetail = {
  item: ControlAssuranceItem;
  frameworks: AssuranceRow[];
  evidence: AssuranceRow[];
  automations: AssuranceRow[];
  audits: AssuranceRow[];
  findings: AssuranceRow[];
  remediations: AssuranceRow[];
  risks: AssuranceRow[];
  test: ControlAssuranceTest;
  unresolved: Array<{ sourceId: string; field: string; value: string; relation: string }>;
  connectedStages: number;
  totalStages: number;
  lineagePercent: number;
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const key = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const dateValue = (value: unknown) => {
  const text = clean(value);
  if (!text) return Number.NaN;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};
const includes = (value: unknown, accepted: string[]) => accepted.includes(key(value));
const isClosed = (value: unknown) => includes(value, [
  "kapalı", "kapatıldı", "tamamlandı", "closed", "completed", "resolved", "accepted", "kabul edildi", "cancelled", "canceled",
]);
const kindOf = (row: AssuranceRow) => key(row.data.kind);
const evidenceIntegrityOf = (row: AssuranceRow) => key(row.data.evidenceIntegrity);

function uniqueRows(rows: AssuranceRow[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function relatedRows(control: AssuranceRow, links: ConnectedGrcLink[], module: string, relations: string[]) {
  const rows: AssuranceRow[] = [];
  for (const link of links) {
    if (!relations.includes(link.relation)) continue;
    if (link.source.id === control.id && link.target.module === module) rows.push(link.target as AssuranceRow);
    if (link.target.id === control.id && link.source.module === module) rows.push(link.source as AssuranceRow);
  }
  return uniqueRows(rows);
}

function relatedFromRows(sources: AssuranceRow[], links: ConnectedGrcLink[], module: string, relations: string[]) {
  const sourceIds = new Set(sources.map((row) => row.id));
  const rows: AssuranceRow[] = [];
  for (const link of links) {
    if (!relations.includes(link.relation)) continue;
    if (sourceIds.has(link.source.id) && link.target.module === module) rows.push(link.target as AssuranceRow);
    if (sourceIds.has(link.target.id) && link.source.module === module) rows.push(link.source as AssuranceRow);
  }
  return uniqueRows(rows);
}

function testForControl(control: AssuranceRow, today: string): ControlAssuranceTest {
  const nextTestDate = clean(control.data.nextTestDate);
  const lastTestDate = clean(control.data.lastTestDate || control.data.testDate || control.data.lastAssessmentDate);
  const result = clean(control.data.testResult || control.data.lastTestResult || control.data.effectiveness);
  const nextTestTime = dateValue(nextTestDate);
  const todayTime = dateValue(today);
  const overdue = Number.isFinite(nextTestTime) && nextTestTime < todayTime;
  const failed = includes(result, [
    "başarısız", "failed", "ineffective", "etkisiz", "not effective", "fail", "failed test",
  ]);
  return {
    owner: clean(control.data.testOwner),
    frequency: clean(control.data.frequency),
    lastTestDate,
    nextTestDate,
    result,
    overdue,
    failed,
    status: failed ? "failed" : overdue ? "overdue" : nextTestDate || lastTestDate || result ? "planned" : "not-planned",
  };
}

function automationHealth(row: AssuranceRow) {
  return key(row.data.automationHealth || row.data.health || row.data.assuranceState);
}

function hasRiskLink(row: AssuranceRow, links: ConnectedGrcLink[]) {
  return links.some((link) =>
    link.relation === "finding-risk"
    && (link.source.id === row.id || link.target.id === row.id),
  );
}

export function buildControlAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const controls = rows.filter((row) => row.module === "Kontroller");
  const graph = buildConnectedGrcGraph(rows);
  const todayTime = dateValue(today);

  const items: ControlAssuranceItem[] = controls.map((control) => {
    const reference = clean(control.data.controlRef || control.code || control.id);
    const linkedEvidence = relatedRows(control, graph.links, "Kanıtlar", ["control-evidence"]);
    const verifiedEvidence = linkedEvidence.filter((row) => evidenceIntegrityOf(row) === "verified");
    const brokenEvidence = linkedEvidence.filter((row) => evidenceIntegrityOf(row) === "broken");
    const legacyEvidence = linkedEvidence.filter((row) => evidenceIntegrityOf(row) === "legacy-unverified");
    const unavailableEvidence = linkedEvidence.filter((row) => evidenceIntegrityOf(row) === "unavailable");
    const linkedAudits = relatedRows(control, graph.links, "Denetim Yönetimi", ["audit-control", "control-evidence"]);
    const linkedFrameworks = relatedRows(control, graph.links, "Uyum", ["control-framework", "control-evidence"]);
    const linkedFindings = relatedRows(control, graph.links, "Bulgular ve CAPA", ["finding-control"])
      .filter((row) => kindOf(row) !== "remediation" && !isClosed(row.data.status));
    const directRemediations = relatedRows(control, graph.links, "Bulgular ve CAPA", ["remediation-control"])
      .filter((row) => kindOf(row) === "remediation");
    const findingRemediations = relatedFromRows(linkedFindings, graph.links, "Bulgular ve CAPA", ["finding-remediation"])
      .filter((row) => kindOf(row) === "remediation");
    const linkedRemediations = uniqueRows([...directRemediations, ...findingRemediations]);
    const openRemediations = linkedRemediations.filter((row) => !isClosed(row.data.status));

    const linkedAutomation = relatedRows(control, graph.links, "Kanıt Otomasyonu", ["automation-control", "control-assurance"]);
    const automationRules = linkedAutomation.filter((row) => kindOf(row) === "automation-rule");
    const automationAssurance = linkedAutomation.filter((row) => kindOf(row) === "automation-assurance");
    const automationFindings = linkedAutomation.filter((row) => kindOf(row) === "automation-finding");
    const openAutomationFindings = automationFindings.filter((row) => !isClosed(row.data.status));
    const automationRemediations = linkedAutomation.filter((row) => kindOf(row) === "automation-remediation" && !isClosed(row.data.status));

    const healthyAutomation = automationRules.filter((row) => includes(automationHealth(row), ["healthy", "effective"]));
    const failingAutomation = automationRules.filter((row) => includes(automationHealth(row), ["failing", "failed", "ineffective"]));
    const staleAutomation = automationRules.filter((row) => includes(automationHealth(row), ["stale", "missing"]));
    const attentionAutomation = automationRules.filter((row) => includes(automationHealth(row), ["", "expiring", "unknown", "paused", "degraded"]));
    const healthyAssurance = automationAssurance.filter((row) => includes(automationHealth(row), ["healthy", "effective"]));
    const automationHealthyCount = Math.max(healthyAutomation.length, healthyAssurance.length);

    const riskLinkedFindings = linkedFindings.filter((row) => hasRiskLink(row, graph.links));
    const controlRelations = graph.links.filter((link) => link.source.id === control.id || link.target.id === control.id);

    const currentEvidence = linkedEvidence.filter((row) => {
      const expired = [row.data.status, row.data.reviewStatus].some((value) =>
        includes(value, ["süresi doldu", "expired", "reddedildi", "rejected"]),
      );
      const expiresAt = dateValue(row.data.expiresAt);
      const integrityBroken = evidenceIntegrityOf(row) === "broken";
      return !expired && !integrityBroken && (!Number.isFinite(expiresAt) || expiresAt >= todayTime);
    });

    const hasHealthyAutomatedAssurance = automationHealthyCount > 0;
    const test = testForControl(control, today);
    const reasons: string[] = [];
    let score = 100;
    if (!clean(control.data.owner)) { score -= 15; reasons.push("owner-missing"); }
    if (!test.owner) { score -= 10; reasons.push("test-owner-missing"); }
    if (!test.nextTestDate) { score -= 15; reasons.push("test-date-missing"); }
    else if (test.overdue) { score -= 30; reasons.push("test-overdue"); }
    if (test.failed) { score -= 35; reasons.push("test-failed"); }
    if (!linkedEvidence.length && !hasHealthyAutomatedAssurance) { score -= 35; reasons.push("evidence-missing"); }
    else if (linkedEvidence.length && !currentEvidence.length && !hasHealthyAutomatedAssurance) { score -= 25; reasons.push("evidence-stale"); }
    if (brokenEvidence.length) { score -= 40; reasons.push("evidence-integrity-broken"); }
    if (legacyEvidence.length) { score -= 10; reasons.push("evidence-integrity-legacy"); }
    if (unavailableEvidence.length) reasons.push("evidence-integrity-unavailable");
    if (!linkedAudits.length) { score -= 10; reasons.push("audit-missing"); }
    if (linkedFindings.length) {
      score -= Math.min(20, linkedFindings.length * 5);
      reasons.push("open-findings");
    }
    if (failingAutomation.length) { score -= 25; reasons.push("automation-failing"); }
    else if (staleAutomation.length) { score -= 20; reasons.push("automation-stale"); }
    else if (attentionAutomation.length && automationRules.length) { score -= 10; reasons.push("automation-attention"); }
    if (openAutomationFindings.length) { score -= 10; reasons.push("automation-finding-open"); }
    if (openRemediations.length || automationRemediations.length) { score -= 10; reasons.push("remediation-open"); }
    if (linkedFindings.length && riskLinkedFindings.length < linkedFindings.length) { score -= 10; reasons.push("risk-link-missing"); }
    if (includes(control.data.status, ["iyileştirme gerekli", "needs improvement", "devre dışı", "inactive"])) {
      score -= 20;
      reasons.push("control-needs-improvement");
    }
    score = Math.max(0, brokenEvidence.length ? Math.min(score, 45) : score);

    return {
      control,
      reference,
      title: clean(control.data.controlTitle || control.data.title || reference),
      owner: clean(control.data.owner),
      evidenceCount: linkedEvidence.length,
      currentEvidenceCount: currentEvidence.length,
      verifiedEvidenceCount: verifiedEvidence.length,
      brokenEvidenceCount: brokenEvidence.length,
      legacyEvidenceCount: legacyEvidence.length,
      unavailableEvidenceCount: unavailableEvidence.length,
      auditCount: linkedAudits.length,
      frameworkCount: linkedFrameworks.length,
      openFindingCount: linkedFindings.length,
      automationCount: linkedAutomation.length,
      automationRuleCount: automationRules.length,
      automationHealthyCount,
      automationOpenFindingCount: openAutomationFindings.length,
      openRemediationCount: openRemediations.length + automationRemediations.length,
      riskLinkedFindingCount: riskLinkedFindings.length,
      relationCount: controlRelations.length,
      nextTestDate: test.nextTestDate,
      testOverdue: test.overdue,
      testFailed: test.failed,
      score,
      state: score >= 80 ? "healthy" : score >= 50 ? "attention" : "critical",
      reasons,
    };
  });

  items.sort((a, b) => a.score - b.score || a.reference.localeCompare(b.reference, "tr"));
  const healthy = items.filter((item) => item.state === "healthy").length;
  const currentEvidence = items.filter((item) => item.currentEvidenceCount > 0 || item.automationHealthyCount > 0).length;
  const overdueTests = items.filter((item) => item.testOverdue).length;
  const failedTests = items.filter((item) => item.testFailed).length;
  const openFindings = items.reduce((sum, item) => sum + item.openFindingCount + item.automationOpenFindingCount + item.openRemediationCount, 0);
  const automated = items.filter((item) => item.automationCount > 0).length;
  const automationCovered = items.filter((item) => item.automationRuleCount > 0).length;
  const automationHealthy = items.filter((item) => item.automationRuleCount > 0 && item.automationHealthyCount >= item.automationRuleCount).length;
  const frameworkMapped = items.filter((item) => item.frameworkCount > 0).length;
  const connected = items.filter((item) => item.relationCount > 0).length;
  const integrityFailures = items.filter((item) => item.brokenEvidenceCount > 0).length;
  const verifiedEvidenceControls = items.filter((item) => item.evidenceCount > 0 && item.verifiedEvidenceCount === item.evidenceCount).length;
  const legacyEvidenceControls = items.filter((item) => item.legacyEvidenceCount > 0).length;
  const integrityUnknownControls = items.filter((item) => item.unavailableEvidenceCount > 0).length;
  const score = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 100;
  return {
    items,
    total: items.length,
    healthy,
    currentEvidence,
    overdueTests,
    failedTests,
    openFindings,
    automated,
    automationCovered,
    automationHealthy,
    frameworkMapped,
    connected,
    integrityFailures,
    verifiedEvidenceControls,
    legacyEvidenceControls,
    integrityUnknownControls,
    score,
  };
}

export function buildControlAssuranceDetail(
  rows: AssuranceRow[],
  controlId: string,
  today = new Date().toISOString().slice(0, 10),
): ControlAssuranceDetail | null {
  const summary = buildControlAssurance(rows, today);
  const item = summary.items.find((candidate) => candidate.control.id === controlId);
  if (!item) return null;

  const graph = buildConnectedGrcGraph(rows);
  const control = item.control;
  const frameworks = relatedRows(control, graph.links, "Uyum", ["control-framework", "control-evidence"]);
  const evidence = relatedRows(control, graph.links, "Kanıtlar", ["control-evidence"]);
  const automations = relatedRows(control, graph.links, "Kanıt Otomasyonu", ["automation-control", "control-assurance"]);
  const audits = relatedRows(control, graph.links, "Denetim Yönetimi", ["audit-control", "control-evidence"]);
  const findings = relatedRows(control, graph.links, "Bulgular ve CAPA", ["finding-control"])
    .filter((row) => kindOf(row) !== "remediation" && !isClosed(row.data.status));
  const directRemediations = relatedRows(control, graph.links, "Bulgular ve CAPA", ["remediation-control"])
    .filter((row) => kindOf(row) === "remediation");
  const findingRemediations = relatedFromRows(findings, graph.links, "Bulgular ve CAPA", ["finding-remediation"])
    .filter((row) => kindOf(row) === "remediation");
  const remediations = uniqueRows([...directRemediations, ...findingRemediations]);
  const riskSources = uniqueRows([...findings, ...remediations, ...audits, ...automations]);
  const risks = relatedFromRows(riskSources, graph.links, "Risk Assessment", ["finding-risk", "audit-risk", "remediation-risk"]);
  const test = testForControl(control, today);

  const chainIds = new Set([
    control.id,
    ...frameworks.map((row) => row.id),
    ...evidence.map((row) => row.id),
    ...automations.map((row) => row.id),
    ...audits.map((row) => row.id),
    ...findings.map((row) => row.id),
    ...remediations.map((row) => row.id),
    ...risks.map((row) => row.id),
  ]);
  const unresolved = graph.unresolved
    .filter((entry) => chainIds.has(entry.source.id))
    .map((entry) => ({ sourceId: entry.source.id, field: entry.field, value: entry.value, relation: entry.relation }));

  const stageChecks = [
    frameworks.length > 0,
    evidence.length > 0,
    automations.length > 0,
    test.status !== "not-planned",
    findings.length > 0 || remediations.length > 0,
    risks.length > 0,
  ];
  const connectedStages = stageChecks.filter(Boolean).length;
  const totalStages = stageChecks.length;

  return {
    item,
    frameworks,
    evidence,
    automations,
    audits,
    findings,
    remediations,
    risks,
    test,
    unresolved,
    connectedStages,
    totalStages,
    lineagePercent: Math.round((connectedStages / totalStages) * 100),
  };
}
