#!/usr/bin/env bash
set -Eeuo pipefail

repository="${FORNOST_REPOSITORY:-https://github.com/jacobevci-lab/Fornost-GRC.git}"
branch="${FORNOST_BRANCH:-main}"
install_dir="${FORNOST_INSTALL_DIR:-/opt/fornost-grc}"

[[ "$(uname -s)" == "Linux" ]] || { echo "This installer supports Linux only." >&2; exit 69; }
[[ "$(id -u)" == "0" ]] || {
  echo "Quick installation requires root. Pipe the script to: sudo bash" >&2
  exit 77
}
[[ "${install_dir}" == /* && "${install_dir}" != "/" ]] || {
  echo "FORNOST_INSTALL_DIR must be an absolute directory other than /." >&2
  exit 64
}
[[ "${branch}" =~ ^[A-Za-z0-9._/-]+$ && "${branch}" != *".."* ]] || {
  echo "FORNOST_BRANCH contains unsupported characters." >&2
  exit 64
}

install_git() {
  if command -v git >/dev/null 2>&1; then
    return
  fi
  echo "Installing Git..."
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y git
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y git
  else
    echo "Install Git and rerun this command; neither dnf nor apt-get is available." >&2
    exit 69
  fi
}

install_git

if [[ -e "${install_dir}" ]]; then
  [[ -d "${install_dir}/.git" ]] || {
    echo "Installation path exists but is not a Git checkout: ${install_dir}" >&2
    echo "Move that directory aside or choose FORNOST_INSTALL_DIR=/another/path." >&2
    exit 73
  }
  [[ -z "$(git -C "${install_dir}" status --porcelain)" ]] || {
    echo "Installation checkout contains local changes: ${install_dir}" >&2
    echo "Commit or move those changes before updating; nothing was overwritten." >&2
    exit 73
  }
  origin_url="$(git -C "${install_dir}" remote get-url origin)"
  [[ "${origin_url%.git}" == "${repository%.git}" ]] || {
    echo "Installation checkout points to a different repository: ${origin_url}" >&2
    exit 73
  }
  echo "Updating the existing Fornost GRC checkout..."
  git -C "${install_dir}" fetch --prune origin "${branch}"
  git -C "${install_dir}" checkout "${branch}"
  git -C "${install_dir}" merge --ff-only "origin/${branch}"
else
  install -d -m 755 "$(dirname "${install_dir}")"
  echo "Downloading Fornost GRC..."
  git clone --branch "${branch}" --single-branch "${repository}" "${install_dir}"
fi

echo "Starting the verified container installation..."
FORNOST_PROJECT_ROOT="${install_dir}" bash "${install_dir}/scripts/linux/bootstrap.sh"

echo
echo "Fornost GRC is installed. Future updates use the same quick-install command."
