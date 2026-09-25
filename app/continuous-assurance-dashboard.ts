import { controlHealth, evidenceFreshness } from "./evidence/continuous-controls";

export type AssuranceRuleSnapshot = {
  id: string;
  name: string;
  controlRefs: string;
  enabled: boolean;
  lastStatus?: string | null;
  lastEvidenceAt?: string | null;
  freshnessHours: number;
  consecutiveFailures: number;
  nextRunAt?: string | null;
  evidenceIntegrity?: "verified" | "broken" | "legacy-unverified";
  linkedEvidenceCount?: number;
};

export type AssuranceFindingSnapshot = {
  id: string;
  ruleId: string;
  title: string;
  severity: string;
  owner: string;
  dueDate: string;
  status: string;
};

export type AssuranceWorkSnapshot = {
  id: string;
  findingId: string;
  ruleId: string;
  action: string;
  status: string;
  targetControlRef?: string;
  actor?: string;
  reviewedBy?: string;
  updatedAt: string;
};

export type AssurancePriority = {
  id: string;
  kind: "control" | "finding" | "work-item";
  action: string;
  priority: number;
  state: string;
  title: string;
  ruleId: string;
  ruleName: string;
  findingId: string;
  targetControlRef: string;
  owner: string;
  dueDate: string;
  reason: string;
  updatedAt: string;
  evidenceIntegrity?: "verified" | "broken" | "legacy-unverified";
  linkedEvidenceCount?: number;
};

