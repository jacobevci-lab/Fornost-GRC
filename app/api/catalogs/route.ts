import { NextRequest, NextResponse } from "next/server";
import { catalogKeys, isCatalogKey, type CatalogMap } from "../../catalogs";
import {ensureCatalogs} from "../../catalog-store";
import { requireRole } from "../auth/security";

async function catalogDb() {
  const { env } = await import("cloudflare:workers");
  await ensureCatalogs(env.DB);
  return env.DB;
}

export function validCatalogValue(value: unknown) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 100;
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor", "Viewer"]); if (auth.response) return auth.response;
  const db = await catalogDb();
  const result = await db.prepare("SELECT catalog,value FROM grc_catalog_values ORDER BY catalog,sort_order,value").all<{catalog:string;value:string}>();
  const catalogs = Object.fromEntries(catalogKeys.map(key => [key, [] as string[]])) as unknown as CatalogMap;
  result.results.forEach(row => { if (isCatalogKey(row.catalog)) catalogs[row.catalog].push(row.value); });
  return NextResponse.json({ catalogs });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]); if (auth.response) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body || !isCatalogKey(body.catalog) || !validCatalogValue(body.value)) return NextResponse.json({ error: "Geçersiz liste veya değer." }, { status: 400 });
  const value = body.value.trim(), db = await catalogDb();
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
  const db = await catalogDb();
  const count = await db.prepare("SELECT COUNT(*) total FROM grc_catalog_values WHERE catalog=?").bind(catalog).first<{total:number}>();
  if (Number(count?.total || 0) <= 1) return NextResponse.json({ error: "Listede en az bir değer kalmalıdır." }, { status: 409 });
  await db.prepare("DELETE FROM grc_catalog_values WHERE catalog=? AND value=?").bind(catalog, value).run();
  return NextResponse.json({ ok: true });
}
