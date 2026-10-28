#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

[[ "$(uname -s)" == "Linux" ]] || { echo "This bootstrap supports Linux only." >&2; exit 69; }

skip_packages="${FORNOST_SKIP_PACKAGE_INSTALL:-false}"
skip_firewall="${FORNOST_SKIP_FIREWALL:-false}"
skip_systemd="${FORNOST_SKIP_SYSTEMD:-false}"

if [[ "${skip_packages}" != "true" ]]; then
  [[ "$(id -u)" == "0" ]] || {
    echo "Package installation requires root. Run: sudo bash scripts/linux/bootstrap.sh" >&2
    exit 77
  }
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y git podman curl openssl firewalld
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y git podman curl openssl
  else
    echo "Supported package manager not found. Install Git, Podman, curl and OpenSSL manually." >&2
    exit 69
  fi
fi

engine="${FORNOST_CONTAINER_ENGINE:-podman}"

if [[ "${skip_firewall}" != "true" ]] && command -v firewall-cmd >/dev/null 2>&1; then
  require_command systemctl
  systemctl enable --now firewalld
  zone="$(firewall-cmd --get-default-zone)"
  https_port="$(read_setting FORNOST_HTTPS_PORT 8443)"
  firewall-cmd --permanent --zone="${zone}" --add-port="${https_port}/tcp"
  firewall-cmd --reload
fi

if [[ "${engine}" == "podman" ]] && command -v systemctl >/dev/null 2>&1; then
  systemctl enable podman-restart.service >/dev/null 2>&1 || true
fi

FORNOST_CONTAINER_ENGINE="${engine}" bash "${script_dir}/install.sh"
FORNOST_CONTAINER_ENGINE="${engine}" bash "${script_dir}/check.sh"

# On a real systemd host, install a Fornost-specific boot unit that starts the
# application first, waits for readiness, and only then exposes nginx. CI and
# containerized smoke tests can opt out with FORNOST_SKIP_SYSTEMD=true.
if [[ "${skip_systemd}" != "true" ]] \
  && [[ "$(id -u)" == "0" ]] \
  && command -v systemctl >/dev/null 2>&1 \
  && [[ -d /run/systemd/system ]]; then
  FORNOST_CONTAINER_ENGINE="${engine}" bash "${script_dir}/install-systemd-service.sh"
fi

echo "Fornost GRC clean bootstrap completed successfully."
