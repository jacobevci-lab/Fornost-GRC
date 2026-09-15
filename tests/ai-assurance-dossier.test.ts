import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalJson, dossierDomain, dossierWindow } from "../app/ai/assurance-dossier";

test("assurance dossier validates fixed audit windows and deterministic canonical JSON", () => {
  assert.equal(dossierWindow("30"), 30);
  assert.equal(dossierWindow("365"), 365);
  assert.throws(() => dossierWindow("31"));
  assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 1 } }), '{"a":{"b":1,"d":2},"z":1}');
});

test("assurance dossier domain distinguishes ready, attention and missing evidence", () => {
  const make = (rows: Record<string, unknown>[]) => dossierDomain({ key: "evidence", label: "Evidence", rows, current: (row) => row.current === true, dateKey: "date" });
  assert.equal(make([]).state, "missing");
  assert.equal(make([{ id: "old", current: false, date: "2026-01-01" }]).state, "attention");
  assert.equal(make([{ id: "ok", current: true, date: "2026-02-01" }]).state, "ready");
});

test("Admin assurance dossier is bounded, privacy-safe, hashed and audited", async () => {
  const [route, ui, css, readme, architecture] = await Promise.all([
    readFile("app/api/ai/dossier/route.ts", "utf8"),
    readFile("app/fornost-ai-portfolio.tsx", "utf8"),
    readFile("app/fornost-ai-portfolio.css", "utf8"),
    readFile("README.md", "utf8"),
    readFile("docs/AI-ARCHITECTURE.md", "utf8"),
  ]);
  assert.match(route, /requireRole\(req, \["Admin"\]\)/);
  assert.match(route, /LIMIT 200/);
  assert.match(route, /sha256Json/);
  assert.match(route, /assurance-dossier-export/);
  assert.match(route, /ai_exceptions/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.doesNotMatch(route, /callAiProvider|runProviderChain/);
  assert.match(ui, /Denetim güvence dosyası/);
  assert.match(ui, /Hash doğrulamalı JSON/);
  assert.match(css, /dossier-controls/);
  assert.match(readme, /SHA-256 bütünlük özetli JSON denetim dosyası/);
  assert.match(architecture, /digest proves file integrity, not regulatory certification/);
});
