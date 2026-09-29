import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";

type Env = Record<string, unknown> & { DB: D1Database };
type SourceRow = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  enabled: number;
  last_test_status: string | null;
  last_test_at: string | null;
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
  trigger_type: string | null;
  error_code: string | null;
  created_at: string;
};

type ConnectorHealth = {
  sourceId: string;
  sourceName: string;
  vendor: string;
  category: string;
  activeRules: number;
  healthyRules: number;
  unhealthyRules: number;
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

const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

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

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Env;
  const now = new Date();
  const nowIso = now.toISOString();
  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const [sourceResult, ruleResult, runResult] = await Promise.all([
      runtime.DB.prepare(`
        SELECT id,name,vendor,category,enabled,last_test_status,last_test_at
        FROM evidence_automation_sources
        ORDER BY name
      `).all<SourceRow>(),
      runtime.DB.prepare(`
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
      runtime.DB.prepare(`
        SELECT id,rule_id,status,duration_ms,trigger_type,error_code,created_at
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

    const connectors: ConnectorHealth[] = enabledSources.map((source) => {
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

    return json({
      generatedAt: nowIso,
      windowHours: 24,
      summary: {
        enabledSources: enabledSources.length,
        operationalRules: operationalRules.length,
        healthyRules: operationalRules.filter((rule) => rule.health === "healthy").length,
        unhealthyRules: operationalRules.filter((rule) => ["failing", "stale", "missing"].includes(String(rule.health || ""))).length,
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
    });
  } catch {
    return json({
      generatedAt: nowIso,
      windowHours: 24,
      available: false,
      summary: null,
      connectors: [],
    });
  }
}
