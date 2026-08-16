#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

engine="$(container_engine)"
purge_data="false"
[[ "${1:-}" == "--purge-data" ]] && purge_data="true"
[[ $# -le 1 ]] || { echo "Usage: $0 [--purge-data]" >&2; exit 64; }

"${engine}" rm -f fornost-grc-proxy fornost-grc-app >/dev/null 2>&1 || true
"${engine}" network rm fornost-grc-net >/dev/null 2>&1 || true
"${engine}" rmi localhost/fornost-grc-app:latest >/dev/null 2>&1 || true

if [[ "${purge_data}" == "true" ]]; then
  [[ "${FORNOST_CONFIRM_PURGE:-}" == "DELETE" ]] || {
    echo "Data purge refused. Set FORNOST_CONFIRM_PURGE=DELETE to remove fornost-grc-data." >&2
    exit 77
  }
  "${engine}" volume rm fornost-grc-data
  echo "Fornost GRC runtime and persistent application data were removed."
else
  echo "Fornost GRC runtime was removed. Persistent volume fornost-grc-data was preserved."
fi
