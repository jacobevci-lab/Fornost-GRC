import assert from "node:assert/strict";
import test from "node:test";
import {
  domainModuleKey,
  domainModuleSearchLabels,
  sameDomainModule,
} from "../app/domain-identity";

test("admin integration modules resolve across Turkish and English labels", () => {
  assert.equal(domainModuleKey("İş Akışı Entegrasyonları"), "workflow-integrations");
  assert.equal(domainModuleKey("Workflow Integrations"), "workflow-integrations");
  assert.equal(domainModuleKey("E-posta ve Bildirimler"), "email-notifications");
  assert.equal(domainModuleKey("Email & Notifications"), "email-notifications");
  assert.equal(domainModuleKey("Kimlik ve Erişim"), "identity-access");
  assert.equal(domainModuleKey("Identity & Access"), "identity-access");
});

test("shared navigation search labels include both UI languages for admin modules", () => {
  assert.deepEqual(
    domainModuleSearchLabels("İş Akışı Entegrasyonları"),
    ["İş Akışı Entegrasyonları", "Workflow Integrations", "Integrations", "Entegrasyonlar"],
  );
  assert.ok(domainModuleSearchLabels("Kimlik ve Erişim").includes("Identity & Access"));
  assert.ok(domainModuleSearchLabels("E-posta ve Bildirimler").includes("Email & Notifications"));
});

test("sameDomainModule treats bilingual admin labels as the same destination", () => {
  assert.equal(sameDomainModule("İş Akışı Entegrasyonları", "Workflow Integrations"), true);
  assert.equal(sameDomainModule("Kimlik ve Erişim", "Identity & Access"), true);
  assert.equal(sameDomainModule("E-posta ve Bildirimler", "Email & Notifications"), true);
});
