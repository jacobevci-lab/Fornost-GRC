import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const installer = readFileSync("scripts/linux/install.sh", "utf8");
const envExample = readFileSync(".env.onprem.example", "utf8");

test("on-prem installer reads and exports AI private endpoint flags", () => {
  assert.match(installer, /read_setting FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS false/);
  assert.match(installer, /read_setting FORNOST_AI_ALLOW_LOOPBACK false/);
  assert.match(installer, /export FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=/);
  assert.match(installer, /export FORNOST_AI_ALLOW_LOOPBACK=/);
});

test("application container receives AI network policy flags", () => {
  assert.match(installer, /--env FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS \\/);
  assert.match(installer, /--env FORNOST_AI_ALLOW_LOOPBACK \\/);
});

test("loopback policy cannot be enabled without private endpoint policy", () => {
  assert.match(installer, /FORNOST_AI_ALLOW_LOOPBACK=true requires FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true/);
});

test("on-prem environment example keeps AI network access disabled by default", () => {
  assert.match(envExample, /FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=false/);
  assert.match(envExample, /FORNOST_AI_ALLOW_LOOPBACK=false/);
});
