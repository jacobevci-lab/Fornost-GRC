#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"

engine="$(container_engine)"
base_path="$(read_setting FORNOST_BASE_PATH /fornost-grc)"
http_port="$(read_setting FORNOST_HTTP_PORT 80)"

"${engine}" ps --filter name=fornost-grc-app --filter name=fornost-grc-proxy
wait_for_url "http://127.0.0.1:${http_port}${base_path}/api/auth" 5 2
echo "Fornost GRC health check passed: http://127.0.0.1:${http_port}${base_path}/api/auth"
