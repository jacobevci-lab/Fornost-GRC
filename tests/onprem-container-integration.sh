#!/usr/bin/env bash
set -euo pipefail

[[ "${FORNOST_INTEGRATION_TEST:-}" == "1" ]] || {
  echo "Refusing to modify containers without FORNOST_INTEGRATION_TEST=1." >&2
  exit 64
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

[[ ! -e .env.onprem ]] || {
  echo ".env.onprem already exists; integration test will not overwrite it." >&2
  exit 73
}

engine="${FORNOST_CONTAINER_ENGINE:-docker}"
port="${FORNOST_INTEGRATION_PORT:-18443}"
marker="fornost-integration-$(date +%s)"
volume_helper_image="docker.io/library/nginx:1.27-alpine"

cleanup() {
  "${engine}" rm -f fornost-grc-proxy fornost-grc-app >/dev/null 2>&1 || true
  "${engine}" network rm fornost-grc-net >/dev/null 2>&1 || true
  "${engine}" volume rm fornost-grc-data >/dev/null 2>&1 || true
  rm -f .env.onprem
}
trap cleanup EXIT

printf 'FORNOST_BASE_PATH=/fornost-grc\nFORNOST_HTTPS_PORT=%s\n' "${port}" >.env.onprem

FORNOST_CONTAINER_ENGINE="${engine}" bash scripts/linux/install.sh
FORNOST_CONTAINER_ENGINE="${engine}" bash scripts/linux/check.sh

curl --fail --silent --show-error --insecure \
  "https://127.0.0.1:${port}/fornost-grc/api/auth" | grep -q 'bootstrapRequired'

"${engine}" run --rm \
  --volume fornost-grc-data:/data:Z \
  --entrypoint sh \
  "${volume_helper_image}" \
  -c "printf '%s' '${marker}' > /data/integration-marker"

FORNOST_CONTAINER_ENGINE="${engine}" bash scripts/linux/install.sh
FORNOST_CONTAINER_ENGINE="${engine}" bash scripts/linux/check.sh

persisted="$("${engine}" run --rm \
  --volume fornost-grc-data:/data:ro,Z \
  --entrypoint cat \
  "${volume_helper_image}" \
  /data/integration-marker)"
[[ "${persisted}" == "${marker}" ]] || {
  echo "Persistent volume marker was lost after reinstall." >&2
  exit 1
}

echo "On-prem ${engine} integration passed: build, app health, proxy health, API response and persistent data."
