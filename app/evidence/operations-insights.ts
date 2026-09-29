import type {
  ContinuousAssuranceConnectorHealth,
  ContinuousAssuranceOperationsHealth,
} from "./operations-health";

export type ContinuousAssuranceOperationalState = "healthy" | "watch" | "critical" | "idle";
export type ContinuousAssuranceInsightCode =
  | "connector-errors"
  | "control-health"
  | "evidence-gap"
  | "due-backlog"
  | "no-active-rules";

export type ContinuousAssuranceOperationalInsight = {
  sourceId: string;
  sourceName: string;
  vendor: string;
  category: string;
  state: ContinuousAssuranceOperationalState;
  code: ContinuousAssuranceInsightCode;
  title: string;
  detail: string;
  affectedRules: number;
  evidenceGap: number;
  dueRules: number;
  errorRuns24h: number;
  successRate24h: number | null;
};

export type ContinuousAssuranceOperationsInsights = {
  generatedAt: string;
  windowHours: 24;
  state: ContinuousAssuranceOperationalState;
  summary: {
    enabledSources: number;
    operationalRules: number;
    healthyConnectors: number;
    watchConnectors: number;
    criticalConnectors: number;
    idleConnectors: number;
    attentionConnectors: number;
    evidenceGapRules: number;
    dueRules: number;
    errorRuns24h: number;
  };
  connectors: Array<ContinuousAssuranceConnectorHealth & {
    state: ContinuousAssuranceOperationalState;
    reasons: ContinuousAssuranceInsightCode[];
    evidenceGap: number;
  }>;
  insights: ContinuousAssuranceOperationalInsight[];
};

const rank: Record<ContinuousAssuranceOperationalState, number> = {
  critical: 0,
  watch: 1,
  idle: 2,
  healthy: 3,
};

function evidenceGap(connector: ContinuousAssuranceConnectorHealth) {
  return Math.max(0, connector.activeRules - connector.evidenceReadyRules);
}

export function deriveContinuousAssuranceConnectorState(connector: ContinuousAssuranceConnectorHealth) {
  const reasons: ContinuousAssuranceInsightCode[] = [];
  const gap = evidenceGap(connector);

  if (connector.activeRules === 0) reasons.push("no-active-rules");
  if (connector.errorRuns24h > 0) reasons.push("connector-errors");
  if (connector.unhealthyRules > 0) reasons.push("control-health");
  if (gap > 0) reasons.push("evidence-gap");
  if (connector.dueRules > 0) reasons.push("due-backlog");

  const state: ContinuousAssuranceOperationalState = connector.activeRules === 0
    ? "idle"
    : connector.errorRuns24h > 0 || connector.unhealthyRules > 0
      ? "critical"
      : gap > 0 || connector.dueRules > 0
        ? "watch"
        : "healthy";

  return { ...connector, state, reasons, evidenceGap: gap };
}

function insightFor(
  connector: ReturnType<typeof deriveContinuousAssuranceConnectorState>,
  code: ContinuousAssuranceInsightCode,
): ContinuousAssuranceOperationalInsight {
  const common = {
    sourceId: connector.sourceId,
    sourceName: connector.sourceName,
    vendor: connector.vendor,
    category: connector.category,
    state: connector.state,
    code,
    affectedRules: connector.unhealthyRules,
    evidenceGap: connector.evidenceGap,
    dueRules: connector.dueRules,
    errorRuns24h: connector.errorRuns24h,
    successRate24h: connector.successRate24h,
  };

  if (code === "connector-errors") return {
    ...common,
    title: "Connector execution errors detected",
    detail: `${connector.errorRuns24h} connector execution error(s) were recorded in the last 24 hours.`,
  };
  if (code === "control-health") return {
    ...common,
    title: "Continuous controls need attention",
    detail: `${connector.unhealthyRules} active rule(s) are failing, stale, or missing evidence.`,
  };
  if (code === "evidence-gap") return {
    ...common,
    title: "Evidence coverage is incomplete",
    detail: `${connector.evidenceGap} active rule(s) do not yet have evidence.`,
  };
  if (code === "due-backlog") return {
    ...common,
    title: "Continuous controls are due",
    detail: `${connector.dueRules} active rule(s) are due for execution.`,
  };
  return {
    ...common,
    title: "Connector has no active continuous controls",
    detail: "The connector is enabled but no active Continuous Control Rule is attached.",
  };
}

export function buildContinuousAssuranceOperationsInsights(
  health: ContinuousAssuranceOperationsHealth,
): ContinuousAssuranceOperationsInsights {
  const connectors = health.connectors.map(deriveContinuousAssuranceConnectorState);
  const insights = connectors
    .flatMap((connector) => connector.reasons.map((code) => insightFor(connector, code)))
    .sort((a, b) => rank[a.state] - rank[b.state] || b.errorRuns24h - a.errorRuns24h || b.affectedRules - a.affectedRules || a.sourceName.localeCompare(b.sourceName));

  const criticalConnectors = connectors.filter((connector) => connector.state === "critical").length;
  const watchConnectors = connectors.filter((connector) => connector.state === "watch").length;
  const idleConnectors = connectors.filter((connector) => connector.state === "idle").length;
  const healthyConnectors = connectors.filter((connector) => connector.state === "healthy").length;
  const state: ContinuousAssuranceOperationalState = criticalConnectors
    ? "critical"
    : watchConnectors
      ? "watch"
      : connectors.length && idleConnectors === connectors.length
        ? "idle"
        : "healthy";

  return {
    generatedAt: health.generatedAt,
    windowHours: health.windowHours,
    state,
    summary: {
      enabledSources: health.summary.enabledSources,
      operationalRules: health.summary.operationalRules,
      healthyConnectors,
      watchConnectors,
      criticalConnectors,
      idleConnectors,
      attentionConnectors: criticalConnectors + watchConnectors,
      evidenceGapRules: connectors.reduce((total, connector) => total + connector.evidenceGap, 0),
      dueRules: health.summary.dueRules,
      errorRuns24h: health.summary.errorRuns24h,
    },
    connectors,
    insights,
  };
}