const clean = (value: unknown) => String(value ?? "").trim();
const time = (value: unknown) => {
  const parsed = new Date(clean(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const sortTime = (value: unknown) => {
  const parsed = time(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};
const isClosed = (status: string) => ["closed", "completed", "resolved", "rejected"].includes(clean(status).toLowerCase());
const severityWeights: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10 };
const severityWeight = (severity: string) => severityWeights[clean(severity).toLowerCase()] ?? 5;
const splitControlRefs = (value: string) => [...new Set(value.split(/[;,|\n]+/).map((entry) => entry.trim()).filter(Boolean))];

export function buildContinuousAssuranceDashboard(input: {
  rules: AssuranceRuleSnapshot[];
  findings: AssuranceFindingSnapshot[];
  workItems: AssuranceWorkSnapshot[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const nowTime = now.getTime();
  const ruleById = new Map(input.rules.map((rule) => [rule.id, rule]));
  const findingById = new Map(input.findings.map((finding) => [finding.id, finding]));

  const health = input.rules.map((rule) => {
    const baseHealth = controlHealth({
      enabled: rule.enabled,
      lastStatus: rule.lastStatus,
      lastEvidenceAt: rule.lastEvidenceAt,
      freshnessHours: rule.freshnessHours,
      consecutiveFailures: rule.consecutiveFailures,
    }, now);
    return {
      rule,
      health: rule.evidenceIntegrity === "broken" ? "integrity-failed" as const : baseHealth,
      freshness: evidenceFreshness(rule.lastEvidenceAt, rule.freshnessHours, now),
      due: Number.isFinite(time(rule.nextRunAt)) && time(rule.nextRunAt) <= nowTime,
    };
  });

  const openFindings = input.findings.filter((finding) => !isClosed(finding.status));
  const overdueRemediation = openFindings.filter((finding) => Number.isFinite(time(finding.dueDate)) && time(finding.dueDate) < nowTime);
  const mappedRules = input.rules.filter((rule) => splitControlRefs(rule.controlRefs).length > 0);
  const evidenceBacked = health.filter(({ freshness, rule }) => (freshness === "fresh" || freshness === "expiring") && rule.evidenceIntegrity !== "broken");
  const assuranceCoverage = input.rules.length
    ? Math.round(((mappedRules.length + evidenceBacked.length) / (input.rules.length * 2)) * 100)
    : 100;

  const priorities: AssurancePriority[] = [];

  for (const row of health) {
    if (!["integrity-failed", "failing", "stale", "missing", "expiring"].includes(row.health) && !row.due) continue;
    const refs = splitControlRefs(row.rule.controlRefs);
    const severity = row.health === "integrity-failed" ? 90 : row.health === "failing" ? 80 : row.health === "missing" ? 70 : row.health === "stale" ? 60 : row.due ? 45 : 35;
    priorities.push({
      id: `rule:${row.rule.id}`,
      kind: "control",
      action: "",
      priority: severity,
      state: row.health,
      title: row.rule.name,
      ruleId: row.rule.id,
      ruleName: row.rule.name,
      findingId: "",
      targetControlRef: refs[0] || "",
      owner: "",
      dueDate: clean(row.rule.nextRunAt),
      reason: row.health === "integrity-failed" ? "evidence-integrity-failed" : row.health === "failing" ? "control-failing" : row.health === "missing" ? "evidence-missing" : row.health === "stale" ? "evidence-stale" : row.due ? "test-due" : "evidence-expiring",
      updatedAt: clean(row.rule.lastEvidenceAt || row.rule.nextRunAt),
      evidenceIntegrity: row.rule.evidenceIntegrity,
      linkedEvidenceCount: row.rule.linkedEvidenceCount,
    });
  }

  for (const finding of openFindings) {
    const rule = ruleById.get(finding.ruleId);
    const overdue = Number.isFinite(time(finding.dueDate)) && time(finding.dueDate) < nowTime;
    priorities.push({
      id: `finding:${finding.id}`,
      kind: "finding",
      action: "",
      priority: 50 + severityWeight(finding.severity) + (overdue ? 20 : 0),
      state: overdue ? "overdue-remediation" : finding.status,
      title: finding.title,
      ruleId: finding.ruleId,
      ruleName: rule?.name || finding.ruleId,
      findingId: finding.id,
      targetControlRef: splitControlRefs(rule?.controlRefs || "")[0] || "",
      owner: finding.owner,
      dueDate: finding.dueDate,
      reason: overdue ? "remediation-overdue" : "open-finding",
      updatedAt: finding.dueDate,
      evidenceIntegrity: rule?.evidenceIntegrity,
      linkedEvidenceCount: rule?.linkedEvidenceCount,
    });
  }

  for (const work of input.workItems) {
    if (["completed", "rejected"].includes(work.status)) continue;
    const rule = ruleById.get(work.ruleId);
    const finding = findingById.get(work.findingId);
    const stateWeight = work.status === "failed-retest" ? 100 : work.status === "retest-error" ? 95 : work.status === "pending-review" ? 75 : work.status === "approved-awaiting-retest" ? 65 : 40;
    priorities.push({
      id: `work:${work.id}`,
      kind: "work-item",
      action: work.action,
      priority: stateWeight,
      state: work.status,
      title: work.action === "control-retest" ? `Retest · ${finding?.title || rule?.name || work.findingId}` : `CAPA · ${finding?.title || rule?.name || work.findingId}`,
      ruleId: work.ruleId,
      ruleName: rule?.name || work.ruleId,
      findingId: work.findingId,
      targetControlRef: clean(work.targetControlRef) || splitControlRefs(rule?.controlRefs || "")[0] || "",
      owner: finding?.owner || "",
      dueDate: finding?.dueDate || "",
      reason: work.status,
      updatedAt: work.updatedAt,
      evidenceIntegrity: rule?.evidenceIntegrity,
      linkedEvidenceCount: rule?.linkedEvidenceCount,
    });
  }

  priorities.sort((a, b) => b.priority - a.priority || sortTime(a.dueDate) - sortTime(b.dueDate) || b.updatedAt.localeCompare(a.updatedAt));

  return {
    summary: {
      totalControls: input.rules.length,
      healthy: health.filter((item) => item.health === "healthy").length,
      failing: health.filter((item) => item.health === "failing" || item.health === "integrity-failed").length,
      integrityFailures: health.filter((item) => item.health === "integrity-failed").length,
      stale: health.filter((item) => item.health === "stale" || item.health === "missing").length,
      expiring: health.filter((item) => item.health === "expiring").length,
      due: health.filter((item) => item.due).length,
      openFindings: openFindings.length,
      overdueRemediation: overdueRemediation.length,
      pendingReview: input.workItems.filter((item) => item.status === "pending-review").length,
      awaitingRetest: input.workItems.filter((item) => item.status === "approved-awaiting-retest").length,
      failedRetest: input.workItems.filter((item) => item.status === "failed-retest" || item.status === "retest-error").length,
      assuranceCoverage,
    },
    priorities: priorities.slice(0, 100),
    generatedAt: now.toISOString(),
  };
}
