import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { ensureCoreGrcSchemaCompatibility } from "../app/api/grc/schema-compat";
import { demoSeeds } from "../app/api/grc/demo-seeds";
import type { AccessSubject } from "../app/module-access";

type Response = { status: number; body: { rows: Array<{ id: string; record_code: string }>; nextCursor: string | null; restored: number; removed: number; code: string } };
async function fixture(demoMode = false) {
  const sqlite = new DatabaseSync(":memory:");
  let actor: AccessSubject = { role: "Viewer" };
  type Value = string | number | null;
  function prepare(sql: string, values: Value[] = []) {
    return {
      bind(...args: Value[]) { return prepare(sql, args); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return this.exec(); },
      exec() { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
    };
  }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec("BEGIN");
    try { const result = statements.map(s => s.exec()); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
  await ensureCoreGrcSchemaCompatibility(db as unknown as D1Database);
  function load(path: string) {
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = createRequire(resolve(path)), exports: Record<string, (req: unknown) => Promise<Response>> = {};
    const require = (name: string) => {
      if (name === "next/server") return { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } };
      if (name === "cloudflare:workers") return { env: { DB: db, FORNOST_DEMO_MODE: String(demoMode) } };
      if (name.endsWith("/auth/security")) return { requireRole: async (_req: unknown, roles: string[]) => roles.includes(actor.role) ? { actor } : { response: { status: 403, body: {} } } };
      return localRequire(name);
    };
    // Same real-handler/platform-adapter approach as enterprise-route-fixture.
    new Function("require", "exports", compiled)(require, exports);
    return exports;
  }
  const route = load("app/api/grc/route.ts"), demo = load("app/api/grc/demo/route.ts");
  const request = (query = "", body = {}) => ({ headers: new Headers(), nextUrl: new URL(`https://fixture.test/api/grc${query ? "?" + query : ""}`), json: async () => body, text: async () => JSON.stringify(body) });
  const snapshot = () => ["simple_grc_records", "simple_audits", "simple_grc_metadata", "simple_grc_record_codes", "simple_grc_record_code_counters"].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const add = (id: string, module = "Kontroller", data: Record<string, unknown> = {}) => sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,?,?,?,?)").run(id, module, JSON.stringify(data), "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z");
  return { sqlite, add, snapshot, setActor: (value: AccessSubject) => { actor = value; },
    get: (query = "") => route.GET(request(query)),
    post: (body: Record<string, unknown>) => route.POST(request("", body)),
    restore: () => demo.POST(request()), remove: () => demo.DELETE(request("", { confirmation: "ÖRNEKLERİ KALDIR" })),
  };
}

for (const enabled of [false, true]) test(`empty listing never seeds or marks an installation (demo=${enabled})`, async () => {
  const f = await fixture(enabled);
  try {
    const before = f.snapshot();
    for (const role of ["Viewer", "Editor", "Admin"]) {
      f.setActor({ role });
      const response = await f.get();
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.rows, []);
      assert.deepEqual(f.snapshot(), before);
    }
  } finally { f.sqlite.close(); }
});

test("write-time codes reserve uncoded legacy IDs and preserve reference uniqueness", async () => {
  for (const [legacy, next] of [["CTL-001", "CTL-002"], ["ctl-007", "CTL-008"]]) {
    const f = await fixture();
    try {
      f.add(legacy);
      const before = f.snapshot();
      await f.get(); assert.deepEqual(f.snapshot(), before);
      f.setActor({ role: "Editor" });
      const created = await f.post({ module: "Kontroller", data: {
        controlRef: "A.5.1", controlTitle: "New control", owner: "Owner", frequency: "Aylık", implementation: "Uygulanıyor", status: "Aktif",
      } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.code, next);
      const evidence = await f.post({ module: "Kanıtlar", data: {
        evidenceTitle: "Legacy control evidence", controlRef: legacy, owner: "Owner", period: "2026", status: "Taslak",
      } });
      assert.equal(evidence.status, 201, JSON.stringify(evidence.body));
      assert.equal((await f.get()).body.rows.find(r => r.id === legacy)?.record_code, legacy);
    } finally { f.sqlite.close(); }
  }
});

test("legacy markers, SOC2 prefixes, audit names and missing codes cannot trigger read-time mutations", async () => {
  for (const marked of [false, true]) {
    const f = await fixture();
    try {
      f.add("SOC2-AUD-real"); f.add("SOC2-CTL-real"); f.add("REAL-001");
      f.add(demoSeeds[0][0], demoSeeds[0][1], { title: "User-edited sample" });
      f.sqlite.exec("INSERT INTO simple_audits VALUES('audit','SOC 2 Type II – 2026','ODINE real template','Internal','Auditor','Owner','Open','now','now')");
      f.sqlite.exec("INSERT INTO simple_grc_record_codes VALUES('REAL-001','Kontroller','CTL-070','now')");
      f.sqlite.exec("INSERT INTO simple_grc_record_code_counters VALUES('Kontroller',70,'now')");
      if (marked) f.sqlite.exec("INSERT INTO simple_grc_metadata VALUES('demo_seed_initialized','1','now')");
      const before = f.snapshot(), response = await f.get();
      assert.equal(response.body.rows.length, 4);
      assert.equal(response.body.rows.find(r => r.id === "REAL-001")?.record_code, "CTL-070");
      assert.equal(response.body.rows.find(r => r.id === "SOC2-AUD-real")?.record_code, "SOC2-AUD-real");
      assert.deepEqual(f.snapshot(), before);
      await f.get(); assert.deepEqual(f.snapshot(), before);
    } finally { f.sqlite.close(); }
  }
});

test("explicit sample lifecycle remains Admin-only, idempotent and persistent after listing", async () => {
  const f = await fixture();
  try {
    f.add("SOC2-AUD-real");
    assert.equal((await f.restore()).status, 403);
    assert.equal((await f.remove()).status, 403);
    f.setActor({ role: "Admin" });
    assert.equal((await f.restore()).body.restored, 32);
    assert.equal((await f.restore()).body.restored, 0);
    assert.equal((await f.remove()).body.removed, 32);
    assert.equal((await f.remove()).body.removed, 0);
    f.setActor({ role: "Viewer" });
    const before = f.snapshot();
    assert.deepEqual((await f.get()).body.rows.map(r => r.id), ["SOC2-AUD-real"]);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.sqlite.close(); }
});

test("scoped pagination and invalid cursors remain read-only", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 5002; i++) f.add(`CTL-${String(i).padStart(5, "0")}`);
    f.add("AST-hidden", "Varlık Envanteri");
    f.setActor({ role: "Viewer", moduleAccess: { mode: "scoped", modules: { Kontroller: "read" } } });
    const before = f.snapshot(), first = await f.get();
    assert.equal(first.body.rows.length, 5000);
    assert.ok(first.body.nextCursor);
    const second = await f.get(new URLSearchParams({ cursor: first.body.nextCursor! }).toString());
    assert.equal(second.body.rows.length, 2);
    assert.equal(second.body.nextCursor, null);
    assert.equal(new Set([...first.body.rows, ...second.body.rows].map(r => r.id)).size, 5002);
    assert.equal((await f.get("cursor=bad")).status, 400);
    f.setActor({ role: "Viewer", moduleAccess: { mode: "scoped", modules: {} } });
    assert.deepEqual((await f.get()).body.rows, []);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.sqlite.close(); }
});
