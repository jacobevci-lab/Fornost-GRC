import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { constantTimeEqual, demoAccount, PBKDF2_ITERATIONS, requestIsSecure, sameOrigin, validPassword } from "../app/api/auth/security";
import { readFileSync } from "node:fs";
import { decryptSecret, encryptSecret, safeHttpUrl, safeIntegrationConfig, validProvider } from "../app/api/integrations/security";
import { safeSpreadsheetCell } from "../app/export-security";
import { cleanText, validDate, validModule, validate } from "../app/api/grc/route";
import { calculatedRiskScore, effectiveImpact } from "../app/risk-methodology";
import { isCatalogKey } from "../app/catalogs";
import { validCatalogValue } from "../app/api/catalogs/route";

test("password policy accepts strong passwords and rejects weak inputs", () => {
  assert.equal(validPassword("Strong-Passphrase-2026!"), true);
  assert.equal(validPassword("short1!A"), false);
  assert.equal(validPassword("alllowercase-2026!"), false);
  assert.equal(validPassword("NOLOWERCASE-2026!"), false);
  assert.equal(validPassword("NoSpecialCharacter2026"), false);
  assert.equal(validPassword("A".repeat(129) + "1!a"), false);
});

test("password and integration secret fields declare safe autocomplete behavior", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const settings = readFileSync("app/settings.tsx", "utf8");
  const integrations = readFileSync("app/integration-settings.tsx", "utf8");
  const evidenceAutomation = readFileSync("app/evidence-automation.tsx", "utf8");
  assert.match(page, /\? "new-password"\s*: "off"/);
  assert.match(settings, /type==="password"\?"new-password":undefined/g);
  assert.match(integrations, /type="password" autoComplete="new-password"/);
  assert.match(evidenceAutomation, /type="password" autoComplete="new-password"/);
});

