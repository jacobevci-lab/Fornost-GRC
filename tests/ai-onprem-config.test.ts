import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const installer = readFileSync("scripts/linux/install.sh", "utf8");
const server = readFileSync("scripts/linux/serve.sh", "utf8");
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
  assert.match(server, /--var "FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS:\$\{FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS:-false\}"/);
  assert.match(server, /--var "FORNOST_AI_ALLOW_LOOPBACK:\$\{FORNOST_AI_ALLOW_LOOPBACK:-false\}"/);
});

test("on-prem installer preserves a dedicated assurance package signing key", () => {
  assert.match(installer, /read_setting FORNOST_DOSSIER_SIGNING_KEY/);
  assert.match(installer, /dossier-signing\.key/);
  assert.match(installer, /--env FORNOST_DOSSIER_SIGNING_KEY \\/);
  assert.match(server, /--var "FORNOST_DOSSIER_SIGNING_KEY:/);
  assert.match(envExample, /FORNOST_DOSSIER_SIGNING_KEY=/);
});

test("loopback policy cannot be enabled without private endpoint policy", () => {
  assert.match(installer, /FORNOST_AI_ALLOW_LOOPBACK=true requires FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true/);
});

test("on-prem environment example keeps AI network access disabled by default", () => {
  assert.match(envExample, /FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=false/);
  assert.match(envExample, /FORNOST_AI_ALLOW_LOOPBACK=false/);
});
