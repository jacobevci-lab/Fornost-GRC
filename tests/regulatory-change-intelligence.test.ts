import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nextSourceReview,
  regulatoryAttention,
  validateImpactAction,
  validateRegulatoryChange,
  validateRegulatoryImpact,
  validateRegulatorySource,
} from "../app/regulatory-intelligence/domain";

test("regulatory source and change validation enforce bounded governance fields", () => {
  assert.deepEqual(
    validateRegulatorySource({
      name: "Official Gazette",
      authority: "Regulator",
      jurisdiction: "Türkiye",
      sourceType: "regulator",
      owner: "OWNER@EXAMPLE.COM",
      reviewFrequencyDays: 30,
      url: "https://example.com/regulations",
    }),
    {
      name: "Official Gazette",
      authority: "Regulator",
      jurisdiction: "Türkiye",
      sourceType: "regulator",
      owner: "owner@example.com",
      reviewFrequencyDays: 30,
      url: "https://example.com/regulations",
    },
  );
  assert.equal(nextSourceReview(7, new Date("2027-01-01T00:00:00.000Z")), "2027-01-08T00:00:00.000Z");
  assert.throws(() => validateRegulatorySource({ name: "A", authority: "B", jurisdiction: "TR", sourceType: "feed", owner: "x", reviewFrequencyDays: 0 }), /zorunludur|Geçerli/);

  const change = validateRegulatoryChange({
    sourceId: "REGSRC-1",
    externalRef: "2027/42",
    title: "Material regulatory amendment",
    summary: "A detailed summary describing the material control change.",
    publishedDate: "2027-01-01",
    effectiveDate: "2027-03-01",
    severity: "high",
    changeType: "amendment",
    owner: "owner@example.com",
    reviewer: "reviewer@example.com",
  }, "2027-01-02");
  assert.equal(change.lateIntake, false);
  assert.throws(() => validateRegulatoryChange({ ...change, reviewer: "owner@example.com" }, "2027-01-02"), /farklı/);
  assert.throws(() => validateRegulatoryChange({ ...change, publishedDate: "2027-04-01" }, "2027-01-02"), /önce olamaz/);
});

test("regulatory impacts enforce effective dates, evidence integrity and explicit confirmations", () => {
  const impact = validateRegulatoryImpact({
    changeId: "REGCHG-1",
    targetType: "control",
    targetRef: "CTRL-42",
    targetTitle: "Access review control",
    impactLevel: "critical",
    requiredAction: "Update the control design and operating procedure.",
    actionOwner: "control@example.com",
    dueDate: "2027-02-15",
  }, "2027-03-01", "2027-01-02");
  assert.equal(impact.targetType, "control");
  assert.throws(() => validateRegulatoryImpact({ ...impact, dueDate: "2027-03-02" }, "2027-03-01", "2027-01-02"), /aşamaz/);
  assert.throws(() => validateImpactAction({ action: "submit", note: "Ready for review", confirmation: "DOĞRULAMAYA GÖNDER", evidenceReference: "EV-1", evidenceSha256: "abc" }), /SHA-256/);
  assert.deepEqual(validateImpactAction({ action: "verify", note: "Evidence independently verified", confirmation: "ETKİYİ DOĞRULA", evidenceReference: "EV-2", evidenceSha256: "a".repeat(64) }), {
    action: "verify",
    note: "Evidence independently verified",
    evidenceReference: "EV-2",
    evidenceSha256: "a".repeat(64),
  });
});

test("attention queue prioritizes overdue, critical and near-effective changes", () => {
  const now = new Date("2027-01-01T12:00:00.000Z");
  assert.equal(regulatoryAttention("implementation", "high", "2026-12-31", 1, now), "overdue");
  assert.equal(regulatoryAttention("implementation", "critical", "2027-06-01", 1, now), "critical");
  assert.equal(regulatoryAttention("impact-assessment", "high", "2027-01-07", 1, now), "due-7");
  assert.equal(regulatoryAttention("closed", "critical", "2026-12-31", 2, now), "closed");
});

test("regulatory intelligence is wired through schema, API, UI, navigation and documentation", async () => {
  const [route, migration, schema, ui, page, readme, docs] = await Promise.all([
    readFile("app/api/regulatory-intelligence/route.ts", "utf8"),
    readFile("drizzle/0068_regulatory_change_intelligence.sql", "utf8"),
    readFile("db/schema.ts", "utf8"),
    readFile("app/regulatory-intelligence.tsx", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("README.md", "utf8"),
    readFile("docs/REGULATORY-CHANGE-INTELLIGENCE.md", "utf8"),
  ]);
  assert.match(route, /safeHttpUrl/);
  assert.match(route, /content_sha256/);
  assert.match(route, /regulatory-change-export/);
  assert.match(route, /Kapanış yalnız atanmış bağımsız doğrulayıcı/);
  assert.match(route, /Aksiyonu yalnız atanmış sorumlu veya Admin ilerletebilir/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(migration, /regulatory_change_events/);
  assert.match(migration, /regulatory_impacts_target_idx/);
  assert.match(schema, /regulatoryIntelligenceSources/);
  assert.match(schema, /regulatoryChangeImpacts/);
  assert.match(ui, /Regülasyon Merkezi/);
  assert.match(ui, /Etki ve Aksiyonlar/);
  assert.match(page, /RegulatoryIntelligence/);
  assert.match(page, /Regülasyon Merkezi/);
  assert.match(readme, /Regulatory Change Intelligence/);
  assert.match(docs, /maker-checker/);
});
