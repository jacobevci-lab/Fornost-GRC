#!/usr/bin/env bash
set -uo pipefail

token="${FORNOST_SCHEDULER_TOKEN:-}"
base_path="${NEXT_PUBLIC_BASE_PATH:-/fornost-grc}"
port="${PORT:-3000}"
interval="${FORNOST_SCHEDULER_INTERVAL_SECONDS:-300}"

(( ${#token} >= 32 )) || exit 0
[[ "${interval}" =~ ^[0-9]+$ ]] && (( interval >= 60 && interval <= 3600 )) || interval=300

# The application process starts after this companion loop. Initial delay avoids noisy boot failures.
sleep 30
while true; do
  curl --fail --silent --show-error --max-time 240 \
    --header "content-type: application/json" \
    --header "x-fornost-scheduler-token: ${token}" \
    --data '{"action":"run-due"}' \
    "http://127.0.0.1:${port}${base_path}/api/evidence-automation" >/dev/null 2>&1 || true
  sleep "${interval}"
done
