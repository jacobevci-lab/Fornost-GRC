import {catalogKeys,defaultCatalogs} from "./catalogs";
const catalogTable = `CREATE TABLE IF NOT EXISTS grc_catalog_values (
  catalog TEXT NOT NULL, value TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, PRIMARY KEY(catalog,value))`;
const catalogMeta = `CREATE TABLE IF NOT EXISTS grc_catalog_metadata (
  key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`;

export async function ensureCatalogs(db:D1Database) {
  await db.batch([db.prepare(catalogTable),db.prepare(catalogMeta)]);
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
