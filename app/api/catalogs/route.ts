import { NextRequest, NextResponse } from "next/server";
import { catalogKeys, defaultCatalogs, isCatalogKey, type CatalogMap } from "../../catalogs";
import { requireRole } from "../auth/security";

const catalogTable = `CREATE TABLE IF NOT EXISTS grc_catalog_values (
  catalog TEXT NOT NULL, value TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, PRIMARY KEY(catalog,value))`;
const catalogMeta = `CREATE TABLE IF NOT EXISTS grc_catalog_metadata (
  key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`;

async function catalogDb() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([env.DB.prepare(catalogTable), env.DB.prepare(catalogMeta)]);
  return env.DB;
}

async function initialize(db: Awaited<ReturnType<typeof catalogDb>>) {
  const marker = await db.prepare("SELECT value FROM grc_catalog_metadata WHERE key='catalogs_v1'").first();
  if (marker) return;
  const now = new Date().toISOString(), statements: ReturnType<typeof db.prepare>[] = [];
  for (const key of catalogKeys) {
    defaultCatalogs[key].forEach((value, index) => statements.push(
      db.prepare("INSERT OR IGNORE INTO grc_catalog_values(catalog,value,sort_order,created_at) VALUES(?,?,?,?)")
        .bind(key, value, index, now),
    ));
  }
  statements.push(db.prepare("INSERT OR REPLACE INTO grc_catalog_metadata(key,value,updated_at) VALUES('catalogs_v1','1',?)").bind(now));
  for (let i = 0; i < statements.length; i += 75) await db.batch(statements.slice(i, i + 75));
}

export function validCatalogValue(value: unknown) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 100;
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor", "Viewer"]); if (auth.response) return auth.response;
  const db = await catalogDb(); await initialize(db);
  const result = await db.prepare("SELECT catalog,value FROM grc_catalog_values ORDER BY catalog,sort_order,value").all<{catalog:string;value:string}>();
  const catalogs = Object.fromEntries(catalogKeys.map(key => [key, []])) as CatalogMap;
  result.results.forEach(row => { if (isCatalogKey(row.catalog)) catalogs[row.catalog].push(row.value); });
  return NextResponse.json({ catalogs });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body || !isCatalogKey(body.catalog) || !validCatalogValue(body.value)) return NextResponse.json({ error: "Geçersiz liste veya değer." }, { status: 400 });
  const value = body.value.trim(), db = await catalogDb(); await initialize(db);
  const duplicate = await db.prepare("SELECT value FROM grc_catalog_values WHERE catalog=? AND lower(value)=lower(?)").bind(body.catalog, value).first();
  if (duplicate) return NextResponse.json({ error: "Bu değer listede zaten mevcut." }, { status: 409 });
  const order = await db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 next_order FROM grc_catalog_values WHERE catalog=?").bind(body.catalog).first<{next_order:number}>();
  await db.prepare("INSERT INTO grc_catalog_values(catalog,value,sort_order,created_at) VALUES(?,?,?,?)").bind(body.catalog, value, order?.next_order || 0, new Date().toISOString()).run();
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  const catalog = req.nextUrl.searchParams.get("catalog"), value = req.nextUrl.searchParams.get("value");
  if (!isCatalogKey(catalog) || !validCatalogValue(value)) return NextResponse.json({ error: "Geçersiz liste veya değer." }, { status: 400 });
  const db = await catalogDb(); await initialize(db);
  const count = await db.prepare("SELECT COUNT(*) total FROM grc_catalog_values WHERE catalog=?").bind(catalog).first<{total:number}>();
  if (Number(count?.total || 0) <= 1) return NextResponse.json({ error: "Listede en az bir değer kalmalıdır." }, { status: 409 });
  await db.prepare("DELETE FROM grc_catalog_values WHERE catalog=? AND value=?").bind(catalog, value).run();
  return NextResponse.json({ ok: true });
}
