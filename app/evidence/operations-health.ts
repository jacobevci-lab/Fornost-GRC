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
  health: string | null;
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

  const [sourceResult, ruleResult, runResult] = await Promise.all([
    db.prepare(`
      SELECT id,name,vendor,category,enabled
      FROM evidence_automation_sources
      ORDER BY name
    `).all<SourceRow>(),
    db.prepare(`
      SELECT id,name,source_id,enabled,last_status,last_run_at,last_evidence_at,next_run_at,freshness_hours,
        CASE
          WHEN enabled=0 THEN 'disabled'
          WHEN last_run_at IS NULL THEN 'missing'
          WHEN last_status IN ('fail','error') THEN 'failing'
          WHEN last_evidence_at IS NULL THEN 'missing'
          WHEN datetime(last_evidence_at, '+' || freshness_hours || ' hours') < datetime(?) THEN 'stale'
          ELSE 'healthy'
        END AS health
      FROM evidence_automation_rules
    `).bind(nowIso).all<RuleRow>(),
    db.prepare(`
      SELECT id,rule_id,status,duration_ms,created_at
      FROM evidence_automation_runs
      WHERE created_at>=?
      ORDER BY created_at DESC
      LIMIT 5000
    `).bind(sinceIso).all<RunRow>(),
  ]);

  const enabledSources = sourceResult.results.filter((source) => Boolean(source.enabled));
  const enabledSourceIds = new Set(enabledSources.map((source) => source.id));
  const operationalRules = ruleResult.results.filter((rule) => Boolean(rule.enabled) && enabledSourceIds.has(rule.source_id));
  const operationalRuleIds = new Set(operationalRules.map((rule) => rule.id));
  const operationalRuns = runResult.results.filter((run) => operationalRuleIds.has(run.rule_id));

  const connectors: ContinuousAssuranceConnectorHealth[] = enabledSources.map((source) => {
    const sourceRules = operationalRules.filter((rule) => rule.source_id === source.id);
    const sourceRuleIds = new Set(sourceRules.map((rule) => rule.id));
    const sourceRuns = operationalRuns.filter((run) => sourceRuleIds.has(run.rule_id));
    const passRuns = sourceRuns.filter((run) => run.status === "pass").length;
    const failRuns = sourceRuns.filter((run) => run.status === "fail").length;
    const errorRuns = sourceRuns.filter((run) => run.status === "error").length;
    const durations = sourceRuns
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
      unhealthyRules: sourceRules.filter((rule) => ["failing", "stale", "missing"].includes(String(rule.health || ""))).length,
      controlFailingRules: sourceRules.filter((rule) => rule.last_status === "fail").length,
      collectionErrorRules: sourceRules.filter((rule) => rule.last_status === "error").length,
      dueRules: sourceRules.filter((rule) => !rule.next_run_at || timestamp(rule.next_run_at) <= now.getTime()).length,
      evidenceReadyRules: sourceRules.filter((rule) => Boolean(rule.last_evidence_at)).length,
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
    .map((run) => Number(run.duration_ms))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);

  return {
    generatedAt: nowIso,
    windowHours: 24,
    summary: {
      enabledSources: enabledSources.length,
      operationalRules: operationalRules.length,
      healthyRules: operationalRules.filter((rule) => rule.health === "healthy").length,
      unhealthyRules: operationalRules.filter((rule) => ["failing", "stale", "missing"].includes(String(rule.health || ""))).length,
      controlFailingRules: operationalRules.filter((rule) => rule.last_status === "fail").length,
      collectionErrorRules: operationalRules.filter((rule) => rule.last_status === "error").length,
      dueRules: operationalRules.filter((rule) => !rule.next_run_at || timestamp(rule.next_run_at) <= now.getTime()).length,
      evidenceReadyRules: operationalRules.filter((rule) => Boolean(rule.last_evidence_at)).length,
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
