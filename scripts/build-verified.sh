#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
# Vinext does not guarantee that an existing dist directory is pruned. A stale
# client chunk can otherwise survive a successful build and be copied into an
# on-prem image. Always build the deployable artifact from an empty directory.
rm -rf "${SITES_PROJECT_ROOT}/dist"
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

node "${script_dir}/stage-base-path-assets.mjs"
node "${script_dir}/normalize-wrangler-config.mjs"
"${script_dir}/validate-artifact.sh"

if ! grep -Rqs --include='*.js' 'dashboard-hero' "${SITES_PROJECT_ROOT}/dist/client/assets"; then
  echo "Built browser artifact does not contain the current workspace UI contract (dashboard-hero)." >&2
  exit 66
fi
if grep -Rqs --include='*.js' 'cockpit-titlebar' "${SITES_PROJECT_ROOT}/dist/client/assets"; then
  echo "Built browser artifact still contains the retired cockpit UI." >&2
  exit 66
fi
