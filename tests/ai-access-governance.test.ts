import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  accessAttention,
  accessRisk,
  validateAiAccess,
} from "../app/ai/access-governance";
test("AI access risk scoring raises privileged and weakly controlled identities", () => {
  assert.deepEqual(
    accessRisk({
      principalType: "user",
      accessLevel: "admin",
      dataScope: "Restricted",
      mfa: false,
      conditionalAccess: false,
      jit: false,
      managedIdentity: false,
      keyRotationDays: 90,
    }),
    { score: 10, tier: "Critical" },
  );
  assert.deepEqual(
    accessRisk({
      principalType: "user",
      accessLevel: "use",
      dataScope: "Internal",
      mfa: true,
      conditionalAccess: true,
      jit: true,
      managedIdentity: false,
      keyRotationDays: 90,
    }),
    { score: 1, tier: "Low" },
  );
  assert.equal(
    accessRisk({
      principalType: "service-account",
      accessLevel: "manage",
      dataScope: "Confidential",
      mfa: false,
      conditionalAccess: false,
      jit: false,
      managedIdentity: false,
      keyRotationDays: 180,
    }).tier,
    "Critical",
  );
});
test("AI access validation rejects invalid identity controls and lifecycle dates", () => {
  const input = {
    modelId: "AIM-1",
    principalType: "user",
    principal: "analyst@example.com",
    displayName: "AI Analyst",
    accessLevel: "manage",
    dataScope: "Confidential risk records",
    purpose: "Review model risk and evidence",
    owner: "ciso@example.com",
    mfa: true,
    conditionalAccess: true,
    jit: true,
    managedIdentity: false,
    keyRotationDays: 90,
    lastUsed: "2027-01-01",
    expiresAt: "2027-12-31",
    reviewDate: "2027-06-01",
  };
  assert.equal(validateAiAccess(input, "2027-02-01").tier, "Medium");
  assert.throws(
    () => validateAiAccess({ ...input, lastUsed: "2027-02-02" }, "2027-02-01"),
    /gelecekte/,
  );
  assert.throws(
    () =>
      validateAiAccess(
        { ...input, principalType: "service-account", mfa: true },
        "2027-02-01",
      ),
    /managed identity/,
  );
  assert.throws(
    () => validateAiAccess({ ...input, keyRotationDays: 0 }, "2027-02-01"),
    /1–365/,
  );
});
test("access review queue detects inactivity, expiry and overdue certification", () => {
  const base = {
    status: "active",
    principalType: "user",
    lastUsed: "2027-01-15",
    expiresAt: "2027-12-01",
    reviewDate: "2027-06-01",
  };
  assert.equal(accessAttention(base, "2027-02-01"), "current");
  assert.equal(
    accessAttention({ ...base, lastUsed: "2026-01-01" }, "2027-02-01"),
    "inactive",
  );
  assert.equal(
    accessAttention({ ...base, reviewDate: "2027-01-01" }, "2027-02-01"),
    "review-overdue",
  );
  assert.equal(
    accessAttention({ ...base, expiresAt: "2027-01-01" }, "2027-02-01"),
    "expired",
  );
});
test("AI access API enforces maker-checker, strong privileged access and safe export", async () => {
  const [route, migration, storage, ui, copilot, layout] = await Promise.all([
    readFile("app/api/ai/access-governance/route.ts", "utf8"),
    readFile("drizzle/0050_fornost_ai_access_governance.sql", "utf8"),
    readFile("app/ai/storage.ts", "utf8"),
    readFile("app/fornost-ai-access-governance.tsx", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(route, /oluşturan kişi aynı erişimi onaylayamaz/);
  assert.match(route, /MFA ve Conditional Access gerektirir/);
  assert.match(route, /managed identity veya en fazla 90 günlük/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(migration, /ai_access_model_principal_idx/);
  assert.match(storage, /aiAccessAssignmentsSql/);
  assert.match(ui, /AI Erişim ve Yetki İnceleme Merkezi/);
  assert.match(copilot, /AI Erişim/);
  assert.match(copilot, /tab === "access"/);
  assert.match(layout, /fornost-ai-access-governance\.css/);
});
