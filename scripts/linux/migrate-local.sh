#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_root}"

[[ -f dist/server/wrangler.json ]] || {
  echo "Build output is missing. Run npm run build first." >&2
  exit 69
}

status=0
timeout 20s bash scripts/sites-env.sh -- \
  node_modules/.bin/wrangler dev \
  --config dist/server/wrangler.json \
  --ip 127.0.0.1 \
  --port 0 \
  --inspector-port 0 \
  --local \
  --persist-to .sites-runtime/data \
  --show-interactive-dev-session=false >/dev/null 2>&1 || status=$?

if [[ "${status}" != "124" && "${status}" != "0" ]]; then
  echo "Local D1/R2 initialization failed." >&2
  exit "${status}"
fi
echo "Local D1/R2 storage is ready under .sites-runtime/data."
