#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

engine="$(container_engine)"
require_command flock
exec 9>"${project_root}/.fornost-maintenance.lock"
flock -n 9 || { echo "Another installation or recovery operation is in progress." >&2; exit 75; }
# Podman monitor processes can inherit descriptors; release the shared lock explicitly.
trap 'flock -u 9' EXIT
data_volume="${FORNOST_DATA_VOLUME:-$(read_setting FORNOST_DATA_VOLUME fornost-grc-data)}"
[[ "${data_volume}" =~ ^fornost-grc-[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$ ]] || { echo "Invalid data volume." >&2; exit 64; }
purge_data="false"
[[ "${1:-}" == "--purge-data" ]] && purge_data="true"
[[ $# -le 1 ]] || { echo "Usage: $0 [--purge-data]" >&2; exit 64; }

"${engine}" rm -f fornost-grc-proxy fornost-grc-app >/dev/null 2>&1 || true
"${engine}" network rm fornost-grc-net >/dev/null 2>&1 || true
"${engine}" rmi localhost/fornost-grc-app:latest >/dev/null 2>&1 || true

if [[ "${purge_data}" == "true" ]]; then
  [[ "${FORNOST_CONFIRM_PURGE:-}" == "DELETE" ]] || {
    echo "Data purge refused. Set FORNOST_CONFIRM_PURGE=DELETE to remove ${data_volume}." >&2
    exit 77
  }
  "${engine}" volume rm "${data_volume}"
  echo "Fornost GRC runtime and persistent application data were removed."
else
  echo "Fornost GRC runtime was removed. Persistent volume ${data_volume} was preserved."
fi
