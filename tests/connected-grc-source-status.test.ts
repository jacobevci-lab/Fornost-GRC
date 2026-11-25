import assert from "node:assert/strict";
import test from "node:test";
import { connectedSourceIssueText } from "../app/connected-grc-source-status";

test("source status identifies the affected module and recovery reason in both languages", () => {
  assert.equal(connectedSourceIssueText({ key: "policy", reason: "timeout" }, "tr"), "Politika Merkezi: Yanıt süresi aşıldı");
  assert.equal(connectedSourceIssueText({ key: "aiModels", reason: "incomplete" }, "en"), "AI model inventory: Dataset is incomplete");
  assert.match(connectedSourceIssueText({ key: "findings", reason: "access" }, "en"), /permission required/);
});
