#!/usr/bin/env bash
# Run in a disposable checkout with dependencies installed. The build pins a test key.
set -euo pipefail
cd "$(dirname "$0")/.."
qa_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  rm -rf -- "$qa_dir"
}
trap cleanup EXIT
port="${FORNOST_LICENSE_QA_PORT:-4219}"
export QA_BOOTSTRAP_TOKEN="$(node -p 'crypto.randomUUID()')"
export QA_SCHEDULER_TOKEN="$(node -p 'crypto.randomUUID()')"
node scripts/issue-license.mjs keygen "$qa_dir/test.pem" "$qa_dir/public.txt"
FORNOST_BUILD_COMMERCIAL=1 FORNOST_LICENSE_PUBLIC_KEY="$(cat "$qa_dir/public.txt")" npm run build
wrangler=(bash scripts/sites-env.sh -- node_modules/.bin/wrangler)
"${wrangler[@]}" d1 migrations apply DB --config wrangler.d1.jsonc --local --persist-to "$qa_dir/db" >"$qa_dir/migrate.log" || { cat "$qa_dir/migrate.log"; exit 1; }
"${wrangler[@]}" dev --config dist/server/wrangler.json --local --persist-to "$qa_dir/db" \
  --ip 127.0.0.1 --port "$port" --inspector-port 0 --show-interactive-dev-session=false \
  --var "FORNOST_BOOTSTRAP_TOKEN:$QA_BOOTSTRAP_TOKEN" --var "FORNOST_SCHEDULER_TOKEN:$QA_SCHEDULER_TOKEN" \
  --var FORNOST_ALLOW_PRIVATE_CONNECTORS:true >"$qa_dir/server.log" 2>&1 &
server_pid=$!
for attempt in {1..60}; do
  if curl --noproxy '*' -fsS --max-time 1 "http://127.0.0.1:$port/api/auth" >/dev/null 2>&1; then break; fi
  kill -0 "$server_pid" || { echo "Local test Worker stopped before startup."; exit 1; }
  sleep 1
done
node scripts/qa-license-journey.mjs "$qa_dir" "$port"
