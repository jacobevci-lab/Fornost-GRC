import { controlHealth } from "./continuous-controls";

type SourceRow = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  enabled: number;
};

type RuleRow = {
  id: string;
  name: string;
  source_id: string;
  enabled: number;
  consecutive_failures: number;
  last_status: string | null;
  last_run_at: string | null;
  last_evidence_at: string | null;
  next_run_at: string | null;
  freshness_hours: number;
};

type RunRow = {
  id: string;
  rule_id: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
};

export type ContinuousAssuranceConnectorHealth = {
  sourceId: string;
  sourceName: string;
  vendor: string;
  category: string;
  activeRules: number;
  healthyRules: number;
  unhealthyRules: number;
  controlFailingRules: number;
  collectionErrorRules: number;
  dueRules: number;
  evidenceReadyRules: number;
  runs24h: number;
  passRuns24h: number;
  failRuns24h: number;
  errorRuns24h: number;
  successRate24h: number | null;
  averageDurationMs24h: number | null;
  p95DurationMs24h: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

export type ContinuousAssuranceOperationsHealth = {
  generatedAt: string;
  windowHours: 24;
  summary: {
    enabledSources: number;
    operationalRules: number;
    healthyRules: number;
    unhealthyRules: number;
    controlFailingRules: number;
    collectionErrorRules: number;
    dueRules: number;
    evidenceReadyRules: number;
    runs24h: number;
    passRuns24h: number;
    failRuns24h: number;
    errorRuns24h: number;
    successRate24h: number | null;
    averageDurationMs24h: number | null;
    p95DurationMs24h: number | null;
  };
  connectors: ContinuousAssuranceConnectorHealth[];
};

const timestamp = (value: string | null | undefined) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundedRate = (part: number, total: number) => total ? Math.round((part / total) * 1000) / 10 : null;

const percentile95 = (durations: number[]) => {
  if (!durations.length) return null;
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
};

export async function loadContinuousAssuranceOperationsHealth(
  db: D1Database,
  now = new Date(),
): Promise<ContinuousAssuranceOperationsHealth> {
  const nowIso = now.toISOString();
  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // A D1 batch supplies one coherent snapshot. Do not publish rates from a
  // silently truncated population: callers expose unavailable instead.
  const [sourceResult, ruleResult, runResult] = await db.batch([
    db.prepare(`SELECT id,name,vendor,category,enabled FROM evidence_automation_sources WHERE enabled=1 ORDER BY name,id LIMIT 10001`),
    db.prepare(`SELECT r.id,r.name,r.source_id,r.enabled,r.last_status,r.last_run_at,r.last_evidence_at,r.next_run_at,r.freshness_hours,r.consecutive_failures
      FROM evidence_automation_rules r JOIN evidence_automation_sources s ON s.id=r.source_id AND s.enabled=1 WHERE r.enabled=1 ORDER BY r.id LIMIT 10001`),
    db.prepare(`SELECT runs.id,runs.rule_id,runs.status,runs.duration_ms,runs.created_at
      FROM evidence_automation_runs runs
      JOIN evidence_automation_rules r ON r.id=runs.rule_id AND r.enabled=1
      JOIN evidence_automation_sources s ON s.id=r.source_id AND s.enabled=1
      WHERE julianday(runs.created_at)>=julianday(?) AND julianday(runs.created_at)<=julianday(?)
      ORDER BY julianday(runs.created_at) DESC,runs.id DESC LIMIT 5001`).bind(sinceIso,nowIso),
  ]);
  if (sourceResult.results.length > 10000 || ruleResult.results.length > 10000 || runResult.results.length > 5000) {
    throw new Error("Operations health exceeds the complete telemetry window; no partial health is published.");
  }
  const enabledSources = sourceResult.results as SourceRow[];
  const operationalRules = (ruleResult.results as RuleRow[]).map(rule => ({...rule,health:
    !rule.last_run_at || !Number.isFinite(Date.parse(rule.last_run_at)) || Date.parse(rule.last_run_at)>now.getTime()
      ? "unknown" : controlHealth({enabled:true,lastStatus:rule.last_status,lastEvidenceAt:rule.last_evidence_at,freshnessHours:rule.freshness_hours,consecutiveFailures:rule.consecutive_failures},now),
  }));
  const operationalRuns = runResult.results as RunRow[];

  const connectors: ContinuousAssuranceConnectorHealth[] = enabledSources.map((source) => {
    const sourceRules = operationalRules.filter((rule) => rule.source_id === source.id);
    const sourceRuleIds = new Set(sourceRules.map((rule) => rule.id));
    const sourceRuns = operationalRuns.filter((run) => sourceRuleIds.has(run.rule_id));
    const passRuns = sourceRuns.filter((run) => run.status === "pass").length;
    const failRuns = sourceRuns.filter((run) => run.status === "fail").length;
    const errorRuns = sourceRuns.filter((run) => run.status === "error").length;
    const durations = sourceRuns
      .filter((run) => run.duration_ms !== null)
      .map((run) => Number(run.duration_ms))
      .filter((duration) => Number.isFinite(duration) && duration >= 0);
    const latestRun = sourceRuns[0];

    return {
      sourceId: source.id,
      sourceName: source.name,
      vendor: source.vendor,
      category: source.category,
      activeRules: sourceRules.length,
      healthyRules: sourceRules.filter((rule) => rule.health === "healthy").length,
      unhealthyRules: sourceRules.filter((rule) => rule.health !== "healthy").length,
      controlFailingRules: sourceRules.filter((rule) => rule.last_status === "fail").length,
      collectionErrorRules: sourceRules.filter((rule) => rule.last_status === "error").length,
      dueRules: sourceRules.filter((rule) => !rule.next_run_at || timestamp(rule.next_run_at) <= now.getTime()).length,
      evidenceReadyRules: sourceRules.filter((rule) => ["healthy", "expiring"].includes(rule.health)).length,
      runs24h: sourceRuns.length,
      passRuns24h: passRuns,
      failRuns24h: failRuns,
      errorRuns24h: errorRuns,
      successRate24h: roundedRate(passRuns, sourceRuns.length),
      averageDurationMs24h: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      p95DurationMs24h: percentile95(durations),
      lastRunAt: latestRun?.created_at || null,
      lastRunStatus: latestRun?.status || null,
    };
  });

  const passRuns = operationalRuns.filter((run) => run.status === "pass").length;
  const failRuns = operationalRuns.filter((run) => run.status === "fail").length;
  const errorRuns = operationalRuns.filter((run) => run.status === "error").length;
  const durations = operationalRuns
    .filter((run) => run.duration_ms !== null)
      .map((run) => Number(run.duration_ms))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);

  return {
    generatedAt: nowIso,
    windowHours: 24,
    summary: {
      enabledSources: enabledSources.length,
      operationalRules: operationalRules.length,
      healthyRules: operationalRules.filter((rule) => rule.health === "healthy").length,
      unhealthyRules: operationalRules.filter((rule) => rule.health !== "healthy").length,
      controlFailingRules: operationalRules.filter((rule) => rule.last_status === "fail").length,
      collectionErrorRules: operationalRules.filter((rule) => rule.last_status === "error").length,
      dueRules: operationalRules.filter((rule) => !rule.next_run_at || timestamp(rule.next_run_at) <= now.getTime()).length,
      evidenceReadyRules: operationalRules.filter((rule) => ["healthy", "expiring"].includes(rule.health)).length,
      runs24h: operationalRuns.length,
      passRuns24h: passRuns,
      failRuns24h: failRuns,
      errorRuns24h: errorRuns,
      successRate24h: roundedRate(passRuns, operationalRuns.length),
      averageDurationMs24h: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      p95DurationMs24h: percentile95(durations),
    },
    connectors,
  };
}
