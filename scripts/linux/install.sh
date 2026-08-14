#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${script_dir}/common.sh"
cd "${project_root}"

[[ "$(uname -s)" == "Linux" ]] || { echo "This installer supports Linux only." >&2; exit 69; }
require_command curl
require_command timeout

if [[ ! -f "${env_file}" ]]; then
  cp .env.onprem.example "${env_file}"
  echo "Created .env.onprem with the default /fornost-grc address path."
fi

base_path="$(read_setting FORNOST_BASE_PATH /fornost-grc)"
http_port="$(read_setting FORNOST_HTTP_PORT 80)"

[[ "${base_path}" =~ ^/[A-Za-z0-9][A-Za-z0-9/_-]*$ && "${base_path}" != *".."* ]] || {
  echo "FORNOST_BASE_PATH must be a safe path such as /fornost-grc." >&2
  exit 64
}
[[ "${http_port}" =~ ^[0-9]+$ ]] && ((http_port >= 1 && http_port <= 65535)) || {
  echo "FORNOST_HTTP_PORT must be between 1 and 65535." >&2
  exit 64
}

engine="$(container_engine)"
image="localhost/fornost-grc-app:latest"
network="fornost-grc-net"
data_volume="fornost-grc-data"

if ((http_port < 1024)) && [[ "$(id -u)" != "0" ]]; then
  echo "Port ${http_port} requires root privileges." >&2
  echo "Run: sudo bash scripts/linux/install.sh" >&2
  echo "Or set FORNOST_HTTP_PORT=8080 in .env.onprem for a rootless installation." >&2
  exit 77
fi

"${engine}" info >/dev/null

echo "Building Fornost GRC in a glibc-compatible container runtime..."
"${engine}" build \
  --build-arg "NEXT_PUBLIC_BASE_PATH=${base_path}" \
  --tag "${image}" \
  "${project_root}"

"${engine}" network inspect "${network}" >/dev/null 2>&1 || "${engine}" network create "${network}" >/dev/null
"${engine}" volume inspect "${data_volume}" >/dev/null 2>&1 || "${engine}" volume create "${data_volume}" >/dev/null
"${engine}" pull docker.io/library/nginx:1.27-alpine >/dev/null

"${engine}" rm -f fornost-grc-proxy fornost-grc-app >/dev/null 2>&1 || true

"${engine}" run -d \
  --name fornost-grc-app \
  --network "${network}" \
  --restart unless-stopped \
  --env "NEXT_PUBLIC_BASE_PATH=${base_path}" \
  --env FORNOST_DEMO_MODE=false \
  --volume "${data_volume}:/app/.sites-runtime/data:Z" \
  "${image}" >/dev/null

"${engine}" run -d \
  --name fornost-grc-proxy \
  --network "${network}" \
  --restart unless-stopped \
  --publish "${http_port}:80" \
  --env "FORNOST_BASE_PATH=${base_path}" \
  --volume "${project_root}/deploy/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro,Z" \
  docker.io/library/nginx:1.27-alpine >/dev/null

echo "Verifying the externally reachable Fornost GRC endpoint..."
wait_for_url "http://127.0.0.1:${http_port}${base_path}/api/auth" 30 2 || {
  echo "Fornost GRC did not become reachable through the reverse proxy." >&2
  echo "Application container state:" >&2
  timeout 10 "${engine}" inspect fornost-grc-app >&2 || true
  echo "Application container logs:" >&2
  timeout 10 "${engine}" logs --tail 100 fornost-grc-app >&2 || true
  echo "Reverse proxy container state:" >&2
  timeout 10 "${engine}" inspect fornost-grc-proxy >&2 || true
  echo "Reverse proxy container logs:" >&2
  timeout 10 "${engine}" logs --tail 100 fornost-grc-proxy >&2 || true
  exit 70
}

ip="$(server_ip)"
port_suffix=""
[[ "${http_port}" == "80" ]] || port_suffix=":${http_port}"

cat <<EOF

Fornost GRC installation is running.

Initial setup address:
  http://${ip:-SERVER_IP}${port_suffix}${base_path}/

The first browser visit opens the initial administrator creation screen.
Persistent application data is stored in the ${data_volume} container volume.
Health check passed: http://127.0.0.1:${http_port}${base_path}/api/auth
EOF
