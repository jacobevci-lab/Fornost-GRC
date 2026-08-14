#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"
engine="$(container_engine)"
"${engine}" ps --filter name=nexora-grc-app --filter name=nexora-grc-proxy
