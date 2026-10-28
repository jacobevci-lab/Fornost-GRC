#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

engine="$(container_engine)"

# Stop the public proxy first, then the application.
"${engine}" stop -t 10 fornost-grc-proxy >/dev/null 2>&1 || true
"${engine}" stop -t 20 fornost-grc-app >/dev/null 2>&1 || true
