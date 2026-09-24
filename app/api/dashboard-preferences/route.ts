import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import {
  EXECUTIVE_DASHBOARD_PREFERENCES_SCHEMA_VERSION,
  normalizeExecutiveDashboardPreferences,
} from "../../executive-dashboard-preferences";

type Env = Record<string, unknown> & { DB: D1Database };
type PreferenceRow = { schema_version: number; preferences_json: string; updated_at: string };

const schema = [
  `CREATE TABLE IF NOT EXISTS dashboard_user_preferences(
    user_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    preferences_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS dashboard_user_preferences_updated_idx
    ON dashboard_user_preferences(updated_at)`,
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

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;

  const env = await runtime();
  await ready(env.DB);
  const row = await env.DB
    .prepare("SELECT schema_version,preferences_json,updated_at FROM dashboard_user_preferences WHERE user_id=?")
    .bind(access.actor.id)
    .first<PreferenceRow>();

  if (!row) {
    return json({
      preferences: null,
      schemaVersion: EXECUTIVE_DASHBOARD_PREFERENCES_SCHEMA_VERSION,
      updatedAt: null,
      source: "default",
    });
  }

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.preferences_json);
  } catch {
    // A damaged legacy payload is normalized to a safe default rather than breaking the dashboard.
  }

  return json({
    preferences: normalizeExecutiveDashboardPreferences(parsed),
    schemaVersion: EXECUTIVE_DASHBOARD_PREFERENCES_SCHEMA_VERSION,
    storedSchemaVersion: Number(row.schema_version) || 0,
    updatedAt: row.updated_at,
    source: "account",
  });
}

export async function PUT(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 16_384) {
    return json({ error: "Dashboard tercih paketi çok büyük." }, 413);
  }

  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const body = (await req.json().catch(() => null)) as { preferences?: unknown } | null;
  if (!body || !body.preferences || typeof body.preferences !== "object" || Array.isArray(body.preferences)) {
    return json({ error: "Geçersiz dashboard tercih paketi." }, 400);
  }

  const preferences = normalizeExecutiveDashboardPreferences(body.preferences);
  const env = await runtime();
  await ready(env.DB);
  const updatedAt = new Date().toISOString();
  await env.DB
    .prepare(
      `INSERT INTO dashboard_user_preferences(user_id,schema_version,preferences_json,updated_at,updated_by)
       VALUES(?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         schema_version=excluded.schema_version,
         preferences_json=excluded.preferences_json,
         updated_at=excluded.updated_at,
         updated_by=excluded.updated_by`,
    )
    .bind(
      access.actor.id,
      EXECUTIVE_DASHBOARD_PREFERENCES_SCHEMA_VERSION,
      JSON.stringify(preferences),
      updatedAt,
      access.actor.email,
    )
    .run();

  return json({
    preferences,
    schemaVersion: EXECUTIVE_DASHBOARD_PREFERENCES_SCHEMA_VERSION,
    updatedAt,
    source: "account",
  });
}
