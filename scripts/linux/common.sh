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
  local url="$1" attempts="${2:-30}" delay="${3:-2}" insecure="${4:-false}" index
  local -a curl_args=(--fail --silent --show-error --max-time 5)
  [[ "${insecure}" == "true" ]] && curl_args+=(--insecure)
  for ((index = 1; index <= attempts; index++)); do
    if curl "${curl_args[@]}" "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done
  echo "Health check failed after ${attempts} attempts: ${url}" >&2
  return 1
}

resolve_project_path() {
  local path="$1"
  if [[ "${path}" == /* ]]; then
    printf '%s' "${path}"
  else
    printf '%s/%s' "${project_root}" "${path}"
  fi
}

default_state_dir() {
  if [[ "$(id -u)" == "0" ]]; then
    printf '%s' /var/lib/fornost-grc
  else
    printf '%s/fornost-grc' "${XDG_DATA_HOME:-${HOME}/.local/share}"
  fi
}

container_present() {
  local engine="$1" name="$2"
  "${engine}" inspect "${name}" >/dev/null 2>&1
}

print_runtime_diagnostics() {
  local engine="$1" name
  echo "Container state:" >&2
  timeout 10 "${engine}" ps -a --filter name=fornost-grc >&2 || true
  for name in fornost-grc-app fornost-grc-proxy; do
    if container_present "${engine}" "${name}"; then
      echo "${name} logs:" >&2
      timeout 10 "${engine}" logs --tail 120 "${name}" >&2 || true
    fi
  done
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

existing_path() {
  local path="$1"
  while [[ ! -e "${path}" && "${path}" != "/" ]]; do
    path="$(dirname "${path}")"
  done
  printf '%s' "${path}"
}

filesystem_id() {
  local path
  path="$(existing_path "$1")"
  df -Pk "${path}" | awk 'NR == 2 {print $1}'
}

filesystem_available_mb() {
  local path
  path="$(existing_path "$1")"
  df -Pk "${path}" | awk 'NR == 2 {printf "%d", $4 / 1024}'
}

require_free_space_mb() {
  local path="$1" required_mb="$2" purpose="$3" available_mb
  available_mb="$(filesystem_available_mb "${path}")"
  [[ "${available_mb}" =~ ^[0-9]+$ ]] || {
    echo "Could not determine free disk space for ${path}." >&2
    return 74
  }
  if ((available_mb < required_mb)); then
    echo "Insufficient disk space for ${purpose}." >&2
    echo "Filesystem path: ${path}" >&2
    echo "Available: ${available_mb} MiB; required: ${required_mb} MiB." >&2
    df -hP "$(existing_path "${path}")" >&2 || true
    echo "Increase the filesystem or free space, then rerun the same installer command." >&2
    return 28
  fi
}

container_storage_root() {
  local engine="$1" root=""
  if [[ "${engine}" == "podman" ]]; then
    root="$("${engine}" info --format '{{.Store.GraphRoot}}' 2>/dev/null || true)"
    if [[ -z "${root}" ]]; then
      if [[ "$(id -u)" == "0" ]]; then
        root="/var/lib/containers/storage"
      else
        root="${XDG_DATA_HOME:-${HOME}/.local/share}/containers/storage"
      fi
    fi
  else
    root="$("${engine}" info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
    root="${root:-/var/lib/docker}"
  fi
  printf '%s' "${root}"
}
