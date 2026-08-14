import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeBasePath, withBasePath } from "../app/base-path";

test("on-prem base path is normalized safely", () => {
  assert.equal(normalizeBasePath(undefined), "");
  assert.equal(normalizeBasePath("/"), "");
  assert.equal(normalizeBasePath("//"), "");
  assert.equal(normalizeBasePath("nexora-grc/"), "/nexora-grc");
  assert.equal(normalizeBasePath("/nexora-grc///"), "/nexora-grc");
  assert.equal(withBasePath("https://example.com/file"), "https://example.com/file");
});

test("container deployment isolates workerd from the host glibc", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const installer = await readFile(new URL("../scripts/linux/install.sh", import.meta.url), "utf8");
  const common = await readFile(new URL("../scripts/linux/common.sh", import.meta.url), "utf8");
  assert.match(dockerfile, /node:22-bookworm-slim/);
  assert.match(common, /podman/);
  assert.match(installer, /nexora-grc-data/);
});

test("reverse proxy exposes the configured Nexora path", async () => {
  const nginx = await readFile(new URL("../deploy/nginx/default.conf.template", import.meta.url), "utf8");
  assert.match(nginx, /location \$\{NEXORA_BASE_PATH\}\//);
  assert.match(nginx, /proxy_pass http:\/\/nexora-grc-app:3000/);
});
