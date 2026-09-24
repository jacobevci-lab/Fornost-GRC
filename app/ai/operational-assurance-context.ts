import { buildContinuousAssuranceDashboard } from "../continuous-assurance-dashboard";
import { loadContinuousAssuranceSnapshots } from "../continuous-assurance-store";
import { dataClassificationAllowed, type AiDataClassification } from "./data-policy";

export type OperationalAssuranceContextSource = { id: string; module: string; title: string };

const compact = (value: unknown, max = 180) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const safeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 120);

export async function buildOperationalAssuranceAiContext(
  db: D1Database,
  maxDataClassification: AiDataClassification,
  maxChars = 6_500,
) {
  if (!dataClassificationAllowed("Internal", maxDataClassification)) {
    return { sources: [] as OperationalAssuranceContextSource[], contextText: "", summaryAvailable: false };
  }

  const snapshots = await loadContinuousAssuranceSnapshots(db);
  if (!snapshots.rules.length && !snapshots.findings.length && !snapshots.workItems.length) {
    return { sources: [] as OperationalAssuranceContextSource[], contextText: "", summaryAvailable: false };
  }

  const dashboard = buildContinuousAssuranceDashboard({
    rules: snapshots.rules,
    findings: snapshots.findings,
    workItems: snapshots.workItems,
    now: new Date(),
  });
  const sources: OperationalAssuranceContextSource[] = [];
  const chunks: string[] = [];
  let used = 0;

  const add = (source: OperationalAssuranceContextSource, payload: Record<string, unknown>) => {
    const chunk = JSON.stringify({
      sourceId: source.id,
      module: source.module,
      title: source.title,
      dataClassification: "Internal",
      data: payload,
    });
    if (used + chunk.length > maxChars) return false;
    used += chunk.length;
    sources.push(source);
    chunks.push(chunk);
    return true;
  };

  add(
    { id: "CA-SUMMARY", module: "Kanıt Otomasyonu", title: "Continuous Assurance operational summary" },
    {
      generatedAt: dashboard.generatedAt,
      assuranceCoverage: dashboard.summary.assuranceCoverage,
      totalControls: dashboard.summary.totalControls,
      healthyControls: dashboard.summary.healthy,
      failingControls: dashboard.summary.failing,
      evidenceIntegrityFailures: dashboard.summary.integrityFailures,
      staleOrMissingEvidence: dashboard.summary.stale,
      evidenceExpiring: dashboard.summary.expiring,
      controlsDue: dashboard.summary.due,
      openFindings: dashboard.summary.openFindings,
      overdueRemediation: dashboard.summary.overdueRemediation,
      pendingReview: dashboard.summary.pendingReview,
      awaitingRetest: dashboard.summary.awaitingRetest,
      failedRetest: dashboard.summary.failedRetest,
      dataQuality: snapshots.dataQuality,
    },
  );

  for (const item of dashboard.priorities.slice(0, 18)) {
    const rawId = item.id.replace(/^(rule|finding|work):/, "");
    const sourceId = item.kind === "work-item"
      ? `CA-WORK-${safeIdPart(rawId)}`
      : item.kind === "finding"
        ? `CA-FINDING-${safeIdPart(rawId)}`
        : `CA-CONTROL-${safeIdPart(rawId)}`;
    const source = {
      id: sourceId,
      module: item.kind === "finding" ? "Bulgular ve CAPA" : "Kanıt Otomasyonu",
      title: compact(item.title),
    };
    if (!add(source, {
      kind: item.kind,
      state: compact(item.state, 80),
      priority: item.priority,
      ruleId: compact(item.ruleId, 120),
      ruleName: compact(item.ruleName),
      findingId: compact(item.findingId, 120),
      targetControlRef: compact(item.targetControlRef, 120),
      owner: compact(item.owner, 160),
      dueDate: compact(item.dueDate, 40),
      reason: compact(item.reason, 100),
      evidenceIntegrity: compact(item.evidenceIntegrity, 40),
      linkedEvidenceCount: Number(item.linkedEvidenceCount || 0),
      updatedAt: compact(item.updatedAt, 60),
    })) break;
  }

  return {
    sources,
    contextText: chunks.join("\n"),
    summaryAvailable: true,
  };
}
