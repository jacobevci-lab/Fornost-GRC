import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeBasePath, withBasePath } from "../app/base-path";

test("on-prem base path is normalized safely", () => {
  assert.equal(normalizeBasePath(undefined), "");
  assert.equal(normalizeBasePath("/"), "");
  assert.equal(normalizeBasePath("//"), "");
  assert.equal(normalizeBasePath("fornost-grc/"), "/fornost-grc");
  assert.equal(normalizeBasePath("/fornost-grc///"), "/fornost-grc");
  assert.equal(withBasePath("https://example.com/file"), "https://example.com/file");
});

test("container deployment isolates workerd from the host glibc", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const installer = await readFile(new URL("../scripts/linux/install.sh", import.meta.url), "utf8");
  const common = await readFile(new URL("../scripts/linux/common.sh", import.meta.url), "utf8");
  assert.match(dockerfile, /node:22-bookworm-slim/);
  assert.match(common, /podman/);
  assert.match(installer, /fornost-grc-data/);
  assert.match(installer, /FORNOST_HTTP_PORT=8080/);
  assert.doesNotMatch(installer, /exec fornost-grc-app curl/);
  assert.match(installer, /did not become reachable through the reverse proxy/);
  assert.match(installer, /timeout 10 "\$\{engine\}" logs/);
  assert.match(installer, /wait_for_url/);
});

test("reverse proxy exposes the configured Fornost path", async () => {
  const nginx = await readFile(new URL("../deploy/nginx/default.conf.template", import.meta.url), "utf8");
  assert.match(nginx, /location \$\{FORNOST_BASE_PATH\}\//);
  assert.match(nginx, /proxy_pass http:\/\/fornost-grc-app:3000/);
});

test("RHEL and CentOS Stream guide covers install, validation, update, backup and removal", async () => {
  const guide = await readFile(new URL("../docs/LINUX-INSTALLATION.md", import.meta.url), "utf8");
  for (const required of [
    "Red Hat Enterprise Linux",
    "CentOS Stream",
    "sudo dnf install -y git podman curl firewalld",
    "scripts/linux/install.sh",
    "scripts/linux/check.sh",
    "git pull --ff-only origin main",
    "fornost-grc-data",
    "Kaldırma",
  ]) assert.match(guide, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("repository-facing install files contain no legacy product names", async () => {
  const legacyNames = [
    ["nex", "ora"].join(""),
    ["odi", "ne"].join(""),
    ["ci", "so[-_ ]?grc"].join(""),
  ];
  const legacyPattern = new RegExp(legacyNames.join("|"), "i");
  const files = [
    "../README.md",
    "../docs/LINUX-INSTALLATION.md",
    "../scripts/linux/common.sh",
    "../scripts/linux/install.sh",
    "../scripts/linux/check.sh",
  ];
  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, legacyPattern, `${file} contains a legacy name`);
  }
});
