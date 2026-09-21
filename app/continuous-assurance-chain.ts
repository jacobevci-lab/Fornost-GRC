import type { ConnectedGrcLink, ConnectedGrcRow } from "./connected-grc-model";

export type AssuranceLifecycleState = "effective" | "degraded" | "ineffective" | "unknown";
export type AssuranceChainState = "complete" | "attention" | "broken";

export type ContinuousAssuranceChain = {
  rule: ConnectedGrcRow;
  assurance?: ConnectedGrcRow;
  controls: ConnectedGrcRow[];
  findings: ConnectedGrcRow[];
  remediations: ConnectedGrcRow[];
  risks: ConnectedGrcRow[];
  assuranceState: AssuranceLifecycleState;
  assuranceScore: number;
  freshness: string;
  health: string;
  openFindings: number;
  overdueRemediations: number;
  riskLinked: boolean;
  chainState: AssuranceChainState;
  escalationReasons: string[];
};

export type ContinuousAssuranceSummary = {
  rules: number;
  effective: number;
  degraded: number;
  ineffective: number;
  unknown: number;
  openFindings: number;
  overdueRemediations: number;
  riskLinked: number;
  completeChains: number;
  attentionChains: number;
  brokenChains: number;
  averageAssuranceScore: number;
};

const kind = (row: ConnectedGrcRow) => String(row.data.kind || "");
const status = (row: ConnectedGrcRow) => String(row.data.status || "").toLowerCase();
const text = (value: unknown) => String(value ?? "").trim().toLowerCase();
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function relatedRows(row: ConnectedGrcRow, relation: string, links: ConnectedGrcLink[]) {
  const result = new Map<string, ConnectedGrcRow>();
  for (const link of links) {
    if (link.relation !== relation) continue;
    if (link.source.id === row.id) result.set(link.target.id, link.target);
    else if (link.target.id === row.id) result.set(link.source.id, link.source);
  }
  return Array.from(result.values());
}

function dueDate(row: ConnectedGrcRow) {
  const raw = String(row.data.dueDate || row.data.due_date || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isClosed(row: ConnectedGrcRow) {
  return ["closed", "verified", "completed", "accepted"].includes(status(row));
}

function lifecycleState(row?: ConnectedGrcRow): AssuranceLifecycleState {
  const value = text(row?.data.assuranceState);
  return value === "effective" || value === "degraded" || value === "ineffective" ? value : "unknown";
}

function chainStateFor(input: {
  assuranceState: AssuranceLifecycleState;
  findings: ConnectedGrcRow[];
  remediations: ConnectedGrcRow[];
  risks: ConnectedGrcRow[];
  overdueRemediations: number;
}) {
  const reasons: string[] = [];
  if (input.assuranceState === "effective") return { state: "complete" as const, reasons };

  if (input.assuranceState === "unknown") reasons.push("assurance-state-unknown");
  if (!input.findings.length) reasons.push("finding-missing");
  if (input.findings.length && !input.remediations.length) reasons.push("remediation-missing");
  if (input.remediations.length && !input.risks.length) reasons.push("risk-link-missing");
  if (input.overdueRemediations > 0) reasons.push("remediation-overdue");

  if (input.assuranceState === "ineffective" && reasons.some((reason) => ["finding-missing", "remediation-missing", "risk-link-missing"].includes(reason))) {
    return { state: "broken" as const, reasons };
  }
  if (reasons.length || input.assuranceState === "degraded" || input.assuranceState === "ineffective") {
    return { state: "attention" as const, reasons };
  }
  return { state: "complete" as const, reasons };
}

export function buildContinuousAssuranceChains(rows: ConnectedGrcRow[], links: ConnectedGrcLink[], now = new Date()): ContinuousAssuranceChain[] {
  const rules = rows.filter((row) => kind(row) === "automation-rule");
  return rules.map((rule) => {
    const assurance = relatedRows(rule, "control-assurance", links).find((row) => kind(row) === "automation-assurance");
    const controls = Array.from(new Map([
      ...relatedRows(rule, "automation-control", links),
      ...(assurance ? relatedRows(assurance, "automation-control", links) : []),
    ].map((row) => [row.id, row])).values());
    const findings = assurance ? relatedRows(assurance, "assurance-finding", links).filter((row) => kind(row) === "automation-finding") : [];
    const remediations = findings.flatMap((finding) => relatedRows(finding, "finding-remediation", links).filter((row) => kind(row) === "automation-remediation"));
    const uniqueRemediations = Array.from(new Map(remediations.map((row) => [row.id, row])).values());
    const risks = uniqueRemediations.flatMap((remediation) => relatedRows(remediation, "remediation-risk", links).filter((row) => row.module === "Risk Assessment"));
    const uniqueRisks = Array.from(new Map(risks.map((row) => [row.id, row])).values());
    const assuranceState = lifecycleState(assurance);
    const assuranceScore = number(assurance?.data.assuranceScore, 0);
    const overdueRemediations = uniqueRemediations.filter((row) => {
      const due = dueDate(row);
      return !isClosed(row) && Boolean(due && due.getTime() < now.getTime());
    }).length;
    const evaluated = chainStateFor({ assuranceState, findings, remediations: uniqueRemediations, risks: uniqueRisks, overdueRemediations });

    return {
      rule,
      assurance,
      controls,
      findings,
      remediations: uniqueRemediations,
      risks: uniqueRisks,
      assuranceState,
      assuranceScore,
      freshness: text(assurance?.data.automationFreshness || rule.data.automationFreshness),
      health: text(assurance?.data.automationHealth || rule.data.automationHealth),
      openFindings: findings.filter((row) => !isClosed(row)).length,
      overdueRemediations,
      riskLinked: uniqueRisks.length > 0,
      chainState: evaluated.state,
      escalationReasons: evaluated.reasons,
    };
  });
}

export function summarizeContinuousAssurance(chains: ContinuousAssuranceChain[]): ContinuousAssuranceSummary {
  const scoreTotal = chains.reduce((sum, chain) => sum + chain.assuranceScore, 0);
  return {
    rules: chains.length,
    effective: chains.filter((chain) => chain.assuranceState === "effective").length,
    degraded: chains.filter((chain) => chain.assuranceState === "degraded").length,
    ineffective: chains.filter((chain) => chain.assuranceState === "ineffective").length,
    unknown: chains.filter((chain) => chain.assuranceState === "unknown").length,
    openFindings: chains.reduce((sum, chain) => sum + chain.openFindings, 0),
    overdueRemediations: chains.reduce((sum, chain) => sum + chain.overdueRemediations, 0),
    riskLinked: chains.filter((chain) => chain.riskLinked).length,
    completeChains: chains.filter((chain) => chain.chainState === "complete").length,
    attentionChains: chains.filter((chain) => chain.chainState === "attention").length,
    brokenChains: chains.filter((chain) => chain.chainState === "broken").length,
    averageAssuranceScore: chains.length ? Math.round(scoreTotal / chains.length) : 100,
  };
}
