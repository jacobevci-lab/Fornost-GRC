#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${project_root}/.env.onprem"

read_setting() {
  local key="$1" fallback="$2" value
  value="$(awk -F= -v wanted="${key}" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "${env_file}" 2>/dev/null || true)"
  printf '%s' "${value:-${fallback}}"
}

container_engine() {
  if command -v podman >/dev/null 2>&1; then
    printf '%s' podman
  elif command -v docker >/dev/null 2>&1; then
    printf '%s' docker
  else
    echo "Podman or Docker is required." >&2
    echo "RHEL/Rocky/Alma: sudo dnf install -y podman" >&2
    echo "Ubuntu/Debian: install Docker Engine or Podman, then rerun setup." >&2
    exit 69
  fi
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}
