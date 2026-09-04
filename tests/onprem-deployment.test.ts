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
  const integration = await readFile(new URL("./onprem-container-integration.sh", import.meta.url), "utf8");
  const common = await readFile(new URL("../scripts/linux/common.sh", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../scripts/linux/bootstrap.sh", import.meta.url), "utf8");
  const quickInstall = await readFile(new URL("../scripts/linux/quick-install.sh", import.meta.url), "utf8");
  assert.match(dockerfile, /node:22-bookworm-slim/);
  assert.match(common, /podman/);
  assert.match(installer, /fornost-grc-data/);
  assert.match(installer, /FORNOST_HTTPS_PORT=8443/);
  assert.doesNotMatch(installer, /exec fornost-grc-app curl/);
  assert.doesNotMatch(integration, /exec fornost-grc-app/);
  assert.match(integration, /--entrypoint sh/);
  assert.match(installer, /did not become reachable through the reverse proxy/);
  assert.match(installer, /timeout 10 "\$\{engine\}" logs/);
  assert.match(installer, /wait_for_url/);
  assert.match(installer, /installation failed during/);
  assert.match(installer, /default_state_dir/);
  assert.match(installer, /disk capacity preflight/);
  assert.match(installer, /FORNOST_MIN_FREE_MB/);
  assert.match(installer, /previously downloaded and checksum-verified image bundle/);
  assert.match(installer, /still being published; waiting for GitHub Release/);
  assert.match(installer, /FORNOST_RELEASE_WAIT_ATTEMPTS/);
  assert.match(bootstrap, /dnf install -y git podman curl openssl firewalld/);
  assert.match(bootstrap, /scripts\/linux\/check\.sh|check\.sh/);
  assert.match(quickInstall, /\/opt\/fornost-grc/);
  assert.match(quickInstall, /status --porcelain/);
  assert.match(quickInstall, /merge --ff-only/);
  assert.match(quickInstall, /scripts\/linux\/bootstrap\.sh/);
});

test("built runtime config is accepted by current Wrangler", async () => {
  const generatedConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );
  assert.equal("legacy_env" in generatedConfig, false);
});

test("reverse proxy exposes the configured Fornost path", async () => {
  const nginx = await readFile(new URL("../deploy/nginx/default.conf.template", import.meta.url), "utf8");
  const installer = await readFile(new URL("../scripts/linux/install.sh", import.meta.url), "utf8");
  const integration = await readFile(new URL("./onprem-container-integration.sh", import.meta.url), "utf8");
  assert.match(nginx, /location \$\{FORNOST_BASE_PATH\}\//);
  assert.match(nginx, /set \$fornost_backend "http:\/\/\$\{FORNOST_BACKEND_IP\}:3000"/);
  assert.doesNotMatch(nginx, /resolver \$\{FORNOST_DNS_RESOLVER\}/);
  assert.match(nginx, /proxy_pass \$fornost_backend/);
  assert.match(nginx, /location \$\{FORNOST_BASE_PATH\}\/assets\//);
  assert.match(nginx, /rewrite \^\$\{FORNOST_BASE_PATH\}\/assets\/\(\.\*\)\$ \/assets\/\$1 break/);
  assert.match(nginx, /listen 8443 ssl default_server/);
  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3/);
  assert.match(nginx, /ssl_certificate \/etc\/nginx\/fornost-tls\.crt/);
  assert.match(nginx, /map \$host \$fornost_host_allowed/);
  assert.match(nginx, /if \(\$fornost_host_allowed = 0\)/);
  assert.match(nginx, /return 421/);
  assert.equal((nginx.match(/proxy_set_header Host fornost-grc-app:3000/g) || []).length, 2);
  assert.doesNotMatch(nginx, /proxy_set_header Host \$http_host/);
  assert.match(installer, /FORNOST_ALLOWED_HOST_PATTERN/);
  assert.match(installer, /FORNOST_BACKEND_IP=\$\{backend_ip\}/);
  assert.match(installer, /NetworkSettings\.Networks/);
  assert.match(integration, /\/fornost-grc\/assets\/\[\^" \]\*\\\.css/);
  assert.match(integration, /\/fornost-grc\/assets\/\[\^" \]\*\\\.js/);
  assert.match(integration, /browser_assets/);
});

test("reverse proxy enforces security and privacy headers on every response", async () => {
  const nginx = await readFile(new URL("../deploy/nginx/default.conf.template", import.meta.url), "utf8");
  for (const header of [
    "Cache-Control",
    "Content-Security-Policy",
    "Referrer-Policy",
    "Permissions-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "Strict-Transport-Security",
  ]) assert.match(nginx, new RegExp(`add_header ${header} .* always;`));
  assert.match(nginx, /frame-ancestors 'none'/);
  assert.match(nginx, /script-src-attr 'none'/);
  assert.doesNotMatch(nginx, /unsafe-eval/);
});

test("Podman install refreshes the product network before recreating containers", async () => {
  const installer = await readFile(new URL("../scripts/linux/install.sh", import.meta.url), "utf8");
  assert.match(installer, /Podman runtime network refresh/);
  assert.match(installer, /network rm "\$\{network\}"/);
  assert.match(installer, /network create "\$\{network\}"/);
});

test("RHEL and supported CentOS Stream guide covers easy install, validation, update, backup and removal", async () => {
  const guide = await readFile(new URL("../docs/LINUX-INSTALLATION.md", import.meta.url), "utf8");
  for (const required of [
    "Red Hat Enterprise Linux",
    "CentOS Stream",
    "CentOS Stream 8",
    "8 GiB",
    "quick-install.sh | sudo bash",
    "sudo dnf install -y git podman curl openssl firewalld",
    "scripts/linux/bootstrap.sh",
    "scripts/linux/check.sh",
    "git pull --ff-only origin main",
    "fornost-grc-data",
    "Kaldırma",
  ]) assert.match(guide, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("on-prem defaults to HTTPS 8443 with generated or configured TLS", async () => {
  const installer = await readFile(new URL("../scripts/linux/install.sh", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.onprem.example", import.meta.url), "utf8");
  const guide = await readFile(new URL("../docs/LINUX-INSTALLATION.md", import.meta.url), "utf8");
  assert.match(example, /FORNOST_HTTPS_PORT=8443/);
  assert.doesNotMatch(example, /FORNOST_HTTP_PORT/);
  assert.match(installer, /openssl req -x509/);
  assert.match(installer, /FORNOST_TLS_CERT_FILE/);
  assert.match(installer, /https:\/\/127\.0\.0\.1/);
  assert.match(guide, /https:\/\/192\.168\.1\.1:8443\/fornost-grc\//);
  assert.match(guide, /kendinden imzalı/i);
});

test("clean uninstall preserves data unless purge is explicitly confirmed", async () => {
  const uninstall = await readFile(new URL("../scripts/linux/uninstall.sh", import.meta.url), "utf8");
  assert.match(uninstall, /volume fornost-grc-data was preserved/);
  assert.match(uninstall, /FORNOST_CONFIRM_PURGE/);
  assert.match(uninstall, /--purge-data/);
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
