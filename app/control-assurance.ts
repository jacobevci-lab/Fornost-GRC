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
  auditCount: number;
  frameworkCount: number;
  openFindingCount: number;
  automationCount: number;
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
const isClosed = (value: unknown) => includes(value, ["kapalı", "kapatıldı", "tamamlandı", "closed", "completed", "resolved", "accepted", "kabul edildi"]);

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

export function buildControlAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const controls = rows.filter((row) => row.module === "Kontroller");
  const graph = buildConnectedGrcGraph(rows);
  const todayTime = dateValue(today);

  const items: ControlAssuranceItem[] = controls.map((control) => {
    const reference = clean(control.data.controlRef || control.code || control.id);
    const linkedEvidence = relatedRows(control, graph.links, "Kanıtlar", ["control-evidence"]);
    // Legacy audit rows can carry controlRef. The shared graph still resolves those rows,
    // historically under control-evidence, so accept both graph relation labels here.
    const linkedAudits = relatedRows(control, graph.links, "Denetim Yönetimi", ["audit-control", "control-evidence"]);
    // Compliance requirements can be linked through framework tags or directly through controlRef.
    const linkedFrameworks = relatedRows(control, graph.links, "Uyum", ["control-framework", "control-evidence"]);
    const linkedFindings = relatedRows(control, graph.links, "Bulgular ve CAPA", ["finding-control"])
      .filter((row) => !isClosed(row.data.status));
    const linkedAutomation = relatedRows(control, graph.links, "Kanıt Otomasyonu", ["automation-control", "control-assurance"]);
    const controlRelations = graph.links.filter((link) => link.source.id === control.id || link.target.id === control.id);

    const currentEvidence = linkedEvidence.filter((row) => {
      const expired = [row.data.status, row.data.reviewStatus].some((value) =>
        includes(value, ["süresi doldu", "expired", "reddedildi", "rejected"]),
      );
      const expiresAt = dateValue(row.data.expiresAt);
      return !expired && (!Number.isFinite(expiresAt) || expiresAt >= todayTime);
    });

    const test = testForControl(control, today);
    const reasons: string[] = [];
    let score = 100;
    if (!clean(control.data.owner)) { score -= 15; reasons.push("owner-missing"); }
    if (!test.owner) { score -= 10; reasons.push("test-owner-missing"); }
    if (!test.nextTestDate) { score -= 15; reasons.push("test-date-missing"); }
    else if (test.overdue) { score -= 30; reasons.push("test-overdue"); }
    if (test.failed) { score -= 35; reasons.push("test-failed"); }
    if (!linkedEvidence.length) { score -= 35; reasons.push("evidence-missing"); }
    else if (!currentEvidence.length) { score -= 25; reasons.push("evidence-stale"); }
    if (!linkedAudits.length) { score -= 10; reasons.push("audit-missing"); }
    if (linkedFindings.length) {
      score -= Math.min(20, linkedFindings.length * 5);
      reasons.push("open-findings");
    }
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
      frameworkCount: linkedFrameworks.length,
      openFindingCount: linkedFindings.length,
      automationCount: linkedAutomation.length,
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
  const currentEvidence = items.filter((item) => item.currentEvidenceCount > 0).length;
  const overdueTests = items.filter((item) => item.testOverdue).length;
  const failedTests = items.filter((item) => item.testFailed).length;
  const openFindings = items.reduce((sum, item) => sum + item.openFindingCount, 0);
  const automated = items.filter((item) => item.automationCount > 0).length;
  const frameworkMapped = items.filter((item) => item.frameworkCount > 0).length;
  const connected = items.filter((item) => item.relationCount > 0).length;
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
    frameworkMapped,
    connected,
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
    .filter((row) => !isClosed(row.data.status));
  const riskSources = uniqueRows([...findings, ...audits, ...automations]);
  const risks = relatedFromRows(riskSources, graph.links, "Risk Assessment", ["finding-risk", "audit-risk", "remediation-risk"]);
  const test = testForControl(control, today);

  const chainIds = new Set([
    control.id,
    ...frameworks.map((row) => row.id),
    ...evidence.map((row) => row.id),
    ...automations.map((row) => row.id),
    ...audits.map((row) => row.id),
    ...findings.map((row) => row.id),
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
    findings.length > 0,
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
    risks,
    test,
    unresolved,
    connectedStages,
    totalStages,
    lineagePercent: Math.round((connectedStages / totalStages) * 100),
  };
}
