import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import {
  EXECUTIVE_METRIC_DEFINITIONS,
  EXECUTIVE_METRIC_KEYS,
  buildExecutiveMetricTrends,
  isExecutiveMetricKey,
  metricSnapshotDay,
  normalizeMetricPeriod,
  validateExecutiveMetricValue,
  type ExecutiveMetricSnapshot,
} from "../../executive-metric-history";

type Env = Record<string, unknown> & { DB: D1Database };
type MetricInput = { key?: unknown; value?: unknown };
type MetricRow = {
  metric_key: string;
  snapshot_day: string;
  metric_value: number;
  unit: string;
  captured_at: string;
};

const SCOPE = "enterprise";
const RETENTION_DAYS = 400;
const schema = [
  `CREATE TABLE IF NOT EXISTS executive_metric_snapshots(
    scope_id TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    snapshot_day TEXT NOT NULL,
    metric_value REAL NOT NULL,
    unit TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    captured_by TEXT NOT NULL,
    PRIMARY KEY(scope_id, metric_key, snapshot_day)
  )`,
  `CREATE INDEX IF NOT EXISTS executive_metric_snapshots_scope_day_idx
    ON executive_metric_snapshots(scope_id, snapshot_day, metric_key)`,
];

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Env;
}

async function ready(db: D1Database) {
  for (const sql of schema) await db.prepare(sql).run();
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

function retentionStart(now = new Date()) {
  return metricSnapshotDay(now.getTime() - RETENTION_DAYS * 86_400_000);
}

function historyStart(now = new Date()) {
  return metricSnapshotDay(now.getTime() - (RETENTION_DAYS + 20) * 86_400_000);
}

async function loadHistory(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT metric_key,snapshot_day,metric_value,unit,captured_at
       FROM executive_metric_snapshots
       WHERE scope_id=? AND snapshot_day>=?
       ORDER BY snapshot_day DESC,metric_key`,
    )
    .bind(SCOPE, historyStart())
    .all<MetricRow>();
  return result.results
    .filter((row) => isExecutiveMetricKey(row.metric_key))
    .map(
      (row): ExecutiveMetricSnapshot => ({
        metricKey: row.metric_key as ExecutiveMetricSnapshot["metricKey"],
        snapshotDay: row.snapshot_day,
        value: Number(row.metric_value),
        unit: EXECUTIVE_METRIC_DEFINITIONS[row.metric_key as ExecutiveMetricSnapshot["metricKey"]].unit,
        capturedAt: row.captured_at,
      }),
    );
}

async function responsePayload(db: D1Database, period: 30 | 90 | 365) {
  const snapshots = await loadHistory(db);
  const trends = buildExecutiveMetricTrends(snapshots, period);
  return {
    scope: SCOPE,
    periodDays: period,
    retentionDays: RETENTION_DAYS,
    historyStarted: snapshots.length ? snapshots.reduce((oldest, item) => (item.snapshotDay < oldest ? item.snapshotDay : oldest), snapshots[0].snapshotDay) : null,
    snapshotDays: new Set(snapshots.map((item) => item.snapshotDay)).size,
    trends,
  };
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const env = await runtime();
  await ready(env.DB);
  return json(await responsePayload(env.DB, normalizeMetricPeriod(req.nextUrl.searchParams.get("period"))));
}

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 32_768) return json({ error: "İstek boyutu çok büyük." }, 413);
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  const body = (await req.json().catch(() => ({}))) as { metrics?: unknown; period?: unknown };
  if (!Array.isArray(body.metrics) || body.metrics.length > EXECUTIVE_METRIC_KEYS.length) return json({ error: "Geçersiz yönetici metrik paketi." }, 400);

  const metrics = (body.metrics as MetricInput[])
    .map((item) => {
      if (!isExecutiveMetricKey(item.key)) return null;
      const value = validateExecutiveMetricValue(item.key, item.value);
      if (value === null) return null;
      return { key: item.key, value, definition: EXECUTIVE_METRIC_DEFINITIONS[item.key] };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (!metrics.length) return json({ error: "Kaydedilebilir metrik bulunamadı." }, 400);

  const env = await runtime();
  await ready(env.DB);
  const now = new Date();
  const capturedAt = now.toISOString();
  const snapshotDay = metricSnapshotDay(now);
  const statements = metrics.map((metric) =>
    env.DB
      .prepare(
        `INSERT INTO executive_metric_snapshots(scope_id,metric_key,snapshot_day,metric_value,unit,captured_at,captured_by)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(scope_id,metric_key,snapshot_day) DO UPDATE SET
           metric_value=excluded.metric_value,
           unit=excluded.unit,
           captured_at=excluded.captured_at,
           captured_by=excluded.captured_by`,
      )
      .bind(SCOPE, metric.key, snapshotDay, metric.value, metric.definition.unit, capturedAt, access.actor.email),
  );
  if (statements.length) await env.DB.batch(statements);
  await env.DB.prepare("DELETE FROM executive_metric_snapshots WHERE scope_id=? AND snapshot_day<?").bind(SCOPE, retentionStart(now)).run();

  return json({ captured: metrics.length, snapshotDay, ...(await responsePayload(env.DB, normalizeMetricPeriod(body.period))) });
}
