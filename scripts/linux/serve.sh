#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_root}"

[[ -f dist/server/wrangler.json ]] || {
  echo "Build output is missing. Run npm run build first." >&2
  exit 69
}

host="${HOST:-0.0.0.0}"
port="${PORT:-3000}"

exec bash scripts/sites-env.sh -- \
  node_modules/.bin/wrangler dev \
  --config dist/server/wrangler.json \
  --ip "${host}" \
  --port "${port}" \
  --inspector-port 0 \
  --local \
  --persist-to .sites-runtime/data \
  --var "FORNOST_DEMO_MODE:${FORNOST_DEMO_MODE:-false}" \
  --show-interactive-dev-session=false
