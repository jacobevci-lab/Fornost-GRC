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
  assert.equal("error" in result, false);
  assert.equal("data" in result ? result.data.status : "", "Değerlendiriliyor");
  assert.equal("data" in result ? result.data.inherentLikelihood : undefined, undefined);
  assert.equal("data" in result ? result.data.inherentImpact : undefined, undefined);
  assert.equal("data" in result ? result.data.treatment : undefined, undefined);
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

test("risk form exposes quick intake while keeping the detailed assessment progressively available", () => {
  const progressiveForm = readFileSync("app/progressive-form-experience.tsx", "utf8");
  assert.match(progressiveForm, /sameDomainModule\(heading, "Risk Assessment"\)/);
  assert.match(progressiveForm, /Hızlı risk kaydı/);
  assert.match(progressiveForm, /Olay · etkilenen varlık · sahip ile kaydet/);
  assert.match(progressiveForm, /relaxQuickRiskRequirements\(groups\.advanced\)/);
  assert.match(progressiveForm, /restoreQuickRiskRequirements\(groups\.advanced\)/);
});
