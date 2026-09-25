import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validate } from "../app/api/grc/route";

const quickRisk = {
  title: "Payment API erişilebilirlik riski",
  owner: "Bilgi Güvenliği",
  asset: "Payment API",
};

test("risk intake accepts event, affected asset and owner without inventing assessment scores", () => {
  const result = validate("Risk Assessment", quickRisk);
  if ("error" in result) assert.fail(result.error);
  assert.equal(result.data.status, "Değerlendiriliyor");
  assert.equal(result.data.inherentLikelihood, undefined);
  assert.equal(result.data.inherentImpact, undefined);
  assert.equal(result.data.treatment, undefined);
});

test("risk intake still requires the three business-critical identification fields", () => {
  assert.match(String((validate("Risk Assessment", { ...quickRisk, title: "" }) as { error: string }).error), /title/);
  assert.match(String((validate("Risk Assessment", { ...quickRisk, owner: "" }) as { error: string }).error), /owner/);
  assert.match(String((validate("Risk Assessment", { ...quickRisk, asset: "" }) as { error: string }).error), /asset/);
});

test("risk lifecycle blocks operational states until assessment fields are complete", () => {
  const blocked = validate("Risk Assessment", { ...quickRisk, status: "Açık" }) as { error: string };
  assert.match(blocked.error, /Risk değerlendirmesi tamamlanmadan/);
  assert.match(blocked.error, /category/);
  assert.match(blocked.error, /inherentLikelihood/);
  assert.match(blocked.error, /inherentImpact/);
  assert.match(blocked.error, /treatment/);
  assert.match(blocked.error, /nextReview/);

  const complete = {
    ...quickRisk,
    category: "Siber Güvenlik",
    businessUnit: "BT",
    inherentLikelihood: 3,
    inherentImpact: 5,
    treatment: "Azalt",
    status: "Açık",
    nextReview: "2026-12-31",
  };
  assert.equal("error" in validate("Risk Assessment", complete), false);
});

test("risk form exposes title, affected asset and owner while keeping assessment details progressive", () => {
  const progressiveForm = readFileSync("app/progressive-form-experience.tsx", "utf8");
  assert.match(progressiveForm, /sameDomainModule\(heading, "Risk Assessment"\)/);
  assert.match(progressiveForm, /"başlık \/ ad", "title \/ name", "sahibi", "owner", "ilgili varlık", "related asset"/);
  assert.match(progressiveForm, /Hızlı risk kaydı/);
  assert.match(progressiveForm, /Olay · etkilenen varlık · sahip ile kaydet/);
  assert.match(progressiveForm, /relaxQuickRiskRequirements\(groups\.advanced\)/);
  assert.match(progressiveForm, /restoreQuickRiskRequirements\(groups\.advanced\)/);
});

test("new quick risk primes Under Assessment without overwriting edit-state governance", () => {
  const progressiveForm = readFileSync("app/progressive-form-experience.tsx", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(progressiveForm, /newRecord: \["yeni kayıt", "new record"\]\.includes\(mode\)/);
  assert.match(progressiveForm, /if \(!target\.quickRisk \|\| !target\.newRecord\) return/);
  assert.match(progressiveForm, /const intakeStatus = "Değerlendiriliyor"/);
  assert.match(progressiveForm, /setSelectValue\(status, intakeStatus\)/);
  assert.match(page, /"Risk Assessment": \["Açık", "Değerlendiriliyor", "Aksiyon Devam Ediyor", "Kabul Edildi", "Kapalı"\]/);
});
