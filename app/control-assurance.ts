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

export function buildControlAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const controls = rows.filter((row) => row.module === "Kontroller");
  const graph = buildConnectedGrcGraph(rows);
  const todayTime = dateValue(today);

  const items: ControlAssuranceItem[] = controls.map((control) => {
    const reference = clean(control.data.controlRef || control.code || control.id);
    const linkedEvidence = relatedRows(control, graph.links, "Kanıtlar", ["control-evidence"]);
    const linkedAudits = relatedRows(control, graph.links, "Denetim Yönetimi", ["audit-control"]);
    const linkedFrameworks = relatedRows(control, graph.links, "Uyum", ["control-framework"]);
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

    const nextTestDate = clean(control.data.nextTestDate);
    const nextTestTime = dateValue(nextTestDate);
    const testOverdue = Number.isFinite(nextTestTime) && nextTestTime < todayTime;
    const testResult = control.data.testResult || control.data.lastTestResult || control.data.effectiveness;
    const testFailed = includes(testResult, [
      "başarısız", "failed", "ineffective", "etkisiz", "not effective", "fail", "failed test",
    ]);

    const reasons: string[] = [];
    let score = 100;
    if (!clean(control.data.owner)) { score -= 15; reasons.push("owner-missing"); }
    if (!clean(control.data.testOwner)) { score -= 10; reasons.push("test-owner-missing"); }
    if (!nextTestDate) { score -= 15; reasons.push("test-date-missing"); }
    else if (testOverdue) { score -= 30; reasons.push("test-overdue"); }
    if (testFailed) { score -= 35; reasons.push("test-failed"); }
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
      nextTestDate,
      testOverdue,
      testFailed,
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
