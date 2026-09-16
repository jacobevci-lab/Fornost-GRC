import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalJson, dossierDomain, dossierSigningKeyId, dossierWindow, signDossierDigest, verifyDossierDigest } from "../app/ai/assurance-dossier";

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

test("assurance dossier seals are deterministic and reject altered digests", async () => {
  const secret="test-only-dossier-signing-key-0123456789abcdef", digest="a".repeat(64), signature=await signDossierDigest(digest,secret);
  assert.equal(await verifyDossierDigest(digest,signature,secret),true);
  assert.equal(await verifyDossierDigest("b".repeat(64),signature,secret),false);
  assert.match(await dossierSigningKeyId(secret),/^fornost-hmac-[a-f0-9]{16}$/);
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
  assert.match(route, /assurance-package-seal/);
  assert.match(route, /assurance-package-verify/);
  assert.match(route, /ai_assurance_packages/);
  assert.match(route, /DENETİM PAKETİNİ MÜHÜRLE/);
  assert.match(route, /ai_exceptions/);
  assert.match(route, /ai_decommission_plans/);
  assert.match(route, /ai_findings/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.doesNotMatch(route, /callAiProvider|runProviderChain/);
  assert.match(ui, /Denetim güvence dosyası/);
  assert.match(ui, /Mühürlü paket oluştur/);
  assert.match(ui, /Sunucuda doğrula/);
  assert.match(css, /dossier-controls/);
  assert.match(readme, /HMAC-SHA-256 sunucu mührü/);
  assert.match(architecture, /server-origin integrity and authenticity seal/);
});
