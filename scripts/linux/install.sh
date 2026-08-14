#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_root}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer supports Linux only." >&2
  exit 69
fi

required_commands=(awk bash curl flock getconf git grep sha256sum tar timeout xz)
missing=()
for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null 2>&1 || missing+=("${command_name}")
done
if ((${#missing[@]})); then
  echo "Missing operating-system tools: ${missing[*]}" >&2
  echo "Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y curl git coreutils util-linux xz-utils" >&2
  echo "RHEL/Fedora: sudo dnf install -y curl git coreutils util-linux xz" >&2
  exit 69
fi

node_is_supported() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1);
  ' >/dev/null 2>&1
}

install_project_node() {
  local machine node_arch glibc_version glibc_major glibc_minor
  local runtime_root node_root download_dir checksums archive archive_name extracted

  machine="$(uname -m)"
  case "${machine}" in
    x86_64) node_arch="x64" ;;
    aarch64|arm64) node_arch="arm64" ;;
    *)
      echo "Automatic Node.js installation supports x86_64 and arm64; found ${machine}." >&2
      exit 69
      ;;
  esac

  if ! glibc_version="$(getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}')"; then
    echo "A glibc-based Linux distribution is required (Ubuntu 20.04+, Debian 10+, RHEL/Rocky/Alma 8+)." >&2
    exit 69
  fi
  glibc_major="${glibc_version%%.*}"
  glibc_minor="${glibc_version#*.}"
  if ((glibc_major < 2 || (glibc_major == 2 && glibc_minor < 28))); then
    echo "Node.js 22 requires glibc >=2.28; found ${glibc_version}." >&2
    echo "Upgrade the operating system to Ubuntu 20.04+, Debian 10+, or RHEL/Rocky/Alma 8+ and rerun setup." >&2
    exit 69
  fi

  runtime_root="${project_root}/.sites-runtime"
  node_root="${runtime_root}/node"
  download_dir="$(mktemp -d "${TMPDIR:-/tmp}/nexora-node.XXXXXX")"
  checksums="${download_dir}/SHASUMS256.txt"

  echo "Installing a project-local Node.js 22 LTS runtime..."
  curl --fail --location --silent --show-error \
    --output "${checksums}" \
    https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
  archive_name="$(awk -v arch="${node_arch}" '$2 ~ ("node-v[0-9.]+-linux-" arch "\\.tar\\.xz$") { print $2; exit }' "${checksums}")"
  [[ -n "${archive_name}" ]] || {
    echo "Could not resolve the latest official Node.js 22 archive." >&2
    exit 69
  }
  archive="${download_dir}/${archive_name}"
  curl --fail --location --silent --show-error \
    --output "${archive}" \
    "https://nodejs.org/dist/latest-v22.x/${archive_name}"
  (cd "${download_dir}" && grep " ${archive_name}$" SHASUMS256.txt | sha256sum --check --status)

  extracted="${download_dir}/${archive_name%.tar.xz}"
  tar -xJf "${archive}" -C "${download_dir}"
  rm -rf "${node_root}.new"
  mkdir -p "${runtime_root}"
  mv "${extracted}" "${node_root}.new"
  rm -rf "${node_root}"
  mv "${node_root}.new" "${node_root}"
  rm -rf "${download_dir}"
  export PATH="${node_root}/bin:${PATH}"
  hash -r
}

if ! node_is_supported; then
  echo "Node.js >=22.13.0 is required; found $(node --version 2>/dev/null || echo 'not installed')."
  install_project_node
fi

node_is_supported || {
  echo "Node.js installation did not provide a supported runtime." >&2
  exit 69
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is unavailable after Node.js installation." >&2
  exit 69
}
echo "Using Node.js $(node --version) and npm $(npm --version)."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example."
fi

echo "Installing locked dependencies..."
npm run install:ci

echo "Running quality checks and production build..."
npm run lint
npm test

echo "Preparing persistent local D1/R2 storage..."
npm run db:local:migrate

cat <<'EOF'

Nexora GRC is ready.

Start in the foreground:
  npm run serve:linux

Then open:
  http://SERVER_IP:3000

Optional systemd service:
  sudo bash scripts/linux/install-systemd.sh
EOF
