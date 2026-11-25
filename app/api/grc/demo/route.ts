import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { demoSeeds, type DemoModule } from "../demo-seeds";

const recordsTable = `CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const metadataTable = `CREATE TABLE IF NOT EXISTS simple_grc_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const codesTable = `CREATE TABLE IF NOT EXISTS simple_grc_record_codes (record_id TEXT PRIMARY KEY,module TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`;
const countersTable = `CREATE TABLE IF NOT EXISTS simple_grc_record_code_counters (module TEXT PRIMARY KEY,value INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`;
const confirmation = "ÖRNEKLERİ KALDIR";

async function database() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(recordsTable),
    env.DB.prepare(metadataTable),
    env.DB.prepare(codesTable),
    env.DB.prepare(countersTable),
  ]);
  return env.DB;
}

function seedIds() {
  return demoSeeds.map(([id]) => id);
}

async function presentIds(db: Awaited<ReturnType<typeof database>>) {
  const ids = seedIds();
  const result = await db
    .prepare(`SELECT id FROM simple_grc_records WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<{ id: string }>();
  return new Set((result.results || []).map((row) => row.id));
}

export function demoInventory(present: ReadonlySet<string>) {
  const modules = {} as Record<DemoModule, { present: number; total: number }>;
  for (const [id, module] of demoSeeds) {
    modules[module] ||= { present: 0, total: 0 };
    modules[module].total += 1;
    if (present.has(id)) modules[module].present += 1;
  }
  return {
    present: demoSeeds.filter(([id]) => present.has(id)).length,
    total: demoSeeds.length,
    missing: demoSeeds.filter(([id]) => !present.has(id)).length,
    modules,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  const db = await database();
  return NextResponse.json(demoInventory(await presentIds(db)), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  const db = await database();
  const existing = await presentIds(db);
  const missing = demoSeeds.filter(([id]) => !existing.has(id));
  const now = new Date().toISOString();
  for (let index = 0; index < missing.length; index += 20) {
    await db.batch(
      missing.slice(index, index + 20).flatMap(([id, module, data]) => [
        db.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, module, JSON.stringify(data), now, now),
        db.prepare("INSERT OR IGNORE INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(?,?,?,?)").bind(id, module, id, now),
      ]),
    );
  }
  await db.prepare("INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) VALUES('demo_seed_initialized','1',?)").bind(now).run();
  return NextResponse.json({ ok: true, restored: missing.length, inventory: demoInventory(new Set(seedIds())) }, { status: missing.length ? 201 : 200 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 10_000) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const body = await req.json().catch(() => ({})) as { confirmation?: unknown };
  if (body.confirmation !== confirmation) return NextResponse.json({ error: `Onay ifadesi: ${confirmation}` }, { status: 400 });
  const db = await database();
  const present = await presentIds(db);
  const ids = [...present];
  for (let index = 0; index < ids.length; index += 50) {
    const part = ids.slice(index, index + 50);
    const placeholders = part.map(() => "?").join(",");
    await db.batch([
      db.prepare(`DELETE FROM simple_grc_record_codes WHERE record_id IN (${placeholders})`).bind(...part),
      db.prepare(`DELETE FROM simple_grc_records WHERE id IN (${placeholders})`).bind(...part),
    ]);
  }
  return NextResponse.json({ ok: true, removed: ids.length, inventory: demoInventory(new Set()) });
}