test("public demo editor account is non-admin and exposes no credential",()=>{
 assert.equal(demoAccount.role,"Editor");
 assert.match(demoAccount.email,/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
 assert.equal("password" in demoAccount,false);
});

test("PBKDF2 cost stays within the Cloudflare runtime limit",()=>{
 assert.equal(PBKDF2_ITERATIONS,100_000);
});

test("constant-time comparison handles equal, unequal and different-length inputs", () => {
  assert.equal(constantTimeEqual("abc123", "abc123"), true);
  assert.equal(constantTimeEqual("abc123", "abc124"), false);
  assert.equal(constantTimeEqual("abc", "abc0"), false);
});

test("same-origin validation honors the external HTTPS host and port behind the on-prem proxy", () => {
  const proxied = new NextRequest("http://fornost-grc-app:3000/fornost-grc/api/auth", {
    headers: {
      origin: "https://192.0.2.10:8443",
      "x-forwarded-host": "192.0.2.10:8443",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(sameOrigin(proxied), true);
  assert.equal(requestIsSecure(proxied), true);
});

test("same-origin validation still rejects a different browser origin", () => {
  const proxied = new NextRequest("http://fornost-grc-app:3000/fornost-grc/api/auth", {
    headers: {
      origin: "https://evil.example",
      "x-forwarded-host": "192.0.2.10:8443",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(sameOrigin(proxied), false);
});

test("date validation rejects calendar-invalid dates", () => {
  assert.equal(validDate("2026-02-28"), true);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-13-01"), false);
  assert.equal(validDate("11.08.2026"), false);
});

test("module allowlist rejects unknown modules", () => {
  assert.equal(validModule("Risk Assessment"), true);
  assert.equal(validModule("Denetim Yönetimi"), true);
  assert.equal(validModule("../../admin"), false);
});

test("risk validation enforces required fields and score boundaries", () => {
  const validRisk = {
    title: "Test riski", businessUnit: "BT", owner: "Bilgi Güvenliği",
    category: "Siber Güvenlik", asset: "Microsoft Entra ID",
    inherentLikelihood: 3, inherentImpact: 5, treatment: "Azalt",
    confidentialityImpact: 4, integrityImpact: 5, availabilityImpact: 3,
    status: "Açık", nextReview: "2026-12-31",
  };
  assert.deepEqual(validate("Risk Assessment", validRisk), { module: "Risk Assessment", data: validRisk });
  assert.match(String((validate("Risk Assessment", { ...validRisk, inherentImpact: 6 }) as {error:string}).error), /1-5/);
  assert.match(String((validate("Risk Assessment", { ...validRisk, confidentialityImpact: 0 }) as {error:string}).error), /1-5/);
  assert.match(String((validate("Risk Assessment", { ...validRisk, title: "" }) as {error:string}).error), /title/);
  assert.match(String((validate("Risk Assessment", { ...validRisk, asset: "" }) as {error:string}).error), /asset/);
});

test("catalog allowlist and values reject unknown or unsafe master data", () => {
  assert.equal(isCatalogKey("riskCategories"), true);
  assert.equal(isCatalogKey("adminRoles"), false);
  assert.equal(validCatalogValue("Yeni Kategori"), true);
  assert.equal(validCatalogValue("x"), false);
  assert.equal(validCatalogValue("x".repeat(101)), false);
});

test("CIA high-water mark drives the effective impact without double counting", () => {
  const risk = { inherentLikelihood: 4, inherentImpact: 2, confidentialityImpact: 3, integrityImpact: 5, availabilityImpact: 4 };
  assert.equal(effectiveImpact(risk), 5);
  assert.equal(calculatedRiskScore(risk), 20);
  assert.equal(calculatedRiskScore({ inherentLikelihood: 3, inherentImpact: 4 }), 12);
});

test("audit validation enforces progress and chronological dates", () => {
  const audit = {
    auditName: "ISO 27001", auditType: "Dış Denetim", auditOwner: "BG",
    startDate: "2026-09-10", endDate: "2026-09-12", requirementRef: "A.5.1",
    requirementTitle: "Politikalar", owner: "BG", businessUnit: "BT",
    dueDate: "2026-09-08", status: "Devam Ediyor", progress: 50,
  };
  assert.equal("error" in validate("Denetim Yönetimi", audit), false);
  assert.match(String((validate("Denetim Yönetimi", { ...audit, progress: 101 }) as {error:string}).error), /0-100/);
  assert.match(String((validate("Denetim Yönetimi", { ...audit, endDate: "2026-09-01" }) as {error:string}).error), /bitiş tarihi/);
});

test("text cleaning trims and caps untrusted values", () => {
  assert.equal(cleanText("  test  "), "test");
  assert.equal(cleanText("abcdef", 3), "abc");
  assert.equal(cleanText(42), 42);
});

test("integration provider allowlist rejects arbitrary connector types", () => {
  assert.equal(validProvider("jira"), true);
  assert.equal(validProvider("ldaps"), true);
  assert.equal(validProvider("shell-command"), false);
});

test("connector URL validation blocks insecure and local SSRF targets", () => {
  assert.equal(safeHttpUrl("https://company.atlassian.net"), "https://company.atlassian.net/");
  assert.equal(safeHttpUrl("http://company.example"), null);
  assert.equal(safeHttpUrl("https://127.0.0.1/api"), null);
  assert.equal(safeHttpUrl("https://169.254.169.254/latest/meta-data"), null);
  assert.equal(safeHttpUrl("https://192.168.1.20/hook"), null);
  assert.equal(safeHttpUrl("https://[::ffff:127.0.0.1]/hook"), null);
  assert.equal(safeHttpUrl("http://192.168.1.20/hook", true), "http://192.168.1.20/hook");
});

test("integration config refuses secret-like plaintext fields", () => {
  assert.deepEqual(safeIntegrationConfig({baseUrl:"https://example.com",apiToken:"leak",password:"leak",enabled:true}),{baseUrl:"https://example.com",enabled:true});
});

test("integration secrets use authenticated encryption", async () => {
  const key="test-only-key-material-with-at-least-32-characters";
  const encrypted=await encryptSecret("super-secret-token",key);
  assert.notEqual(encrypted,"super-secret-token");
  assert.equal(await decryptSecret(encrypted,key),"super-secret-token");
  await assert.rejects(()=>decryptSecret(encrypted,"different-test-key-material-with-32-characters"));
});

test("spreadsheet exports neutralize formula injection", () => {
  assert.equal(safeSpreadsheetCell("=WEBSERVICE(\"https://attacker\")"), "'=WEBSERVICE(\"https://attacker\")");
  assert.equal(safeSpreadsheetCell("  @SUM(1,1)"), "'  @SUM(1,1)");
  assert.equal(safeSpreadsheetCell("Normal value"), "Normal value");
});
