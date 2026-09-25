import assert from "node:assert/strict";
import test from "node:test";
import {
  domainModuleKey,
  domainModuleLabel,
  domainStatusKey,
  domainStatusLabel,
  legacyModuleName,
  sameDomainModule,
  sameDomainStatus,
} from "../app/domain-identity";

test("localized and legacy module names resolve to stable domain keys", () => {
  assert.equal(domainModuleKey("Kontroller"), "control");
  assert.equal(domainModuleKey("Control Library"), "control");
  assert.equal(domainModuleKey("control"), "control");
  assert.equal(domainModuleKey("Kanıt Kütüphanesi"), "evidence");
  assert.equal(domainModuleKey("Risk Assessment"), "risk");
  assert.equal(domainModuleKey("unknown-module"), null);
});

test("stable module identity preserves current persistence compatibility", () => {
  assert.equal(legacyModuleName("control"), "Kontroller");
  assert.equal(legacyModuleName("Evidence Library"), "Kanıtlar");
  assert.equal(domainModuleLabel("audit", "tr"), "Denetim Yönetimi");
  assert.equal(domainModuleLabel("audit", "en"), "Audit Management");
  assert.equal(sameDomainModule("Kontroller", "Control Library"), true);
  assert.equal(sameDomainModule("Kontroller", "Kanıtlar"), false);
});

test("localized statuses resolve to locale-independent status keys", () => {
  assert.equal(domainStatusKey("Açık"), "open");
  assert.equal(domainStatusKey("Open"), "open");
  assert.equal(domainStatusKey("İyileştirme Gerekli"), "needs-improvement");
  assert.equal(domainStatusKey("Non-Compliant"), "non-compliant");
  assert.equal(domainStatusKey("unknown-status"), null);
});

test("status labels render without changing canonical identity", () => {
  assert.equal(domainStatusLabel("open", "tr"), "Açık");
  assert.equal(domainStatusLabel("Açık", "en"), "Open");
  assert.equal(sameDomainStatus("Kapatıldı", "Closed"), true);
  assert.equal(sameDomainStatus("Açık", "Closed"), false);
});
