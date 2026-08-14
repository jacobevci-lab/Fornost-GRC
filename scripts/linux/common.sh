#!/usr/bin/env bash
set -euo pipefail

project_root="${FORNOST_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
env_file="${project_root}/.env.onprem"

read_setting() {
  local key="$1" fallback="$2" value
  value="$(awk -F= -v wanted="${key}" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "${env_file}" 2>/dev/null || true)"
  printf '%s' "${value:-${fallback}}"
}

container_engine() {
  if [[ -n "${FORNOST_CONTAINER_ENGINE:-}" ]]; then
    [[ "${FORNOST_CONTAINER_ENGINE}" == "podman" || "${FORNOST_CONTAINER_ENGINE}" == "docker" ]] || {
      echo "FORNOST_CONTAINER_ENGINE must be podman or docker." >&2
      exit 64
    }
    command -v "${FORNOST_CONTAINER_ENGINE}" >/dev/null 2>&1 || {
      echo "Configured container engine is not installed: ${FORNOST_CONTAINER_ENGINE}" >&2
      exit 69
    }
    printf '%s' "${FORNOST_CONTAINER_ENGINE}"
    return
  fi
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

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required." >&2
    exit 69
  }
}

wait_for_url() {
  local url="$1" attempts="${2:-30}" delay="${3:-2}" index
  for ((index = 1; index <= attempts; index++)); do
    if curl --fail --silent --show-error --max-time 5 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done
  echo "Health check failed after ${attempts} attempts: ${url}" >&2
  return 1
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}
