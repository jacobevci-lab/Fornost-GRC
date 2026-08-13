#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_root}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer supports Linux only." >&2
  exit 69
fi

required_commands=(bash curl flock git sha256sum timeout)
missing=()
for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null 2>&1 || missing+=("${command_name}")
done
if ((${#missing[@]})); then
  echo "Missing operating-system tools: ${missing[*]}" >&2
  echo "Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y curl git coreutils util-linux" >&2
  echo "RHEL/Fedora: sudo dnf install -y curl git coreutils util-linux" >&2
  exit 69
fi

command -v node >/dev/null 2>&1 || {
  echo "Node.js >=22.13.0 is required. Install Node.js 22 LTS and rerun this command." >&2
  exit 69
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required. Install it with Node.js 22 LTS and rerun this command." >&2
  exit 69
}

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Node.js >=22.13.0 is required; found ${process.version}.`);
  process.exit(1);
}'

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

