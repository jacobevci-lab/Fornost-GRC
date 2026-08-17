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
state_dir="${repo_root}/.fornost-integration-state"

runtime_diagnostics() {
  echo "===== ${engine} container state =====" >&2
  "${engine}" ps -a --filter name=fornost-grc >&2 || true
  echo "===== fornost-grc-app logs =====" >&2
  "${engine}" logs --tail 250 fornost-grc-app >&2 || true
  echo "===== fornost-grc-proxy logs =====" >&2
  "${engine}" logs --tail 250 fornost-grc-proxy >&2 || true
}

cleanup() {
  "${engine}" rm -f fornost-grc-proxy fornost-grc-app >/dev/null 2>&1 || true
  "${engine}" network rm fornost-grc-net >/dev/null 2>&1 || true
  "${engine}" volume rm fornost-grc-data >/dev/null 2>&1 || true
  rm -f .env.onprem
  rm -rf "${state_dir}"
}
trap cleanup EXIT

cleanup

printf 'FORNOST_BASE_PATH=/fornost-grc\nFORNOST_HTTPS_PORT=%s\n' "${port}" >.env.onprem

FORNOST_CONTAINER_ENGINE="${engine}" \
FORNOST_STATE_DIR="${state_dir}" \
FORNOST_SKIP_PACKAGE_INSTALL=true \
FORNOST_SKIP_FIREWALL=true \
FORNOST_APP_BUNDLE_FILE="${FORNOST_APP_BUNDLE_FILE:-}" \
FORNOST_BUILD_LOCAL="${FORNOST_BUILD_LOCAL:-false}" \
  bash scripts/linux/bootstrap.sh

for name in fornost-grc-app fornost-grc-proxy; do
  [[ "$("${engine}" inspect --format '{{.State.Running}}' "${name}")" == "true" ]] || {
    echo "Fresh bootstrap did not leave ${name} running." >&2
    runtime_diagnostics
    exit 1
  }
done

auth_get_file="$(mktemp)"
auth_get_status="$(curl --silent --show-error --insecure \
  --output "${auth_get_file}" --write-out '%{http_code}' \
  "https://127.0.0.1:${port}/fornost-grc/api/auth")"
if [[ "${auth_get_status}" != "200" ]] || ! grep -q 'bootstrapRequired' "${auth_get_file}"; then
  echo "Auth GET through HTTPS proxy returned ${auth_get_status}; response follows." >&2
  cat "${auth_get_file}" >&2 || true
  echo >&2
  runtime_diagnostics
  rm -f "${auth_get_file}"
  exit 1
fi
rm -f "${auth_get_file}"

auth_probe_file="$(mktemp)"
auth_probe_status="$(curl --silent --show-error --insecure \
  --output "${auth_probe_file}" --write-out '%{http_code}' \
  --header "Origin: https://127.0.0.1:${port}" \
  --header 'Content-Type: application/json' \
  --data '{"action":"invalid-integration-probe"}' \
  "https://127.0.0.1:${port}/fornost-grc/api/auth")"
[[ "${auth_probe_status}" == "400" ]] || {
  echo "Same-origin auth POST through HTTPS proxy returned ${auth_probe_status}, expected 400." >&2
  cat "${auth_probe_file}" >&2
  runtime_diagnostics
  rm -f "${auth_probe_file}"
  exit 1
}
rm -f "${auth_probe_file}"

cross_origin_status="$(curl --silent --show-error --insecure \
  --output /dev/null --write-out '%{http_code}' \
  --header 'Origin: https://evil.example' \
  --header 'Content-Type: application/json' \
  --data '{"action":"invalid-integration-probe"}' \
  "https://127.0.0.1:${port}/fornost-grc/api/auth")"
[[ "${cross_origin_status}" == "403" ]] || {
  echo "Cross-origin auth POST returned ${cross_origin_status}, expected 403." >&2
  runtime_diagnostics
  exit 1
}

page_file="$(mktemp)"
page_status=""
for attempt in $(seq 1 15); do
  page_status="$(curl --silent --show-error --insecure \
    --output "${page_file}" --write-out '%{http_code}' \
    "https://127.0.0.1:${port}/fornost-grc/")"
  [[ "${page_status}" == "200" ]] && break
  sleep 1
done
if [[ "${page_status}" != "200" ]]; then
  echo "Rendered on-prem page did not become stable; last HTTP status was ${page_status}." >&2
  cat "${page_file}" >&2 || true
  echo >&2
  runtime_diagnostics
  rm -f "${page_file}"
  exit 1
fi
grep -q '/fornost-grc/assets/[^" ]*\.css' "${page_file}"
grep -q '/fornost-grc/assets/[^" ]*\.js' "${page_file}"
mapfile -t browser_assets < <(
  grep -Eo '(href|src)="[^"]+"' "${page_file}" \
    | cut -d'"' -f2 \
    | grep '^/fornost-grc/' \
    | sort -u
)
rm -f "${page_file}"
(( ${#browser_assets[@]} > 0 )) || {
  echo "Rendered on-prem page did not reference any browser assets." >&2
  runtime_diagnostics
  exit 1
}
for asset_path in "${browser_assets[@]}"; do
  curl --fail --silent --show-error --insecure \
    "https://127.0.0.1:${port}${asset_path}" >/dev/null
done

"${engine}" run --rm \
  --volume fornost-grc-data:/data:Z \
  --entrypoint sh \
  "${volume_helper_image}" \
  -c "printf '%s' '${marker}' > /data/integration-marker"

FORNOST_CONTAINER_ENGINE="${engine}" \
FORNOST_STATE_DIR="${state_dir}" \
FORNOST_APP_BUNDLE_FILE="${FORNOST_APP_BUNDLE_FILE:-}" \
FORNOST_BUILD_LOCAL="${FORNOST_BUILD_LOCAL:-false}" \
  bash scripts/linux/install.sh
FORNOST_CONTAINER_ENGINE="${engine}" FORNOST_STATE_DIR="${state_dir}" bash scripts/linux/check.sh

persisted="$("${engine}" run --rm \
  --volume fornost-grc-data:/data:ro,Z \
  --entrypoint cat \
  "${volume_helper_image}" \
  /data/integration-marker)"
[[ "${persisted}" == "${marker}" ]] || {
  echo "Persistent volume marker was lost after reinstall." >&2
  runtime_diagnostics
  exit 1
}

echo "On-prem ${engine} clean bootstrap passed: empty runtime, verified image install, two running containers, HTTPS page assets, same-origin auth POST and API, plus reinstall data persistence."
