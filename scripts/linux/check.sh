#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

engine="$(container_engine)"
base_path="$(read_setting FORNOST_BASE_PATH /fornost-grc)"
https_port="$(read_setting FORNOST_HTTPS_PORT 8443)"

"${engine}" ps --filter name=fornost-grc-app --filter name=fornost-grc-proxy
for name in fornost-grc-app fornost-grc-proxy; do
  if ! container_present "${engine}" "${name}"; then
    echo "Required container is missing: ${name}" >&2
    print_runtime_diagnostics "${engine}"
    echo "Run the clean installer: sudo bash scripts/linux/bootstrap.sh" >&2
    exit 70
  fi
  running="$("${engine}" inspect --format '{{.State.Running}}' "${name}")"
  [[ "${running}" == "true" ]] || {
    echo "Required container is not running: ${name}" >&2
    print_runtime_diagnostics "${engine}"
    exit 70
  }
done
wait_for_url "https://127.0.0.1:${https_port}${base_path}/api/auth" 5 2 true
echo "Fornost GRC health check passed: https://127.0.0.1:${https_port}${base_path}/api/auth"
