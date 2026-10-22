#!/usr/bin/env bash
set -euo pipefail

audit_log="$(mktemp)"
trap 'rm -f "${audit_log}"' EXIT
for attempt in 1 2 3; do
  set +e
  # Bound npm's network waits as well as the complete attempt.
  timeout 90s npm audit --omit=dev --audit-level=high --fetch-timeout=20000 --fetch-retries=1 2>&1 | tee "${audit_log}"
  audit_status=${PIPESTATUS[0]}
  set -e
  if [[ ${audit_status} -eq 0 ]]; then
    exit 0
  fi
  # GNU timeout can terminate npm before it emits a network error.
  if [[ ${audit_status} -eq 124 ]] || grep -Eqi '503 Service Unavailable|audit endpoint returned an error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up' "${audit_log}"; then
    if [[ ${attempt} -lt 3 ]]; then
      echo "Transient npm audit service failure (exit ${audit_status}); retrying (${attempt}/3)."
      sleep $((attempt * 5))
      continue
    fi
    echo "npm audit service remained unavailable after 3 attempts." >&2
  fi
  # Unavailable service and vulnerability findings both fail the gate.
  exit "${audit_status}"
done
