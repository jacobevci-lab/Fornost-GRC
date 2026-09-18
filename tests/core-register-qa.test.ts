import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  displayRecordCode,
  formatRecordCode,
  isLegacyTechnicalRecordId,
} from "../app/record-codes";

test("business-facing register codes stay short and sequential", () => {
  assert.equal(formatRecordCode("Risk Assessment", 1), "RSK-001");
  assert.equal(formatRecordCode("Varlık Envanteri", 42), "AST-042");
  assert.equal(formatRecordCode("Kanıtlar", 1000), "EVD-1000");
  assert.equal(
    displayRecordCode({
      id: "RSK-03dbebc9-c6fb-49e9-8fa0-cc145d70c797",
      code: "RSK-002",
    }),
    "RSK-002",
  );
  assert.equal(
    isLegacyTechnicalRecordId(
      "RSK-03dbebc9-c6fb-49e9-8fa0-cc145d70c797",
    ),
    true,
  );
  assert.throws(() => formatRecordCode("BIA", 0), /pozitif/);
});

test("core registers persist public codes and keep internal IDs hidden", async () => {
  const [route, page, layout] = await Promise.all([
    readFile("app/api/grc/route.ts", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("app/layout-guardrails.css", "utf8"),
  ]);
  assert.match(route, /simple_grc_record_codes/);
  assert.match(route, /simple_grc_record_code_counters/);
  assert.match(route, /record_code:/);
  assert.match(page, /displayRecordCode\(r\)/);
  assert.match(page, /requiredFieldsByModule/);
  assert.match(page, /statusOptionsByModule/);
  assert.match(page, /canDelete=\{currentUser\.role === "Admin"\}/);
  assert.match(page, /disabled=\{saving\} aria-busy=\{saving\}/);
  assert.match(page, /setRows\(\[\]\)/);
  assert.doesNotMatch(
    page,
    /status:\s*\[\s*"Aktif",\s*"Açık",\s*"Başlanmadı"/,
  );
  assert.match(layout, /\.register-search>span\{position:static!important/);
  assert.match(layout, /\.form input,\.form select,\.form textarea/);
});

test("shared forms use explicit operational states instead of vague labels", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  const formOptions = page.slice(
    page.indexOf("const select: Record<string, string[]>"),
    page.indexOf("const value = form"),
  );
  assert.match(page, /"Uygulama Hazırlığında"/);
  assert.match(page, /"İnceleme Takviminde"/);
  assert.match(formOptions, /auditorResult:\s*\[[\s\S]*?"Değerlendirilmedi"/);
  assert.doesNotMatch(formOptions, /"Test Bekliyor"/);
});
