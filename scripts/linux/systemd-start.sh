#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

engine="$(container_engine)"
base_path="$(read_setting FORNOST_BASE_PATH /fornost-grc)"
https_port="$(read_setting FORNOST_HTTPS_PORT 8443)"

for name in fornost-grc-app fornost-grc-proxy; do
  if ! container_present "${engine}" "${name}"; then
    echo "Required container is missing: ${name}" >&2
    print_runtime_diagnostics "${engine}"
    exit 70
  fi
done

# Start the application first. Starting an already-running container is harmless.
"${engine}" start fornost-grc-app >/dev/null

# Do not expose the reverse proxy until the app can answer locally from inside
# its own container. This removes the reboot race where nginx starts before the
# application has joined the network and opened port 3000.
app_ready=false
for _ in $(seq 1 30); do
  if "${engine}" exec fornost-grc-app \
    curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:3000${base_path}/api/auth" >/dev/null 2>&1; then
    app_ready=true
    break
  fi
  sleep 2
done

if [[ "${app_ready}" != "true" ]]; then
  echo "Fornost GRC application did not become ready before proxy startup." >&2
  print_runtime_diagnostics "${engine}"
  exit 70
fi

"${engine}" start fornost-grc-proxy >/dev/null

if ! wait_for_url "https://127.0.0.1:${https_port}${base_path}/api/auth" 20 2 true; then
  print_runtime_diagnostics "${engine}"
  exit 70
fi

echo "Fornost GRC systemd startup completed successfully."
